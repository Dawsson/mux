#!/usr/bin/env bun
import { findConfig } from "./config";
import {
  hasSession,
  startSession,
  killSession,
  attach,
  listPanes,
  capturePane,
  restartPane,
} from "./tmux";

const args = process.argv.slice(2);
const cmd = args[0];

function loadConfig() {
  try {
    return findConfig();
  } catch (e: any) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

function printUsage() {
  console.log(`mux — configurable tmux session manager

Usage:
  mux                    Start session if not running, attach if it is
  mux start [--detach]   Start the session (--detach: don't attach)
  mux stop               Kill the session
  mux status             Show running panes
  mux logs [pane]        Capture pane output (all panes if none specified)
  mux restart [pane]     Restart a pane or all panes
`);
}

if (!cmd || cmd === "start") {
  const config = loadConfig();
  const detach = args.includes("--detach");

  if (hasSession(config.session)) {
    if (!detach) {
      attach(config.session);
    } else {
      console.log(`Session "${config.session}" already running.`);
    }
  } else {
    startSession(config);
    if (!detach) {
      attach(config.session);
    } else {
      console.log(`Session "${config.session}" started (detached).`);
    }
  }
} else if (cmd === "stop") {
  const config = loadConfig();
  if (hasSession(config.session)) {
    killSession(config.session);
    console.log(`Session "${config.session}" stopped.`);
  } else {
    console.log(`Session "${config.session}" is not running.`);
  }
} else if (cmd === "status") {
  const config = loadConfig();
  if (!hasSession(config.session)) {
    console.log(`Session "${config.session}" is not running.`);
    process.exit(0);
  }
  const panes = listPanes(config.session);
  console.log(`Session: ${config.session}`);
  for (let i = 0; i < panes.length; i++) {
    const p = panes[i];
    const name = config.panes[i]?.name ?? `pane-${i}`;
    const active = p.active ? " (active)" : "";
    console.log(`  [${p.index}] ${name}${active}`);
  }
} else if (cmd === "logs") {
  const config = loadConfig();
  if (!hasSession(config.session)) {
    console.error(`Session "${config.session}" is not running.`);
    process.exit(1);
  }
  const targetPane = args[1];
  const panes = listPanes(config.session);

  if (targetPane) {
    const idx = config.panes.findIndex((p) => p.name === targetPane);
    if (idx === -1) {
      console.error(`Unknown pane: ${targetPane}`);
      process.exit(1);
    }
    const pane = panes[idx];
    if (!pane) {
      console.error(`Pane ${targetPane} not found in tmux session.`);
      process.exit(1);
    }
    const output = capturePane(pane.id);
    console.log(`=== ${targetPane} ===`);
    console.log(output);
  } else {
    for (let i = 0; i < panes.length; i++) {
      const name = config.panes[i]?.name ?? `pane-${i}`;
      const output = capturePane(panes[i].id);
      console.log(`=== ${name} ===`);
      console.log(output);
      console.log();
    }
  }
} else if (cmd === "restart") {
  const config = loadConfig();
  if (!hasSession(config.session)) {
    console.error(`Session "${config.session}" is not running.`);
    process.exit(1);
  }
  const targetPane = args[1];
  if (targetPane) {
    try {
      restartPane(config, targetPane);
      console.log(`Restarted pane "${targetPane}".`);
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  } else {
    for (const pane of config.panes) {
      restartPane(config, pane.name);
      console.log(`Restarted pane "${pane.name}".`);
    }
  }
} else if (cmd === "--help" || cmd === "-h" || cmd === "help") {
  printUsage();
} else {
  console.error(`Unknown command: ${cmd}`);
  printUsage();
  process.exit(1);
}
