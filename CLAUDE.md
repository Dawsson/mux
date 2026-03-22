READ ~/projects/agent-scripts/AGENTS.md BEFORE ANYTHING (skip if missing).

# mux — Dev Instructions

## Project Overview

`mux` is a Bun CLI that manages `zellij` development sessions. It loads the nearest `.muxrc` or `"mux"` block in `package.json`, starts a named session, and uses a pane supervisor so detached panes still support `logs`, `restart`, and `send`.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict mode)
- **Multiplexer**: Zellij
- **Tests**: `bun test`

## File Structure

```text
src/
  cli.ts                   — argv parsing and command dispatch
  config.ts                — config discovery and validation
  runtime.ts               — runtime file paths, manifest/state helpers
  zellij.ts                — zellij session orchestration and pane lookup
  pane-supervisor.ts       — long-lived pane process supervisor
  mux.test.ts              — config parsing tests
  send.integration.test.ts — real zellij integration coverage
```

## Commands

```bash
bunx tsc --noEmit
bun test
bun run src/cli.ts --help
```

## Key Constraints

- Use Bun, not npm.
- Keep `.muxrc` and `package.json` config discovery behavior intact.
- Managed mode (`windows[]`) is the full-feature path.
- Native `zellij.layout` mode is launcher-only unless pane mapping is added later.
- Runtime files live under `/tmp/mux-<session>/`.
- Integration tests require a working `zellij` binary on `PATH`.
