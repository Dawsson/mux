#!/usr/bin/env bun
import { findConfig } from "./config";
import type { MuxConfig } from "./config";
import {
  hasSession,
  startSession,
  killSession,
  attach,
  listWindows,
  listPanes,
  capturePane,
  restartPane,
  sendKeys,
  sendRawKeys,
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

function findPane(config: MuxConfig, paneName: string): { wi: number; pi: number } | null {
  for (let wi = 0; wi < config.windows.length; wi++) {
    const pi = config.windows[wi].panes.findIndex((p) => p.name === paneName);
    if (pi !== -1) return { wi, pi };
  }
  return null;
}

function printUsage() {
  console.log(`mux — configurable tmux session manager

Usage:
  mux                    Start session if not running, attach if it is
  mux start [--detach]   Start the session (--detach: don't attach)
  mux stop               Kill the session
  mux status             Show running windows and panes
  mux logs [pane]        Capture pane output (all panes if none specified)
  mux restart [pane]     Restart a pane or all panes
  mux send <pane> <cmd>  Send a command to a pane (runs with Enter)
  mux send <pane> --keys <keys>  Send raw keys (e.g. C-c, C-d)
`);
}

if (!cmd || cmd === "start") {
  const config = loadConfig();
  const detach = args.includes("--detach");

  if (hasSession(config.session)) {
    if (!detach) {
      attach(config.session, config.selectWindow);
    } else {
      console.log(`Session "${config.session}" already running.`);
    }
  } else {
    startSession(config);
    if (!detach) {
      attach(config.session, config.selectWindow);
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
  console.log(`Session: ${config.session}`);
  const tmuxWindows = listWindows(config.session);
  for (let wi = 0; wi < tmuxWindows.length; wi++) {
    const tmuxWindow = tmuxWindows[wi];
    const configWindow = config.windows[wi];
    const activeWindow = tmuxWindow.active ? " (active)" : "";
    console.log(`  Window [${tmuxWindow.index}] ${configWindow?.name ?? tmuxWindow.name}${activeWindow}`);
    const panes = listPanes(`${config.session}:${tmuxWindow.index}`);
    for (let pi = 0; pi < panes.length; pi++) {
      const pane = panes[pi];
      const paneName = configWindow?.panes[pi]?.name ?? `pane-${pi}`;
      const activePane = pane.active ? " (active)" : "";
      console.log(`    [${pane.index}] ${paneName}${activePane}`);
    }
  }
} else if (cmd === "logs") {
  const config = loadConfig();
  if (!hasSession(config.session)) {
    console.error(`Session "${config.session}" is not running.`);
    process.exit(1);
  }
  const targetPane = args[1];

  if (targetPane) {
    const location = findPane(config, targetPane);
    if (!location) {
      console.error(`Unknown pane: ${targetPane}`);
      process.exit(1);
    }
    const window = config.windows[location.wi];
    const panes = listPanes(`${config.session}:${window.name}`);
    const pane = panes[location.pi];
    if (!pane) {
      console.error(`Pane ${targetPane} not found in tmux session.`);
      process.exit(1);
    }
    console.log(`=== ${targetPane} ===`);
    console.log(capturePane(pane.id));
  } else {
    for (let wi = 0; wi < config.windows.length; wi++) {
      const window = config.windows[wi];
      const panes = listPanes(`${config.session}:${window.name}`);
      for (let pi = 0; pi < panes.length; pi++) {
        const paneName = window.panes[pi]?.name ?? `pane-${pi}`;
        console.log(`=== ${paneName} ===`);
        console.log(capturePane(panes[pi].id));
        console.log();
      }
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
    for (const window of config.windows) {
      for (const pane of window.panes) {
        restartPane(config, pane.name);
        console.log(`Restarted pane "${pane.name}".`);
      }
    }
  }
} else if (cmd === "send") {
  const config = loadConfig();
  if (!hasSession(config.session)) {
    console.error(`Session "${config.session}" is not running.`);
    process.exit(1);
  }
  const targetPane = args[1];
  if (!targetPane) {
    console.error("Usage: mux send <pane> <command> | mux send <pane> --keys <keys>");
    process.exit(1);
  }
  const location = findPane(config, targetPane);
  if (!location) {
    console.error(`Unknown pane: ${targetPane}`);
    process.exit(1);
  }
  const window = config.windows[location.wi];
  const panes = listPanes(`${config.session}:${window.name}`);
  const pane = panes[location.pi];
  if (!pane) {
    console.error(`Pane ${targetPane} not found in tmux session.`);
    process.exit(1);
  }

  if (args[2] === "--keys") {
    const keys = args.slice(3).join(" ");
    if (!keys) {
      console.error("No keys specified.");
      process.exit(1);
    }
    sendRawKeys(pane.id, keys);
  } else {
    const command = args.slice(2).join(" ");
    if (!command) {
      console.error("No command specified.");
      process.exit(1);
    }
    sendKeys(pane.id, command);
  }
} else if (cmd === "--help" || cmd === "-h" || cmd === "help") {
  printUsage();
} else {
  console.error(`Unknown command: ${cmd}`);
  printUsage();
  process.exit(1);
}
