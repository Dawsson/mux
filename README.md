# mux

Configurable tmux session manager for dev workflows. Reads pane config from `package.json` and manages named tmux sessions.

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
    "panes": [
      { "name": "api",  "cmd": "bun run dev",       "cwd": "packages/api" },
      { "name": "web",  "cmd": "bun run start",      "cwd": "packages/web" },
      { "name": "expo", "cmd": "bun expo start",     "cwd": "apps/mobile"  }
    ]
  }
}
```

- `session` — tmux session name (defaults to directory basename)
- `panes[].name` — pane identifier used in commands
- `panes[].cmd` — shell command to run in the pane
- `panes[].cwd` — working directory relative to project root (optional)

## Commands

| Command              | Description                                      |
|----------------------|--------------------------------------------------|
| `mux`                | Start session if not running, attach if it is   |
| `mux start`          | Explicit start, then attach                      |
| `mux start --detach` | Start in background (no attach), useful for CI  |
| `mux stop`           | Kill the session                                 |
| `mux status`         | List panes and their indices                     |
| `mux logs [pane]`    | Capture pane output (all panes if none given)   |
| `mux restart [pane]` | Restart a pane (all panes if none given)        |

## Logs

Pane output is available via `mux logs`. Session log files are written to `/tmp/mux-<session>/`.
