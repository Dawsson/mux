# mux

Configurable `tmux` session manager for dev workflows. `mux` reads the nearest `.muxrc` or `"mux"` key in `package.json` and manages a named tmux session.

## Install

```bash
bun install -g mux
```

Or run directly with `bun run src/cli.ts`.

## Config

Add a `"mux"` key to your project's `package.json`:

```json
{
  "mux": {
    "session": "my-project",
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
- `selectWindow` is the window index to focus when attaching.
- Pane names must be unique across the whole config.
- Two-pane windows default to side-by-side. Set `layout: "even-vertical"` if you want stacked panes instead.

## Commands

| Command | Description |
| --- | --- |
| `mux` | Start the session if needed, then attach |
| `mux start` | Start the session, then attach |
| `mux start --detach` | Start in the background without attaching |
| `mux stop` | Kill the tmux session |
| `mux status` | Show configured windows and panes |
| `mux logs [pane]` | Capture pane output |
| `mux restart [pane]` | Restart one pane or every pane |
| `mux send <pane> <cmd>` | Send a command to a pane |
| `mux send <pane> --keys <keys>` | Send raw tmux keys (for example `C-c`, `C-d`) |

## Logs

Pane output is available via `mux logs`, which reads from `tmux capture-pane`.

## Notes

- `mux` expects `tmux` to be installed and available on `PATH`.
- `mux logs` reads from `tmux capture-pane`.
