# Changelog

## [0.1.0] - 2026-02-18

- Initial release: reads `"mux"` key from nearest `package.json` and manages a named tmux session
- Commands: `start`, `stop`, `status`, `logs [pane]`, `restart [pane]`
- Added `.muxrc` standalone config file support (takes precedence over `package.json`)
- Added multi-window support via `windows[]` config schema — each window can have multiple panes and an optional `layout`
