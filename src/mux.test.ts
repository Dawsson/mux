import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { parseConfig, findConfig } from "./config";

describe("parseConfig", () => {
  const root = "/tmp/test-project";

  it("parses a valid config", () => {
    const config = parseConfig(
      {
        session: "my-app",
        panes: [
          { name: "api", cmd: "bun run dev", cwd: "packages/api" },
          { name: "web", cmd: "bun run start", cwd: "packages/web" },
        ],
      },
      root
    );
    expect(config.session).toBe("my-app");
    expect(config.root).toBe(root);
    expect(config.panes).toHaveLength(2);
    expect(config.panes[0]).toEqual({ name: "api", cmd: "bun run dev", cwd: "packages/api" });
    expect(config.panes[1]).toEqual({ name: "web", cmd: "bun run start", cwd: "packages/web" });
  });

  it("defaults session to directory basename", () => {
    const config = parseConfig(
      { panes: [{ name: "dev", cmd: "bun run dev" }] },
      "/home/user/my-project"
    );
    expect(config.session).toBe("my-project");
  });

  it("allows pane without cwd", () => {
    const config = parseConfig(
      { panes: [{ name: "dev", cmd: "bun run dev" }] },
      root
    );
    expect(config.panes[0].cwd).toBeUndefined();
  });

  it("throws when panes is missing", () => {
    expect(() => parseConfig({}, root)).toThrow("at least one pane");
  });

  it("throws when panes is empty", () => {
    expect(() => parseConfig({ panes: [] }, root)).toThrow("at least one pane");
  });

  it("throws when a pane is missing name", () => {
    expect(() =>
      parseConfig({ panes: [{ cmd: "bun run dev" }] }, root)
    ).toThrow('missing "name"');
  });

  it("throws when a pane is missing cmd", () => {
    expect(() =>
      parseConfig({ panes: [{ name: "api" }] }, root)
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
      JSON.stringify({ session: "my-app", panes: [{ name: "dev", cmd: "bun run dev" }] })
    );
    const config = findConfig(tmpDir);
    expect(config.session).toBe("my-app");
    expect(config.root).toBe(tmpDir);
    expect(config.panes[0].cmd).toBe("bun run dev");
  });

  it("falls back to package.json mux key when no .muxrc", () => {
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({ name: "test", mux: { panes: [{ name: "api", cmd: "bun start" }] } })
    );
    const config = findConfig(tmpDir);
    expect(config.session).toBe("mux-test-findconfig");
    expect(config.panes[0].cmd).toBe("bun start");
  });

  it("prefers .muxrc over package.json", () => {
    writeFileSync(
      join(tmpDir, ".muxrc"),
      JSON.stringify({ session: "from-muxrc", panes: [{ name: "a", cmd: "echo a" }] })
    );
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({ mux: { session: "from-pkg", panes: [{ name: "b", cmd: "echo b" }] } })
    );
    const config = findConfig(tmpDir);
    expect(config.session).toBe("from-muxrc");
  });

  it("throws when no config is found", () => {
    expect(() => findConfig(tmpDir)).toThrow("No mux config found");
  });
});
