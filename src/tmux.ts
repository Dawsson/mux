import { mkdirSync, existsSync } from "fs";
import type { MuxConfig } from "./config";
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

export function newWindow(session: string, name: string, cwd: string): void {
  run("new-window", "-t", session, "-n", name, "-c", cwd);
}

export function splitPane(target: string, cwd: string): string {
  return run(
    "split-window",
    "-t",
    target,
    "-c",
    cwd,
    "-P",
    "-F",
    "#{pane_id}"
  );
}

export function sendKeys(target: string, cmd: string): void {
  run("send-keys", "-t", target, cmd, "Enter");
}

export function sendRawKeys(target: string, keys: string): void {
  run("send-keys", "-t", target, keys);
}

export function killSession(name: string): void {
  run("kill-session", "-t", name);
}

export function selectLayout(target: string, layout: string): void {
  run("select-layout", "-t", target, layout);
}

export function renameWindow(target: string, name: string): void {
  run("rename-window", "-t", target, name);
}

export function selectWindow(session: string, index: number): void {
  run("select-window", "-t", `${session}:${index}`);
}

export function attach(session: string, selectWindowIndex?: number): void {
  if (selectWindowIndex !== undefined) {
    selectWindow(session, selectWindowIndex);
  }
  const proc = Bun.spawnSync(["tmux", "attach", "-t", session], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(proc.exitCode ?? 0);
}

export function listWindows(
  session: string
): { index: string; name: string; active: boolean }[] {
  const out = run(
    "list-windows",
    "-t",
    session,
    "-F",
    "#{window_index}\t#{window_name}\t#{window_active}"
  );
  if (!out) return [];
  return out.split("\n").map((line) => {
    const [index, name, active] = line.split("\t");
    return { index, name, active: active === "1" };
  });
}

export function listPanes(
  target: string
): { id: string; index: string; title: string; active: boolean }[] {
  const out = run(
    "list-panes",
    "-t",
    target,
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
  const { session, windows, root } = config;

  createSession(session, root);
  setupLogging(config);

  for (let wi = 0; wi < windows.length; wi++) {
    const win = windows[wi];
    const firstCwd = win.panes[0].cwd ? join(root, win.panes[0].cwd) : root;

    if (wi === 0) {
      // Use the window auto-created with the session
      renameWindow(`${session}:0`, win.name);
      sendKeys(`${session}:0.0`, `cd ${firstCwd}`);
      sendKeys(`${session}:0.0`, win.panes[0].cmd);
    } else {
      // Create a new window (starts in firstCwd via -c flag)
      newWindow(session, win.name, firstCwd);
      sendKeys(`${session}:${wi}.0`, win.panes[0].cmd);
    }

    // Additional panes via split
    for (let pi = 1; pi < win.panes.length; pi++) {
      const pane = win.panes[pi];
      const cwd = pane.cwd ? join(root, pane.cwd) : root;
      const paneId = splitPane(`${session}:${wi}`, cwd);
      sendKeys(paneId, pane.cmd);
    }

    // Apply layout
    const defaultLayout = win.panes.length === 2 ? "even-horizontal" : "tiled";
    selectLayout(`${session}:${wi}`, win.layout ?? defaultLayout);
  }
}

export function restartPane(config: MuxConfig, paneName: string): void {
  for (let wi = 0; wi < config.windows.length; wi++) {
    const win = config.windows[wi];
    const pi = win.panes.findIndex((p) => p.name === paneName);
    if (pi !== -1) {
      const paneConfig = win.panes[pi];
      const panes = listPanes(`${config.session}:${wi}`);
      const target = panes[pi];
      if (!target) {
        console.log(`Pane "${paneName}" not found in tmux session, skipping.`);
        return;
      }
      run("send-keys", "-t", target.id, "C-c", "");
      sendKeys(target.id, paneConfig.cmd);
      return;
    }
  }
  throw new Error(`Unknown pane: ${paneName}`);
}
