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
  root: string; // absolute path to the project root (where package.json lives)
}

interface RawMuxConfig {
  session?: string;
  panes?: unknown[];
}

export function findConfig(from: string = process.cwd()): MuxConfig {
  let dir = from;

  while (true) {
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
    'No "mux" config found in any package.json from here to /'
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
