# Handoff: mux CLI

## What is this?

`mux` is a configurable `zellij` session manager. In managed mode it generates layouts from `windows[]` config and runs each pane under a PTY-backed supervisor so interactive apps behave correctly while `logs`, `restart`, and `send` still work.

## Current State

The Zellij migration is implemented.

## Main Files

- `src/config.ts` — config discovery, validation, `zellij.layout` support, unique pane-name enforcement
- `src/runtime.ts` — runtime directories, manifest/assignment/state helpers under `/tmp/mux-<session>/`
- `src/zellij.ts` — session startup/attach/kill, generated layout/config writing, assignment discovery from Zellij metadata
- `src/pane-supervisor.py` — PTY-backed shell wrapper used in managed mode
- `src/cli.ts` — user-facing commands
- `src/mux.test.ts` — config tests
- `src/send.integration.test.ts` — end-to-end Zellij integration coverage

## Important Behavior

- Managed mode:
  - Config uses `windows[]` and `panes[]`
  - Supports `start`, `stop`, `status`, `logs`, `restart`, `send`
- Native layout mode:
  - Config uses `zellij.layout`
  - Supports `start`, `stop`, `status`
  - `logs`, `restart`, and `send` intentionally error out

## Verify

```bash
bunx tsc --noEmit
bun test
```
