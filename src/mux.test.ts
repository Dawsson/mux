import { describe, it, expect } from "bun:test";
import { parseConfig } from "./config";

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
