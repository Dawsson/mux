import { existsSync, readFileSync } from "fs";
import { dirname, basename, join } from "path";

export interface PaneConfig {
  name: string;
  cmd: string;
  cwd?: string;
}

export interface WindowConfig {
  name: string;
  panes: PaneConfig[];
  layout?: string;
}

export interface MuxConfig {
  session: string;
  windows: WindowConfig[];
  root: string;
  selectWindow: number;
}

interface RawMuxConfig {
  session?: string;
  selectWindow?: number;
  windows?: unknown[];
}

export function findConfig(from: string = process.cwd()): MuxConfig {
  let dir = from;

  while (true) {
    const muxrcPath = join(dir, ".muxrc");
    if (existsSync(muxrcPath)) {
      const raw = JSON.parse(readFileSync(muxrcPath, "utf8"));
      return parseConfig(raw, dir);
    }

    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      const raw = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (raw.mux) {
        return parseConfig(raw.mux, dir);
      }
    }

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error('No mux config found. Add a .muxrc file or a "mux" key in package.json');
}

export function parseConfig(raw: RawMuxConfig, root: string): MuxConfig {
  const session = raw.session || basename(root);

  if (!raw.windows || !Array.isArray(raw.windows) || raw.windows.length === 0) {
    throw new Error("mux config needs at least one window");
  }

  const paneNames = new Set<string>();
  const windows: WindowConfig[] = raw.windows.map((window: any, wi: number) => {
    if (!window.name) throw new Error(`window ${wi} missing "name"`);
    if (!window.panes || !Array.isArray(window.panes) || window.panes.length === 0) {
      throw new Error(`window "${window.name}" needs at least one pane`);
    }
    const panes: PaneConfig[] = window.panes.map((pane: any, pi: number) => {
      if (!pane.name) throw new Error(`window "${window.name}" pane ${pi} missing "name"`);
      if (!pane.cmd) throw new Error(`window "${window.name}" pane ${pi} missing "cmd"`);
      if (paneNames.has(pane.name)) {
        throw new Error(`duplicate pane name "${pane.name}"`);
      }
      paneNames.add(pane.name);
      return { name: pane.name, cmd: pane.cmd, cwd: pane.cwd };
    });
    return { name: window.name, panes, layout: window.layout };
  });

  const selectWindow = typeof raw.selectWindow === "number" ? raw.selectWindow : 0;

  return { session, windows, root, selectWindow };
}
