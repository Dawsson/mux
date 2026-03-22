#!/usr/bin/env bun
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import {
  type PaneAssignment,
  type PaneState,
  getAssignmentPath,
  getLogPath,
  getStatePath,
  readAssignment,
  writeState,
} from "./runtime";

type QueueCommand =
  | { type: "run"; command: string }
  | { type: "restart" }
  | { type: "keys"; keys: string };

const START_TOKEN = "__MUX_CMD_START__";
const END_TOKEN = "__MUX_CMD_END__";

function now(): string {
  return new Date().toISOString();
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

class PaneSupervisor {
  private readonly session = requireEnv("ZELLIJ_SESSION_NAME");
  private readonly paneId = Number(requireEnv("ZELLIJ_PANE_ID"));
  private readonly assignmentPath = getAssignmentPath(this.session, this.paneId);
  private readonly shellPath = process.env.SHELL || "/bin/sh";
  private assignment!: PaneAssignment;
  private state!: PaneState;
  private commandOffset = 0;
  private commandSequence = 0;
  private shell: Bun.Subprocess<"pipe", "pipe", "pipe"> | null = null;
  private shellStdoutBuffer = "";
  private shellStderrBuffer = "";
  private logPath = "";
  private commandPath = "";

  async run(): Promise<void> {
    await this.waitForAssignment();
    this.assignment = readAssignment(this.session, this.paneId);
    this.logPath = this.assignment.logPath;
    this.commandPath = this.assignment.commandPath;

    mkdirSync(this.assignment.cwd, { recursive: true });
    if (!existsSync(this.commandPath)) writeFileSync(this.commandPath, "", "utf8");

    this.state = {
      paneId: this.paneId,
      paneName: this.assignment.paneName,
      windowName: this.assignment.windowName,
      status: "booting",
      updatedAt: now(),
      startedAt: now(),
    };
    this.persistState();

    await this.startShell();
    await this.runCommand(this.assignment.cmd, true);

    while (true) {
      await this.pollCommands();
      await Bun.sleep(100);
    }
  }

  private async waitForAssignment(): Promise<void> {
    while (!existsSync(this.assignmentPath)) {
      await Bun.sleep(100);
    }
  }

  private persistState(): void {
    this.state.updatedAt = now();
    writeState(this.session, this.state);
  }

  private async startShell(): Promise<void> {
    const proc = Bun.spawn([this.shellPath], {
      cwd: this.assignment.cwd,
      env: process.env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    this.shell = proc;
    this.state.shellPid = proc.pid;
    this.state.status = "idle";
    this.persistState();

    void this.streamReader(proc.stdout, false);
    void this.streamReader(proc.stderr, true);

    proc.exited.then((code) => {
      this.state.status = "stopped";
      this.state.lastExitCode = code ?? 0;
      this.persistState();
    });
  }

  private async resetShell(runInitial: boolean): Promise<void> {
    if (this.shell) {
      this.shell.kill();
      await this.shell.exited.catch(() => {});
      this.shell = null;
    }
    await this.startShell();
    if (runInitial) {
      await this.runCommand(this.assignment.cmd, true);
    }
  }

  private async streamReader(stream: ReadableStream<Uint8Array> | null, isErr: boolean): Promise<void> {
    if (!stream) return;
    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value).toString("utf8");
      this.handleOutputChunk(chunk, isErr);
    }

    this.flushBuffer(isErr);
  }

  private handleOutputChunk(chunk: string, isErr: boolean): void {
    const next = (isErr ? this.shellStderrBuffer : this.shellStdoutBuffer) + chunk;
    const lines = next.split("\n");
    const remainder = lines.pop() ?? "";

    for (const line of lines) {
      this.handleOutputLine(`${line}\n`, isErr);
    }

    if (isErr) {
      this.shellStderrBuffer = remainder;
    } else {
      this.shellStdoutBuffer = remainder;
    }
  }

  private flushBuffer(isErr: boolean): void {
    const value = isErr ? this.shellStderrBuffer : this.shellStdoutBuffer;
    if (value) {
      this.handleOutputLine(value, isErr);
    }
    if (isErr) {
      this.shellStderrBuffer = "";
    } else {
      this.shellStdoutBuffer = "";
    }
  }

  private handleOutputLine(line: string, isErr: boolean): void {
    const trimmed = line.trimEnd();
    if (trimmed.startsWith(START_TOKEN)) {
      this.state.status = "running";
      this.persistState();
      return;
    }

    if (trimmed.startsWith(END_TOKEN)) {
      const [, exitCodeRaw] = trimmed.split("::");
      this.state.status = "idle";
      this.state.lastExitCode = Number(exitCodeRaw ?? 0);
      this.state.lastCompletedCommand = this.state.currentCommand;
      this.state.currentCommand = undefined;
      this.persistState();
      return;
    }

    appendFileSync(this.logPath, line, "utf8");
    if (isErr) {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  }

  private async runCommand(command: string, initial = false): Promise<void> {
    if (!this.shell || !this.shell.stdin) {
      throw new Error("Shell is not available");
    }

    const commandFile = `${this.assignment.cwd}/.mux-command-${this.paneId}-${++this.commandSequence}.sh`;
    writeFileSync(commandFile, `${command}\n`, "utf8");

    this.state.currentCommand = command;
    this.state.status = initial ? "running" : "booting";
    this.persistState();

    this.shell.stdin.write(
      `printf '${START_TOKEN}::${this.commandSequence}\\n'\n. ${JSON.stringify(
        commandFile
      )}\nstatus=$?\nprintf '${END_TOKEN}::%s\\n' \"$status\"\n`
    );
  }

  private async pollCommands(): Promise<void> {
    if (!existsSync(this.commandPath)) return;
    const contents = readFileSync(this.commandPath, "utf8");
    if (contents.length <= this.commandOffset) return;

    const next = contents.slice(this.commandOffset);
    this.commandOffset = contents.length;

    for (const line of next.split("\n")) {
      if (!line.trim()) continue;
      const command = JSON.parse(line) as QueueCommand;
      await this.handleCommand(command);
    }
  }

  private async handleCommand(command: QueueCommand): Promise<void> {
    switch (command.type) {
      case "run":
        await this.runCommand(command.command);
        break;
      case "restart":
        await this.resetShell(true);
        break;
      case "keys":
        await this.handleKeys(command.keys);
        break;
    }
  }

  private async handleKeys(keys: string): Promise<void> {
    const normalized = keys.trim();

    if (normalized === "C-c") {
      await this.resetShell(false);
      return;
    }

    if (normalized === "C-d") {
      await this.resetShell(false);
      return;
    }

    if (normalized === "Enter") {
      if (!this.shell?.stdin) return;
      this.shell.stdin.write("\n");
      return;
    }

    if (!this.shell?.stdin) return;
    this.shell.stdin.write(normalized);
  }
}

async function main() {
  const supervisor = new PaneSupervisor();
  await supervisor.run();
}

main().catch((error) => {
  const session = process.env.ZELLIJ_SESSION_NAME;
  const paneIdRaw = process.env.ZELLIJ_PANE_ID;

  if (session && paneIdRaw) {
    const paneId = Number(paneIdRaw);
    const statePath = getStatePath(session, paneId);
    const existing =
      existsSync(statePath) ? readJson<PaneState>(statePath) : {
        paneId,
        paneName: `pane-${paneId}`,
        windowName: "unknown",
        status: "error" as const,
        updatedAt: now(),
      };
    writeJson(statePath, {
      ...existing,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      updatedAt: now(),
    });
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
