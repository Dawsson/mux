import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import {
  hasSession,
  startSession,
  killSession,
  listPanes,
  capturePane,
  sendKeys,
  sendRawKeys,
} from "./tmux";
import type { MuxConfig } from "./config";

const SESSION = "mux-test-send";
const TEST_DIR = "/tmp/mux-test-send-workspace";

const config: MuxConfig = {
  session: SESSION,
  root: TEST_DIR,
  windows: [
    {
      name: "main",
      panes: [{ name: "shell", cmd: "echo ready" }],
    },
  ],
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getPaneId(): string {
  const panes = listPanes(`${SESSION}:0`);
  return panes[0].id;
}

beforeAll(() => {
  // Create a temp workspace with a .muxrc so CLI tests can find config
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(
    `${TEST_DIR}/.muxrc`,
    JSON.stringify({
      session: SESSION,
      windows: [{ name: "main", panes: [{ name: "shell", cmd: "echo ready" }] }],
    })
  );

  if (hasSession(SESSION)) killSession(SESSION);
  startSession(config);
});

afterAll(() => {
  if (hasSession(SESSION)) killSession(SESSION);
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("mux send", () => {
  test("sendKeys sends a command that produces output", async () => {
    const paneId = getPaneId();
    sendKeys(paneId, "echo hello-from-test");
    await sleep(300);
    const output = capturePane(paneId);
    expect(output).toContain("hello-from-test");
  });

  test("sendRawKeys sends keys without Enter", async () => {
    const paneId = getPaneId();
    // Type something but don't press enter
    sendRawKeys(paneId, "echo partial-text");
    await sleep(300);
    const output = capturePane(paneId);
    // The text should appear on the command line but NOT as executed output
    expect(output).toContain("partial-text");
    // Clean up: send C-c to cancel the partial input
    sendRawKeys(paneId, "C-c");
    await sleep(200);
  });

  test("sendRawKeys C-c interrupts a running command", async () => {
    const paneId = getPaneId();
    // Start a long-running command
    sendKeys(paneId, "sleep 60");
    await sleep(300);
    // Interrupt it
    sendRawKeys(paneId, "C-c");
    await sleep(300);
    // Send a new command to prove the pane is responsive
    sendKeys(paneId, "echo after-interrupt");
    await sleep(300);
    const output = capturePane(paneId);
    expect(output).toContain("after-interrupt");
  });

  test("CLI send command works end-to-end", async () => {
    // Use the CLI binary directly
    const result = Bun.spawnSync(
      ["bun", "run", `${import.meta.dir}/cli.ts`, "send", "shell", "echo cli-send-test"],
      { cwd: TEST_DIR, env: { ...process.env, PATH: process.env.PATH }, stdout: "pipe", stderr: "pipe" }
    );
    expect(result.exitCode).toBe(0);
    await sleep(300);
    const paneId = getPaneId();
    const output = capturePane(paneId);
    expect(output).toContain("cli-send-test");
  });

  test("CLI send --keys works end-to-end", async () => {
    const paneId = getPaneId();
    // Start something to interrupt
    sendKeys(paneId, "sleep 60");
    await sleep(300);

    const result = Bun.spawnSync(
      ["bun", "run", `${import.meta.dir}/cli.ts`, "send", "shell", "--keys", "C-c"],
      { cwd: TEST_DIR, env: { ...process.env, PATH: process.env.PATH }, stdout: "pipe", stderr: "pipe" }
    );
    expect(result.exitCode).toBe(0);
    await sleep(300);

    // Prove pane is responsive after Ctrl-C
    sendKeys(paneId, "echo keys-test-ok");
    await sleep(300);
    const output = capturePane(paneId);
    expect(output).toContain("keys-test-ok");
  });

  test("CLI send to unknown pane fails", () => {
    const result = Bun.spawnSync(
      ["bun", "run", `${import.meta.dir}/cli.ts`, "send", "nonexistent", "echo hi"],
      { cwd: TEST_DIR, env: { ...process.env, PATH: process.env.PATH }, stdout: "pipe", stderr: "pipe" }
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("Unknown pane");
  });

  test("CLI send with no command fails", () => {
    const result = Bun.spawnSync(
      ["bun", "run", `${import.meta.dir}/cli.ts`, "send", "shell"],
      { cwd: TEST_DIR, env: { ...process.env, PATH: process.env.PATH }, stdout: "pipe", stderr: "pipe" }
    );
    expect(result.exitCode).toBe(1);
  });
});
