import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { parseConfig, findConfig } from "./config";

describe("parseConfig", () => {
  const root = "/tmp/test-project";

  it("parses a valid single-window config", () => {
    const config = parseConfig(
      {
        session: "my-app",
        windows: [
          {
            name: "main",
            panes: [
              { name: "api", cmd: "bun run dev", cwd: "packages/api" },
              { name: "web", cmd: "bun run start", cwd: "packages/web" },
            ],
          },
        ],
      },
      root
    );
    expect(config.session).toBe("my-app");
    expect(config.root).toBe(root);
    expect(config.windows).toHaveLength(1);
    expect(config.windows[0].name).toBe("main");
    expect(config.windows[0].panes[0]).toEqual({ name: "api", cmd: "bun run dev", cwd: "packages/api" });
    expect(config.windows[0].panes[1]).toEqual({ name: "web", cmd: "bun run start", cwd: "packages/web" });
  });

  it("parses multiple windows", () => {
    const config = parseConfig(
      {
        windows: [
          { name: "server", panes: [{ name: "api", cmd: "bun run dev" }] },
          { name: "tools", panes: [{ name: "db", cmd: "psql" }] },
        ],
      },
      root
    );
    expect(config.windows).toHaveLength(2);
    expect(config.windows[0].name).toBe("server");
    expect(config.windows[1].name).toBe("tools");
    expect(config.windows[1].panes[0].name).toBe("db");
  });

  it("defaults session to directory basename", () => {
    const config = parseConfig(
      { windows: [{ name: "main", panes: [{ name: "dev", cmd: "bun run dev" }] }] },
      "/home/user/my-project"
    );
    expect(config.session).toBe("my-project");
  });

  it("allows pane without cwd", () => {
    const config = parseConfig(
      { windows: [{ name: "main", panes: [{ name: "dev", cmd: "bun run dev" }] }] },
      root
    );
    expect(config.windows[0].panes[0].cwd).toBeUndefined();
  });

  it("allows window without layout", () => {
    const config = parseConfig(
      { windows: [{ name: "main", panes: [{ name: "dev", cmd: "bun run dev" }] }] },
      root
    );
    expect(config.windows[0].layout).toBeUndefined();
  });

  it("preserves window layout", () => {
    const config = parseConfig(
      { windows: [{ name: "main", layout: "even-horizontal", panes: [{ name: "dev", cmd: "bun run dev" }] }] },
      root
    );
    expect(config.windows[0].layout).toBe("even-horizontal");
  });

  it("throws when windows is missing", () => {
    expect(() => parseConfig({}, root)).toThrow("at least one window");
  });

  it("throws when windows is empty", () => {
    expect(() => parseConfig({ windows: [] }, root)).toThrow("at least one window");
  });

  it("throws when a window is missing name", () => {
    expect(() =>
      parseConfig({ windows: [{ panes: [{ name: "api", cmd: "bun dev" }] }] }, root)
    ).toThrow('missing "name"');
  });

  it("throws when a window has no panes", () => {
    expect(() =>
      parseConfig({ windows: [{ name: "main", panes: [] }] }, root)
    ).toThrow("at least one pane");
  });

  it("throws when a pane is missing name", () => {
    expect(() =>
      parseConfig({ windows: [{ name: "main", panes: [{ cmd: "bun run dev" }] }] }, root)
    ).toThrow('missing "name"');
  });

  it("throws when a pane is missing cmd", () => {
    expect(() =>
      parseConfig({ windows: [{ name: "main", panes: [{ name: "api" }] }] }, root)
    ).toThrow('missing "cmd"');
  });
});

describe("findConfig", () => {
  const tmpDir = "/tmp/mux-test-findconfig";

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads config from .muxrc", () => {
    writeFileSync(
      join(tmpDir, ".muxrc"),
      JSON.stringify({
        session: "my-app",
        windows: [{ name: "main", panes: [{ name: "dev", cmd: "bun run dev" }] }],
      })
    );
    const config = findConfig(tmpDir);
    expect(config.session).toBe("my-app");
    expect(config.root).toBe(tmpDir);
    expect(config.windows[0].panes[0].cmd).toBe("bun run dev");
  });

  it("falls back to package.json mux key when no .muxrc", () => {
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({
        name: "test",
        mux: { windows: [{ name: "main", panes: [{ name: "api", cmd: "bun start" }] }] },
      })
    );
    const config = findConfig(tmpDir);
    expect(config.session).toBe("mux-test-findconfig");
    expect(config.windows[0].panes[0].cmd).toBe("bun start");
  });

  it("prefers .muxrc over package.json", () => {
    writeFileSync(
      join(tmpDir, ".muxrc"),
      JSON.stringify({ session: "from-muxrc", windows: [{ name: "main", panes: [{ name: "a", cmd: "echo a" }] }] })
    );
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({ mux: { session: "from-pkg", windows: [{ name: "main", panes: [{ name: "b", cmd: "echo b" }] }] } })
    );
    const config = findConfig(tmpDir);
    expect(config.session).toBe("from-muxrc");
  });

  it("throws when no config is found", () => {
    expect(() => findConfig(tmpDir)).toThrow("No mux config found");
  });
});
