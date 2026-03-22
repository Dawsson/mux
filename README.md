# mux

Configurable `zellij` session manager for dev workflows. `mux` reads the nearest `.muxrc` or `"mux"` key in `package.json`, starts a named Zellij session, and manages pane commands through a small supervisor process so `logs`, `restart`, and `send` still work in detached sessions.

## Install

```bash
bun install -g mux
```

Or run it directly:

```bash
bun run src/cli.ts
```

## Config

### Managed mode

This is the default, full-feature mode. `mux` generates the Zellij layout for you and supports `logs`, `restart`, and `send`.

```json
{
  "mux": {
    "session": "my-project",
    "selectWindow": 0,
    "windows": [
      {
        "name": "server",
        "panes": [
          { "name": "api", "cmd": "bun run dev", "cwd": "packages/api" },
          { "name": "worker", "cmd": "bun run worker", "cwd": "packages/api" }
        ]
      },
      {
        "name": "client",
        "panes": [
          { "name": "web", "cmd": "bun run start", "cwd": "packages/web" },
          { "name": "expo", "cmd": "bun expo start", "cwd": "apps/mobile" }
        ]
      }
    ]
  }
}
```

- `session` defaults to the project directory name.
- `selectWindow` is the tab index to focus when attaching.
- Pane names must be unique across the whole config.

### Native Zellij layout mode

If you already have a hand-written Zellij layout, `mux` can launch it directly:

```json
{
  "mux": {
    "session": "my-project",
    "zellij": {
      "layout": "layouts/dev.kdl"
    }
  }
}
```

This mode is launch-only in `v0.6.x`: `start`, `stop`, and `status` work, but `logs`, `restart`, and `send` are only available in managed mode.

## Commands

| Command | Description |
| --- | --- |
| `mux` | Start the session if needed, then attach |
| `mux start` | Start the session, then attach |
| `mux start --detach` | Start in the background without attaching |
| `mux stop` | Kill the Zellij session |
| `mux status` | Show configured windows/panes and their runtime status |
| `mux logs [pane]` | Print pane logs from `/tmp/mux-<session>/logs` |
| `mux restart [pane]` | Restart one pane or every pane |
| `mux send <pane> <cmd>` | Queue a shell command for a managed pane |
| `mux send <pane> --keys <keys>` | Send supported control keys (`C-c`, `C-d`, `Enter`) or raw text |

## Runtime files

`mux` writes runtime state to `/tmp/mux-<session>/`:

- `layout.kdl` and `zellij.config.kdl` for generated sessions
- `manifest.json` plus pane assignment/state files
- `logs/<pane>.log` for `mux logs`

## Notes

- `mux` expects `zellij` to be installed and available on `PATH`.
- Managed panes run under a `mux` supervisor process so automation works in detached sessions.
- `send --keys` is intentionally narrower than old tmux passthrough; use `C-c`, `C-d`, `Enter`, or plain text.
