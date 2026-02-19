import { existsSync, readFileSync } from "fs";
import { join, dirname, basename } from "path";

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
  root: string; // absolute path to the project root (where config was found)
  selectWindow: number; // window index to focus when attaching (default: 0)
}

interface RawMuxConfig {
  session?: string;
  selectWindow?: number;
  windows?: unknown[];
}

export function findConfig(from: string = process.cwd()): MuxConfig {
  let dir = from;

  while (true) {
    // Check for standalone .muxrc first (works without package.json)
    const muxrcPath = join(dir, ".muxrc");
    if (existsSync(muxrcPath)) {
      const raw = JSON.parse(readFileSync(muxrcPath, "utf8"));
      return parseConfig(raw, dir);
    }

    // Fall back to the "mux" key in package.json
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

  throw new Error(
    'No mux config found. Add a .muxrc file or a "mux" key in package.json'
  );
}

export function parseConfig(raw: RawMuxConfig, root: string): MuxConfig {
  const session = raw.session || basename(root);

  if (!raw.windows || !Array.isArray(raw.windows) || raw.windows.length === 0) {
    throw new Error("mux config needs at least one window");
  }

  const windows: WindowConfig[] = raw.windows.map((w: any, wi: number) => {
    if (!w.name) throw new Error(`window ${wi} missing "name"`);
    if (!w.panes || !Array.isArray(w.panes) || w.panes.length === 0) {
      throw new Error(`window "${w.name}" needs at least one pane`);
    }
    const panes: PaneConfig[] = w.panes.map((p: any, pi: number) => {
      if (!p.name) throw new Error(`window "${w.name}" pane ${pi} missing "name"`);
      if (!p.cmd) throw new Error(`window "${w.name}" pane ${pi} missing "cmd"`);
      return { name: p.name, cmd: p.cmd, cwd: p.cwd };
    });
    return { name: w.name, panes, layout: w.layout };
  });

  const selectWindow = typeof raw.selectWindow === "number" ? raw.selectWindow : 0;

  return { session, windows, root, selectWindow };
}
