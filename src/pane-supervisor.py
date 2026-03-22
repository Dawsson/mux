#!/usr/bin/env python3
import json
import os
import pty
import selectors
import signal
import sys
import termios
import time
import tty
from pathlib import Path


def now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


class PaneSupervisor:
    def __init__(self) -> None:
        self.session = require_env("ZELLIJ_SESSION_NAME")
        self.pane_id = int(require_env("ZELLIJ_PANE_ID"))
        self.runtime_dir = Path(f"/tmp/mux-{self.session}")
        self.assignment_path = self.runtime_dir / "assignments" / f"{self.pane_id}.json"
        self.command_path = self.runtime_dir / "commands" / f"{self.pane_id}.ndjson"
        self.state_path = self.runtime_dir / "states" / f"{self.pane_id}.json"
        self.assignment = None
        self.log_handle = None
        self.master_fd = None
        self.child_pid = None
        self.command_offset = 0
        self.stdin_fd = sys.stdin.fileno()
        self.stdout_fd = sys.stdout.fileno()
        self.stdin_was_tty = os.isatty(self.stdin_fd)
        self.original_termios = None
        self.state = {
            "paneId": self.pane_id,
            "paneName": f"pane-{self.pane_id}",
            "windowName": "unknown",
            "status": "booting",
            "updatedAt": now(),
            "startedAt": now(),
        }

    def run(self) -> None:
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        signal.signal(signal.SIGTERM, self.handle_sigterm)

        self.wait_for_assignment()
        self.assignment = self.read_json(self.assignment_path)
        self.state["paneName"] = self.assignment["paneName"]
        self.state["windowName"] = self.assignment["windowName"]
        self.log_handle = open(self.assignment["logPath"], "ab", buffering=0)
        self.command_path.parent.mkdir(parents=True, exist_ok=True)
        self.command_path.touch(exist_ok=True)
        self.command_offset = self.command_path.stat().st_size

        self.enable_raw_input()
        self.spawn_shell()
        self.send_bytes((self.assignment["cmd"] + "\r").encode())
        self.state["status"] = "running"
        self.state["currentCommand"] = self.assignment["cmd"]
        self.persist_state()

        selector = selectors.DefaultSelector()
        selector.register(self.master_fd, selectors.EVENT_READ, "pty")
        if self.stdin_was_tty:
            selector.register(self.stdin_fd, selectors.EVENT_READ, "stdin")

        try:
            while True:
                self.poll_commands()
                self.reap_child_if_needed()
                for key, _ in selector.select(timeout=0.1):
                    if key.data == "pty":
                        self.handle_pty_output()
                    elif key.data == "stdin":
                        self.handle_stdin()
        finally:
            self.restore_input_mode()

    def handle_sigterm(self, _signum, _frame) -> None:
        self.terminate_child()
        self.restore_input_mode()
        raise SystemExit(0)

    def wait_for_assignment(self) -> None:
        while not self.assignment_path.exists():
            time.sleep(0.05)

    def enable_raw_input(self) -> None:
        if not self.stdin_was_tty:
            return
        self.original_termios = termios.tcgetattr(self.stdin_fd)
        tty.setraw(self.stdin_fd)

    def restore_input_mode(self) -> None:
        if self.stdin_was_tty and self.original_termios is not None:
            termios.tcsetattr(self.stdin_fd, termios.TCSADRAIN, self.original_termios)
            self.original_termios = None

    def spawn_shell(self) -> None:
        if self.master_fd is not None:
            os.close(self.master_fd)

        shell = os.environ.get("SHELL", "/bin/sh")
        pid, master_fd = pty.fork()
        if pid == 0:
            os.chdir(self.assignment["cwd"])
            os.environ["TERM"] = os.environ.get("TERM", "xterm-256color")
            os.execvp(shell, [shell, "-i"])

        self.child_pid = pid
        self.master_fd = master_fd
        self.state["childPid"] = pid
        self.state["status"] = "running"
        self.persist_state()

    def terminate_child(self) -> None:
        if self.child_pid is None:
            return
        try:
            os.kill(self.child_pid, signal.SIGHUP)
        except ProcessLookupError:
            pass

    def reap_child_if_needed(self) -> None:
        if self.child_pid is None:
            return
        try:
            pid, status = os.waitpid(self.child_pid, os.WNOHANG)
        except ChildProcessError:
            pid, status = self.child_pid, 0

        if pid == 0:
            return

        self.child_pid = None
        self.state["status"] = "stopped"
        self.state["lastExitCode"] = os.waitstatus_to_exitcode(status)
        self.state["updatedAt"] = now()
        self.persist_state()

    def handle_pty_output(self) -> None:
        try:
            data = os.read(self.master_fd, 65536)
        except OSError:
            data = b""

        if not data:
            return

        self.log_handle.write(data)
        os.write(self.stdout_fd, data)

    def handle_stdin(self) -> None:
        try:
            data = os.read(self.stdin_fd, 4096)
        except OSError:
            data = b""

        if data:
            self.send_bytes(data)

    def send_bytes(self, data: bytes) -> None:
        if self.master_fd is None or not data:
            return
        os.write(self.master_fd, data)

    def poll_commands(self) -> None:
        size = self.command_path.stat().st_size
        if size <= self.command_offset:
            return

        with open(self.command_path, "rb") as handle:
            handle.seek(self.command_offset)
            chunk = handle.read()
        self.command_offset = size

        for line in chunk.splitlines():
            if not line.strip():
                continue
            command = json.loads(line)
            self.handle_command(command)

    def handle_command(self, command: dict) -> None:
        command_type = command.get("type")
        if command_type == "run":
            self.ensure_shell()
            payload = command["command"]
            self.state["currentCommand"] = payload
            self.state["status"] = "running"
            self.persist_state()
            self.send_bytes((payload + "\r").encode())
            return

        if command_type == "keys":
            self.ensure_shell()
            self.send_bytes(self.map_keys(command["keys"]))
            return

        if command_type == "restart":
            self.ensure_shell()
            self.send_bytes(b"\x03")
            time.sleep(0.2)
            self.state["currentCommand"] = self.assignment["cmd"]
            self.state["status"] = "running"
            self.persist_state()
            self.send_bytes((self.assignment["cmd"] + "\r").encode())
            return

    def ensure_shell(self) -> None:
        if self.child_pid is None:
            self.spawn_shell()

    def map_keys(self, keys: str) -> bytes:
        normalized = keys.strip()
        key_map = {
            "C-c": b"\x03",
            "C-d": b"\x04",
            "Enter": b"\r",
            "Tab": b"\t",
            "Esc": b"\x1b",
        }
        return key_map.get(normalized, keys.encode())

    def persist_state(self) -> None:
        self.state["updatedAt"] = now()
        self.write_json(self.state_path, self.state)

    @staticmethod
    def read_json(path: Path):
        return json.loads(path.read_text())

    @staticmethod
    def write_json(path: Path, value) -> None:
        path.write_text(json.dumps(value, indent=2) + "\n")


if __name__ == "__main__":
    PaneSupervisor().run()
