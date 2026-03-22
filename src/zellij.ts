import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { basename } from "path";
import type { MuxConfig } from "./config";
import {
  enqueuePaneCommand,
  type PaneAssignment,
  type PaneState,
  flattenPanes,
  getAssignmentPath,
  getGeneratedConfigPath,
  getGeneratedLayoutPath,
  getLogPath,
  getRuntimeDir,
  getStatePath,
  initializeRuntime,
  readAssignment,
  readState,
  writeAssignments,
  writeManifest,
} from "./runtime";

interface ZellijTabMetadata {
  position: number;
  name: string;
}

interface ZellijPaneMetadata {
  id: number;
  title: string;
  tabPosition: number;
}

interface ZellijSessionMetadata {
  tabs: ZellijTabMetadata[];
  panes: ZellijPaneMetadata[];
}

interface ZellijSessionListEntry {
  name: string;
  exited: boolean;
}

function run(args: string[], inherit = false): string {
  const proc = Bun.spawnSync(["zellij", ...args], {
    stdin: inherit ? "inherit" : "pipe",
    stdout: inherit ? "inherit" : "pipe",
    stderr: inherit ? "inherit" : "pipe",
  });

  if (proc.exitCode !== 0) {
    const err =
      (proc.stderr ? proc.stderr.toString().trim() : "") ||
      `zellij exited with ${proc.exitCode}`;
    throw new Error(err);
  }

  return inherit ? "" : (proc.stdout ? proc.stdout.toString().trim() : "");
}

function escapeKdl(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function tryRun(args: string[]): { ok: true; stdout: string } | { ok: false; error: string } {
  try {
    return { ok: true, stdout: run(args) };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

function getSupervisorPath(): string {
  return new URL("./pane-supervisor.py", import.meta.url).pathname;
}

function getZellijVersion(): string {
  const output = run(["--version"]);
  const match = output.match(/zellij\s+(.+)/i);
  if (!match) throw new Error(`Unable to parse zellij version from: ${output}`);
  return match[1].trim();
}

function getZellijCacheDir(): string {
  const output = run(["setup", "--check"]);
  const match = output.match(/\[CACHE DIR\]:\s+(.+)/);
  if (!match) throw new Error("Unable to determine zellij cache dir");
  return match[1].trim();
}

function getSessionInfoPath(session: string): string {
  return `${getZellijCacheDir()}/${getZellijVersion()}/session_info/${session}/session-metadata.kdl`;
}

function getLayoutCachePath(session: string): string {
  return `${getZellijCacheDir()}/${getZellijVersion()}/session_info/${session}/session-layout.kdl`;
}

function parseBlockFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    const quoted = trimmed.match(/^([a-zA-Z_]+)\s+"([^"]*)"$/);
    if (quoted) {
      fields[quoted[1]] = quoted[2];
      continue;
    }
    const bare = trimmed.match(/^([a-zA-Z_]+)\s+([^\s]+)$/);
    if (bare) {
      fields[bare[1]] = bare[2];
    }
  }
  return fields;
}

function parseSessionMetadata(contents: string): ZellijSessionMetadata {
  const tabs: ZellijTabMetadata[] = [];
  const panes: ZellijPaneMetadata[] = [];

  for (const match of contents.matchAll(/tab\s*\{([\s\S]*?)\n\s*\}/g)) {
    const fields = parseBlockFields(match[1]);
    if (fields.position !== undefined && fields.name !== undefined) {
      tabs.push({
        position: Number(fields.position),
        name: fields.name,
      });
    }
  }

  for (const match of contents.matchAll(/pane\s*\{([\s\S]*?)\n\s*\}/g)) {
    const fields = parseBlockFields(match[1]);
    if (
      fields.id !== undefined &&
      fields.title !== undefined &&
      fields.tab_position !== undefined
    ) {
      panes.push({
        id: Number(fields.id),
        title: fields.title,
        tabPosition: Number(fields.tab_position),
      });
    }
  }

  return { tabs, panes };
}

function readSessionMetadata(session: string): ZellijSessionMetadata {
  const metadataPath = getSessionInfoPath(session);
  if (!existsSync(metadataPath)) {
    return { tabs: [], panes: [] };
  }
  return parseSessionMetadata(readFileSync(metadataPath, "utf8"));
}

function getWindowSplitDirection(layout: string | undefined, paneCount: number): string {
  if (layout === "even-horizontal" || (!layout && paneCount === 2)) {
    return ` split_direction="vertical"`;
  }
  if (layout === "even-vertical") {
    return ` split_direction="horizontal"`;
  }
  return "";
}

