# Handoff: mux CLI

## What is this?
A configurable tmux session manager. Reads pane config from `package.json` and manages tmux sessions for dev workflows.

## Current State
Repo reset is complete. Two of four source files are written. **Session was interrupted mid-build.**

## What's Done
- [x] Repo reset (deleted `.git`, old hotline source, `skills/`, `bun.lock`, re-ran `git init`)
- [x] `src/config.ts` — Config discovery (walk up dirs for `package.json` with `"mux"` key) + parsing + types
- [x] `src/tmux.ts` — All tmux helpers: session create/kill/attach, pane split/restart/capture, logging setup, `startSession()` orchestrator

## What's Left

### Build remaining source files
- [ ] `src/cli.ts` — CLI entry point + command routing. Commands:
  - `mux` (no args) → start if not running, attach if it is
  - `mux start [--detach]` → explicit start, `--detach` for headless/agent use
  - `mux stop` → kill session
  - `mux status` → show panes, running commands
  - `mux logs [pane]` → capture pane output (all panes if none specified)
  - `mux restart [pane]` → restart specific pane or all
- [ ] `src/mux.test.ts` — Config parsing tests (valid config, missing fields, defaults). Don't test tmux directly.

### Update project files
- [ ] `package.json` — Rewrite metadata:
  - name: `mux`, bin: `{ "mux": "src/cli.ts" }`, description: "Configurable tmux session manager for dev workflows"
  - Keep `bun-types` devDep, `"type": "module"`, scripts.test: `"bun test"`
- [ ] `README.md` — Quick install, config example, command reference
- [ ] `CLAUDE.md` — Dev instructions for the mux project

### Verify & push
- [ ] `bun install` (regenerate lockfile)
- [ ] `bunx tsc --noEmit` — no type errors
- [ ] `bun test` — config parsing tests pass
- [ ] `bun run src/cli.ts` — shows help/usage
- [ ] `git add -A && git commit`
- [ ] `gh repo create dawsson/mux --public --source=. --push`

## Config Format (for consumer's `package.json`)
```json
{
  "mux": {
    "session": "my-project",
    "panes": [
      { "name": "api", "cmd": "bun run dev", "cwd": "packages/api" },
      { "name": "expo", "cmd": "bun expo start", "cwd": "apps/mobile" }
    ]
  }
}
```

## Architecture
- `src/config.ts` — `findConfig()` walks up from cwd, `parseConfig()` validates. Types: `MuxConfig`, `PaneConfig`
- `src/tmux.ts` — Thin wrappers around `Bun.spawnSync("tmux", [...])`. Key function: `startSession(config)` orchestrates full session creation
- `src/cli.ts` — Parse `process.argv`, route to commands, call config + tmux modules
- All tmux ops are synchronous via `Bun.spawnSync` (tmux is fast, no need for async)

## Key Decisions
- Single `package.json` config (no separate config file)
- Session name defaults to directory basename if not specified
- Pane layout uses tmux `tiled` layout
- Logs go to `/tmp/mux-<session>/<pane>.log`
- `mux` with no args is the happy path (start or attach)
