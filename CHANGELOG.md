# Changelog

## [Unreleased]

- Reverted the runtime backend from `zellij` back to `tmux`
- Removed the deprecated Zellij backend and PTY supervisor code

## [0.6.1] - 2026-03-22

- Defaulted two-pane managed windows to side-by-side Zellij splits
- Replaced the pipe-based pane wrapper with a PTY-backed supervisor so interactive apps keep proper terminal behavior

## [0.6.0] - 2026-03-22

- Replaced the `tmux` backend with `zellij`
- Added a managed-pane supervisor so `logs`, `restart`, and `send` work in detached sessions
- Added optional `zellij.layout` config support for launch-only native layout mode
- Narrowed `mux send --keys` to supported control keys and plain text in the Zellij backend

## [0.5.0] - 2026-02-19

- Added `selectWindow` config option to control which window is focused when attaching (defaults to `0`)
- Fixed `mux restart` crashing when the tmux session has fewer panes than the config

## [0.4.0] - 2026-02-19

- Added `mux send <pane> <command>` to send commands to running panes
- Added `mux send <pane> --keys <keys>` to send raw tmux keys (e.g. `C-c`, `C-d`)

## [0.3.0] - 2026-02-18

- 2-pane windows now default to `even-horizontal` (side by side); 3+ panes default to `tiled`

## [0.2.0] - 2026-02-18

- **Breaking**: config schema now uses `windows[]` instead of top-level `panes[]` — wrap existing panes in a single `windows` entry
- Added multi-window support: multiple named windows per session, each with their own panes and optional `layout`
- Added `.muxrc` standalone config file support (takes precedence over `package.json`)

## [0.1.0] - 2026-02-17

- Initial release: reads `"mux"` key from nearest `package.json` and manages a named tmux session
- Commands: `start`, `stop`, `status`, `logs [pane]`, `restart [pane]`
- Added `.muxrc` standalone config file support (takes precedence over `package.json`)
- Added multi-window support via `windows[]` config schema — each window can have multiple panes and an optional `layout`
