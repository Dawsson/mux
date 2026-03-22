import { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import type { MuxConfig, PaneConfig } from "./config";

export type PaneStatus = "booting" | "idle" | "running" | "stopped" | "error";

export interface RuntimePaneConfig {
  windowIndex: number;
  paneIndex: number;
  windowName: string;
  paneName: string;
  cmd: string;
  cwd: string;
}

export interface RuntimeManifest {
  session: string;
  root: string;
  panes: RuntimePaneConfig[];
}

export interface PaneAssignment extends RuntimePaneConfig {
  paneId: number;
  tabIndex: number;
  logPath: string;
  statePath: string;
  commandPath: string;
}

export interface PaneState {
  paneId: number;
  paneName: string;
  windowName: string;
  status: PaneStatus;
  shellPid?: number;
  startedAt?: string;
  updatedAt: string;
  currentCommand?: string;
  lastCompletedCommand?: string;
  lastExitCode?: number;
  error?: string;
}

interface PaneIndex {
  [paneName: string]: number;
}

function runtimeDir(session: string): string {
  return `/tmp/mux-${session}`;
}

export function getRuntimeDir(session: string): string {
  return runtimeDir(session);
}

export function getManifestPath(session: string): string {
  return join(runtimeDir(session), "manifest.json");
}

export function getAssignmentsDir(session: string): string {
  return join(runtimeDir(session), "assignments");
}

export function getCommandsDir(session: string): string {
  return join(runtimeDir(session), "commands");
}

export function getStatesDir(session: string): string {
  return join(runtimeDir(session), "states");
}

export function getLogsDir(session: string): string {
  return join(runtimeDir(session), "logs");
}

export function getPaneIndexPath(session: string): string {
  return join(runtimeDir(session), "pane-index.json");
}

export function getGeneratedLayoutPath(session: string): string {
  return join(runtimeDir(session), "layout.kdl");
}

export function getGeneratedConfigPath(session: string): string {
  return join(runtimeDir(session), "zellij.config.kdl");
}

export function initializeRuntime(config: MuxConfig): void {
  const dir = runtimeDir(config.session);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  mkdirSync(getAssignmentsDir(config.session), { recursive: true });
  mkdirSync(getCommandsDir(config.session), { recursive: true });
  mkdirSync(getStatesDir(config.session), { recursive: true });
  mkdirSync(getLogsDir(config.session), { recursive: true });
}

export function flattenPanes(config: MuxConfig): RuntimePaneConfig[] {
  return config.windows.flatMap((window, windowIndex) =>
    window.panes.map((pane: PaneConfig, paneIndex) => ({
      windowIndex,
      paneIndex,
      windowName: window.name,
      paneName: pane.name,
      cmd: pane.cmd,
      cwd: pane.cwd ? join(config.root, pane.cwd) : config.root,
    }))
  );
}

export function writeManifest(config: MuxConfig): RuntimeManifest {
  const manifest: RuntimeManifest = {
    session: config.session,
    root: config.root,
    panes: flattenPanes(config),
  };
  writeJson(getManifestPath(config.session), manifest);
  return manifest;
}

export function readManifest(session: string): RuntimeManifest {
  return readJson<RuntimeManifest>(getManifestPath(session));
}

export function getAssignmentPath(session: string, paneId: number): string {
  return join(getAssignmentsDir(session), `${paneId}.json`);
}

export function getCommandQueuePath(session: string, paneId: number): string {
  return join(getCommandsDir(session), `${paneId}.ndjson`);
}

export function getStatePath(session: string, paneId: number): string {
  return join(getStatesDir(session), `${paneId}.json`);
}

export function getLogPath(session: string, paneName: string): string {
  return join(getLogsDir(session), `${paneName}.log`);
}

export function writeAssignments(session: string, assignments: PaneAssignment[]): void {
  const index: PaneIndex = {};
  for (const assignment of assignments) {
    writeJson(getAssignmentPath(session, assignment.paneId), assignment);
    index[assignment.paneName] = assignment.paneId;
    if (!existsSync(assignment.commandPath)) writeFileSync(assignment.commandPath, "", "utf8");
  }
  writeJson(getPaneIndexPath(session), index);
}

export function getPaneIdByName(session: string, paneName: string): number | null {
  if (!existsSync(getPaneIndexPath(session))) return null;
  const index = readJson<PaneIndex>(getPaneIndexPath(session));
  return typeof index[paneName] === "number" ? index[paneName] : null;
}

export function readAssignment(session: string, paneId: number): PaneAssignment {
  return readJson<PaneAssignment>(getAssignmentPath(session, paneId));
}

export function readState(session: string, paneId: number): PaneState | null {
  const path = getStatePath(session, paneId);
  if (!existsSync(path)) return null;
  return readJson<PaneState>(path);
}

export function writeState(session: string, state: PaneState): void {
  writeJson(getStatePath(session, state.paneId), state);
}

export function enqueuePaneCommand(
  session: string,
  paneId: number,
  command: Record<string, unknown>
): void {
  appendFileSync(getCommandQueuePath(session, paneId), `${JSON.stringify(command)}\n`, "utf8");
}

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