function generateManagedLayout(config: MuxConfig): string {
  if (config.zellij?.layout) {
    return readFileSync(config.zellij.layout, "utf8");
  }

  const tabBlocks = config.windows.map((window) => {
    const splitDirection = getWindowSplitDirection(window.layout, window.panes.length);

    const panes = window.panes
      .map(
        (pane) => {
          const cwd = pane.cwd ? `${config.root}/${pane.cwd}` : config.root;
          return `        pane name="${escapeKdl(pane.name)}" cwd="${escapeKdl(cwd)}"`;
        }
      )
      .join("\n");

    return `    tab name="${escapeKdl(window.name)}"${splitDirection} {\n${panes}\n    }`;
  });

  return `layout {\n${tabBlocks.join("\n")}\n}\n`;
}

function generateConfig(detach: boolean): string {
  const lines = ["show_startup_tips false", "show_release_notes false"];
  lines.unshift(`default_shell "${escapeKdl(getSupervisorPath())}"`);
  return `${lines.join("\n")}\n`;
}

function startWithLayout(session: string, layoutPath: string, configPath: string, detach: boolean): void {
  const args = ["--config", configPath, "--layout", layoutPath, "attach"];
  if (detach) args.push("--create-background");
  args.push(session);
  run(args, false);
}

function waitForAssignments(config: MuxConfig, timeoutMs = 8000): PaneAssignment[] {
  const panes = flattenPanes(config);
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const metadata = readSessionMetadata(config.session);
    const assignments: PaneAssignment[] = [];

    for (const pane of panes) {
      const match = metadata.panes.find((item) => item.title === pane.paneName);
      if (!match) {
        assignments.length = 0;
        break;
      }

      assignments.push({
        ...pane,
        paneId: match.id,
        tabIndex: match.tabPosition,
        logPath: getLogPath(config.session, pane.paneName),
        statePath: getStatePath(config.session, match.id),
        commandPath: `${getRuntimeDir(config.session)}/commands/${match.id}.ndjson`,
      });
    }

    if (assignments.length === panes.length) {
      return assignments;
    }

    Bun.sleepSync(100);
  }

  throw new Error("Timed out waiting for zellij panes to register");
}

function maybeSelectTab(session: string, tabIndex?: number): void {
  if (tabIndex === undefined) return;
  try {
    run(["--session", session, "action", "go-to-tab", String(tabIndex + 1)]);
  } catch {
    // Best effort only. Zellij requires a live client for some actions.
  }
}

function readStateForAssignment(session: string, assignment: PaneAssignment): PaneState | null {
  try {
    return readState(session, assignment.paneId);
  } catch {
    return null;
  }
}

export function parseSessionList(output: string): ZellijSessionListEntry[] {
  return stripAnsi(output)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const name = line.split(/\s+/)[0] ?? "";
      return {
        name,
        exited: line.includes("(EXITED"),
      };
    })
    .filter((entry) => entry.name.length > 0);
}

function listSessions(): ZellijSessionListEntry[] {
  try {
    return parseSessionList(run(["list-sessions"]));
  } catch {
    return [];
  }
}

function waitForSessionPresence(name: string, shouldExist: boolean, timeoutMs = 3000): void {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const exists = hasAnySession(name);
    if (exists === shouldExist) return;
    Bun.sleepSync(100);
  }

  const state = shouldExist ? "appear" : "disappear";
  throw new Error(`Timed out waiting for session "${name}" to ${state}.`);
}

function hasAnySession(name: string): boolean {
  return listSessions().some((session) => session.name === name);
}

export function sessionExists(name: string): boolean {
  return hasAnySession(name);
}

export function hasSession(name: string): boolean {
  return listSessions().some((session) => session.name === name && !session.exited);
}

export function startSession(config: MuxConfig, detach = true): void {
  if (hasAnySession(config.session) && !hasSession(config.session)) {
    deleteSession(config.session);
    waitForSessionPresence(config.session, false);
  }

  initializeRuntime(config);
  writeManifest(config);

  const layout = generateManagedLayout(config);
  writeFileSync(getGeneratedLayoutPath(config.session), layout, "utf8");

  const generatedConfig = generateConfig(detach);
  writeFileSync(getGeneratedConfigPath(config.session), generatedConfig, "utf8");

  startWithLayout(
    config.session,
    getGeneratedLayoutPath(config.session),
    getGeneratedConfigPath(config.session),
    detach
  );

  if (!config.zellij?.layout) {
    const assignments = waitForAssignments(config);
    writeAssignments(config.session, assignments);
  }

  if (!detach) {
    attach(config.session, config.selectWindow);
  }
}

export function killSession(name: string): void {
  const kill = tryRun(["kill-session", name]);
  if (!kill.ok && !kill.error.includes(`No session named ${name} found`)) {
    throw new Error(kill.error);
  }
  deleteSession(name);
  rmSync(getRuntimeDir(name), { recursive: true, force: true });
  waitForSessionPresence(name, false);
}

