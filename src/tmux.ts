import { mkdirSync, existsSync } from "fs";
import type { MuxConfig, PaneConfig } from "./config";
import { join } from "path";

function run(...args: string[]): string {
  const result = Bun.spawnSync(["tmux", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return result.stdout.toString().trim();
}

function runOk(...args: string[]): boolean {
  const result = Bun.spawnSync(["tmux", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return result.exitCode === 0;
}

export function hasSession(name: string): boolean {
  return runOk("has-session", "-t", name);
}

export function createSession(name: string, cwd: string): void {
  run("new-session", "-d", "-s", name, "-c", cwd);
}

export function splitPane(session: string, cwd: string): string {
  return run(
    "split-window",
    "-t",
    session,
    "-c",
    cwd,
    "-P",
    "-F",
    "#{pane_id}"
  );
}

export function sendKeys(session: string, target: string, cmd: string): void {
  run("send-keys", "-t", target, cmd, "Enter");
}

export function killSession(name: string): void {
  run("kill-session", "-t", name);
}

export function selectLayout(session: string, layout: string): void {
  run("select-layout", "-t", session, layout);
}

export function renameWindow(session: string, name: string): void {
  run("rename-window", "-t", session, name);
}

export function attach(session: string): void {
  const proc = Bun.spawnSync(["tmux", "attach", "-t", session], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(proc.exitCode ?? 0);
}

export function listPanes(
  session: string
): { id: string; index: string; title: string; active: boolean }[] {
  const out = run(
    "list-panes",
    "-t",
    session,
    "-F",
    "#{pane_id}\t#{pane_index}\t#{pane_title}\t#{pane_active}"
  );
  if (!out) return [];
  return out.split("\n").map((line) => {
    const [id, index, title, active] = line.split("\t");
    return { id, index, title, active: active === "1" };
  });
}

export function capturePane(target: string, lines = 100): string {
  return run("capture-pane", "-t", target, "-p", "-S", `-${lines}`);
}

function logDir(session: string): string {
  return `/tmp/mux-${session}`;
}

export function setupLogging(config: MuxConfig): void {
  const dir = logDir(config.session);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function startSession(config: MuxConfig): void {
  const { session, panes, root } = config;

  createSession(session, root);
  setupLogging(config);

  // First pane is the session window's initial pane
  const firstPane = panes[0];
  const firstCwd = firstPane.cwd ? join(root, firstPane.cwd) : root;
  // Set cwd for first pane
  sendKeys(session, `${session}:0.0`, `cd ${firstCwd}`);
  sendKeys(session, `${session}:0.0`, firstPane.cmd);

  // Additional panes via split
  for (let i = 1; i < panes.length; i++) {
    const pane = panes[i];
    const cwd = pane.cwd ? join(root, pane.cwd) : root;
    const paneId = splitPane(session, cwd);
    sendKeys(session, paneId, pane.cmd);
  }

  // Even layout
  selectLayout(session, "tiled");
  renameWindow(session, "mux");
}

export function restartPane(
  config: MuxConfig,
  paneName: string
): void {
  const paneConfig = config.panes.find((p) => p.name === paneName);
  if (!paneConfig) throw new Error(`Unknown pane: ${paneName}`);

  const panes = listPanes(config.session);
  const idx = config.panes.findIndex((p) => p.name === paneName);
  const target = panes[idx];
  if (!target) throw new Error(`Pane ${paneName} not found in tmux session`);

  // Send Ctrl-C then re-run command
  run("send-keys", "-t", target.id, "C-c", "");
  sendKeys(config.session, target.id, paneConfig.cmd);
}
