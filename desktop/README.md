# PI WEB Desktop

Electron shell that ships the existing PI WEB web UI as a native desktop app
(Windows first). The web server, session daemon, and Lit SPA are reused
unchanged; this package only adds the Electron main/preload and packaging.

## Architecture

- **Main process** (`src/main/index.ts`): orchestrator. In a packaged build it
  spawns the session daemon and web server as isolated Node processes
  (`ELECTRON_RUN_AS_NODE=1`) on ephemeral loopback ports, then loads the web UI
  from the server. In development it only loads the Vite renderer URL; the dev
  script provides sessiond/server/renderer concurrently.
- **Preload** (`src/preload/index.ts`): exposes a tiny `window.piWebDesktop`
  surface so the SPA can detect the desktop shell. No Node access leaks to the
  renderer.
- **Renderer**: the unchanged Lit SPA under `src/client`, built by the root
  `vite.config.ts` and served by the Fastify web server.

Sessiond and the web server communicate over plain TCP
(`PI_WEB_SESSIOND_URL`), sidestepping the unix-socket path that has no
first-class Windows story.

## Development

From the repository root:

```bash
npm install
npm run dev:desktop
```

This runs sessiond, the web server, the Vite renderer, and the Electron main
concurrently. The window loads `http://localhost:8505` (the Vite renderer),
which proxies `/api` to the web server on `8504`.

## Type checking

```bash
npm run typecheck:desktop
```

Desktop sources use `desktop/tsconfig.json` and are deliberately kept out of
the main `npm run verify` flow so Electron types never affect the web build.

## Packaging (Windows)

```bash
npm run build:desktop
```

Produces an NSIS installer under `desktop/release/`. `node-pty` is rebuilt
against Electron's ABI during packaging (`npmRebuild`). See `docs/desktop.md`
for the full runtime and configuration reference.
