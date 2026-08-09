# PI WEB Desktop

PI WEB Desktop is the Electron wrapper that ships the PI WEB web UI as a native
Windows application, reusing the web server, session daemon, and Lit SPA without
modification.

## Why a desktop build

The web-based install runs sessiond and the web server as OS services
(systemd/launchd). Those backends have no Windows equivalent, so the desktop
shell is the supported way to run PI WEB natively on Windows: it owns the
backend processes for the lifetime of the app and tears them down on quit.

## How it runs

| Process | Role |
|---|---|
| Electron main (`desktop/src/main`) | Orchestrator: spawns backends, opens the window |
| Session daemon (`dist/server/sessiond.js`) | Agent sessions, terminals (node-pty) |
| Web server (`dist/server/index.js`) | Fastify HTTP + WebSocket, serves the SPA |
| Renderer | The unchanged Lit SPA from `src/client` |

In a packaged build the main process starts sessiond and the web server with
`ELECTRON_RUN_AS_NODE=1` (the Electron binary acting as Node) on ephemeral
loopback ports. The web server reaches sessiond over `PI_WEB_SESSIOND_URL`
(plain TCP), avoiding the unix-socket path entirely. The window loads the web
server URL, so every request — including the SPA's relative `/api` and
WebSocket paths — resolves exactly as in the browser.

## Windows terminal support

`node-pty` spawns the shell resolved by `resolveInteractiveShell()`:

1. `PI_WEB_SHELL` if set (for example `pwsh.exe`, or a Git Bash path).
2. `COMSPEC` (usually `cmd.exe`) on Windows.
3. `SHELL`, falling back to `/bin/bash`, on other platforms.

One-shot command runs use cmd or PowerShell equivalents of the bash login-shell
script. Windows metacharacter quoting is best-effort; commands heavy on
`& | < > %` may not round-trip exactly.

## Configuration

The desktop app reads the same config as the web install:

- Global: `$PI_WEB_CONFIG` / `~/.config/pi-web/config.json`
- Data: `PI_WEB_DATA_DIR` / `~/.pi-web`

Override the terminal shell with `PI_WEB_SHELL`.

## Development and packaging

See [`desktop/README.md`](../desktop/README.md).
