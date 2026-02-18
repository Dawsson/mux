import { existsSync, readFileSync } from "fs";
import { join, dirname, basename } from "path";

export interface PaneConfig {
  name: string;
  cmd: string;
  cwd?: string;
}

export interface MuxConfig {
  session: string;
  panes: PaneConfig[];
  root: string; // absolute path to the project root (where config was found)
}

interface RawMuxConfig {
  session?: string;
  panes?: unknown[];
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

  if (!raw.panes || !Array.isArray(raw.panes) || raw.panes.length === 0) {
    throw new Error("mux config needs at least one pane");
  }

  const panes: PaneConfig[] = raw.panes.map((p: any, i: number) => {
    if (!p.name) throw new Error(`pane ${i} missing "name"`);
    if (!p.cmd) throw new Error(`pane ${i} missing "cmd"`);
    return { name: p.name, cmd: p.cmd, cwd: p.cwd };
  });

  return { session, panes, root };
}
