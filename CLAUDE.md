READ ~/projects/agent-scripts/AGENTS.md BEFORE ANYTHING (skip if missing).

# mux — Dev Instructions

## Project Overview

`mux` is a CLI tmux session manager. It reads a `"mux"` key from the nearest `package.json` (walking up from cwd) and manages a named tmux session with the specified panes.

## Tech Stack

- **Runtime**: Bun (not Node.js)
- **Language**: TypeScript (strict mode)
- **Test runner**: `bun test`
- **All tmux operations**: synchronous via `Bun.spawnSync`

## File Structure

```
src/
  config.ts     — findConfig() walks up dirs, parseConfig() validates
  tmux.ts       — thin wrappers around tmux CLI + startSession() orchestrator
  cli.ts        — argv parsing and command dispatch
  mux.test.ts   — unit tests for config parsing only (don't test tmux)
```

## Commands

```bash
bun install          # install deps
bunx tsc --noEmit    # typecheck
bun test             # run tests
bun run src/cli.ts   # run the CLI
```

## Key Constraints

- Do not add a config file — all config lives in the consumer's `package.json`
- Tmux operations stay synchronous
- Tests cover config parsing only; tmux shell commands are not unit tested
- Logs go to `/tmp/mux-<session>/`