export function deleteSession(name: string): void {
  const remove = tryRun(["delete-session", "--force", name]);
  if (
    !remove.ok &&
    !remove.error.includes(`No session named ${name} found`) &&
    !remove.error.includes(`No session with the name ${name} found`)
  ) {
    throw new Error(remove.error);
  }
}

export function attach(session: string, selectWindowIndex?: number): void {
  maybeSelectTab(session, selectWindowIndex);
  const proc = Bun.spawnSync(["zellij", "attach", session], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(proc.exitCode ?? 0);
}

export function isManagedMode(config: MuxConfig): boolean {
  return !config.zellij?.layout;
}

export function getPaneAssignment(config: MuxConfig, paneName: string): PaneAssignment {
  if (!isManagedMode(config)) {
    throw new Error(`Pane automation is not available when using zellij.layout`);
  }

  const pane = flattenPanes(config).find((item) => item.paneName === paneName);
  if (!pane) {
    throw new Error(`Unknown pane: ${paneName}`);
  }

  const metadata = readSessionMetadata(config.session);
  const livePane = metadata.panes.find((item) => item.title === paneName);
  if (!livePane) {
    throw new Error(`Pane ${paneName} not found in zellij session.`);
  }

  if (!existsSync(getAssignmentPath(config.session, livePane.id))) {
    throw new Error("Pane automation is only available for sessions started with mux start --detach.");
  }

  return readAssignment(config.session, livePane.id);
}

export function listWindows(config: MuxConfig): {
  index: string;
  name: string;
  active: boolean;
}[] {
  if (config.zellij?.layout) {
    const metadata = readSessionMetadata(config.session);
    return metadata.tabs.map((tab) => ({
      index: String(tab.position),
      name: tab.name,
      active: false,
    }));
  }

  return config.windows.map((window, index) => ({
    index: String(index),
    name: window.name,
    active: false,
  }));
}

export function listPanes(config: MuxConfig, windowIndex: number): {
  id: string;
  index: string;
  title: string;
  active: boolean;
  status: string;
}[] {
  if (config.zellij?.layout) {
    const metadata = readSessionMetadata(config.session);
    return metadata.panes
      .filter((pane) => pane.tabPosition === windowIndex)
      .map((pane, index) => ({
        id: String(pane.id),
        index: String(index),
        title: pane.title,
        active: false,
        status: "running",
      }));
  }

  return flattenPanes(config)
    .filter((pane) => pane.windowIndex === windowIndex)
    .map((pane, index) => {
      const assignment = readSessionMetadata(config.session).panes.find(
        (item) => item.title === pane.paneName
      );
      const state = assignment
        ? existsSync(getAssignmentPath(config.session, assignment.id))
          ? readStateForAssignment(config.session, readAssignment(config.session, assignment.id))
          : null
        : null;
      return {
        id: assignment ? String(assignment.id) : "-",
        index: String(index),
        title: pane.paneName,
        active: false,
        status: state?.status ?? (assignment ? "interactive" : "booting"),
      };
    });
}

export function capturePaneLog(config: MuxConfig, paneName: string): string {
  const assignment = getPaneAssignment(config, paneName);
  if (!existsSync(assignment.logPath)) return "";
  return readFileSync(assignment.logPath, "utf8");
}

export function restartPane(config: MuxConfig, paneName: string): void {
  const assignment = getPaneAssignment(config, paneName);
  enqueuePaneCommand(config.session, assignment.paneId, { type: "restart" });
}

export function sendKeys(config: MuxConfig, paneName: string, command: string): void {
  const assignment = getPaneAssignment(config, paneName);
  enqueuePaneCommand(config.session, assignment.paneId, { type: "run", command });
}

export function sendRawKeys(config: MuxConfig, paneName: string, keys: string): void {
  const assignment = getPaneAssignment(config, paneName);
  enqueuePaneCommand(config.session, assignment.paneId, { type: "keys", keys });
}

export function getRuntimeSummary(config: MuxConfig): {
  paneName: string;
  windowName: string;
  state: PaneState | null;
}[] {
  if (!isManagedMode(config)) return [];

  return flattenPanes(config).map((pane) => {
    const metadata = readSessionMetadata(config.session).panes.find(
      (item) => item.title === pane.paneName
    );
    const state =
      metadata && existsSync(getAssignmentPath(config.session, metadata.id))
        ? readState(config.session, metadata.id)
        : null;
    return {
      paneName: pane.paneName,
      windowName: pane.windowName,
      state,
    };
  });
}

export function getLayoutSource(config: MuxConfig): string {
  return config.zellij?.layout ? basename(config.zellij.layout) : getLayoutCachePath(config.session);
}
