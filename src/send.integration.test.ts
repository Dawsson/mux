import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { hasSession, killSession } from "./zellij";

const SESSION = "mux-test-send";
const TEST_DIR = "/tmp/mux-test-send-workspace";
const CLI = `${import.meta.dir}/cli.ts`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCli(args: string[]) {
  return Bun.spawnSync(["bun", "run", CLI, ...args], {
    cwd: TEST_DIR,
    env: { ...process.env, PATH: process.env.PATH },
    stdout: "pipe",
    stderr: "pipe",
  });
}

function logsFor(pane: string): string {
  const result = runCli(["logs", pane]);
  expect(result.exitCode).toBe(0);
  return result.stdout.toString();
}

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(
    join(TEST_DIR, ".muxrc"),
    JSON.stringify({
      session: SESSION,
      windows: [{ name: "main", panes: [{ name: "shell", cmd: "echo ready" }] }],
    })
  );

  if (hasSession(SESSION)) killSession(SESSION);
  const result = runCli(["start", "--detach"]);
  expect(result.exitCode).toBe(0);
});

afterAll(() => {
  if (hasSession(SESSION)) killSession(SESSION);
  rmSync(`/tmp/mux-${SESSION}`, { recursive: true, force: true });
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("mux send", () => {
  test("send runs a command that produces output", async () => {
    const result = runCli(["send", "shell", "echo hello-from-test"]);
    expect(result.exitCode).toBe(0);
    await sleep(400);
    expect(logsFor("shell")).toContain("hello-from-test");
  });

  test("send --keys C-c interrupts a long-running command", async () => {
    const start = runCli(["send", "shell", "sleep 60"]);
    expect(start.exitCode).toBe(0);
    await sleep(300);

    const interrupt = runCli(["send", "shell", "--keys", "C-c"]);
    expect(interrupt.exitCode).toBe(0);
    await sleep(300);

    const followUp = runCli(["send", "shell", "echo after-interrupt"]);
    expect(followUp.exitCode).toBe(0);
    await sleep(400);
    expect(logsFor("shell")).toContain("after-interrupt");
  });

  test("restart reruns the configured pane command", async () => {
    const result = runCli(["restart", "shell"]);
    expect(result.exitCode).toBe(0);
    await sleep(400);
    const output = logsFor("shell");
    const readyMatches = output.match(/ready/g) ?? [];
    expect(readyMatches.length).toBeGreaterThanOrEqual(2);
  });

  test("CLI send to unknown pane fails", () => {
    const result = runCli(["send", "nonexistent", "echo hi"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("Unknown pane");
  });

  test("CLI send with no command fails", () => {
    const result = runCli(["send", "shell"]);
    expect(result.exitCode).toBe(1);
  });
});
