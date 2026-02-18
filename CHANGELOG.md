# Changelog

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
