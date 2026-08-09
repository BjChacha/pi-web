import { BrowserWindow, app, shell } from "electron";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnBackend, type BackendProcess } from "./processHost.js";

const SESSIOND_HEALTH = "/health";

let mainWindow: BrowserWindow | null = null;
const ownedBackends: BackendProcess[] = [];

interface ResolvedRuntime {
  /** URL the renderer (existing Lit SPA) is served from. */
  readonly rendererUrl: string;
}

/**
 * Entry point for the packaged shell: bring up sessiond + the web server as
 * isolated Node processes and point a BrowserWindow at the server.
 *
 * In development the dev script runs sessiond, the web server, and the Vite
 * renderer concurrently; the main process then only loads the renderer URL set
 * via PI_WEB_DESKTOP_DEV_RENDERER_URL and owns no backends.
 */
async function bootstrap(): Promise<void> {
  const runtime = await resolveRuntime();
  createWindow(runtime.rendererUrl);
}

async function resolveRuntime(): Promise<ResolvedRuntime> {
  const devRenderer = nonEmpty(process.env["PI_WEB_DESKTOP_DEV_RENDERER_URL"]);
  if (devRenderer !== undefined) {
    return { rendererUrl: devRenderer };
  }

  // Keep sessiond and the web server on ephemeral loopback ports. The web
  // server reaches sessiond over plain TCP (PI_WEB_SESSIOND_URL), sidestepping
  // the unix-socket path that has no first-class story on Windows.
  const sessiondPort = await allocatePort();
  const serverPort = await allocatePort();
  const sessiondOrigin = `http://127.0.0.1:${sessiondPort}`;
  const env: Record<string, string> = {
    PI_WEB_HOST: "127.0.0.1",
    PI_WEB_PORT: String(serverPort),
    PI_WEB_SESSIOND_URL: sessiondOrigin,
    PI_WEB_SESSIOND_HOST: "127.0.0.1",
    PI_WEB_SESSIOND_PORT: String(sessiondPort),
  };

  const sessiond = spawnBackend({ role: "sessiond", env });
  ownedBackends.push(sessiond);
  await waitForHttp(`${sessiondOrigin}${SESSIOND_HEALTH}`);

  const server = spawnBackend({ role: "server", env });
  ownedBackends.push(server);
  await waitForHttp(`http://127.0.0.1:${serverPort}/`);

  return { rendererUrl: `http://127.0.0.1:${serverPort}/` };
}

function createWindow(rendererUrl: string): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#0d1117",
    title: "PI WEB",
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      // Kept off so the preload can read process info. The renderer still gets
      // no direct Node access; revisit once the exposed surface stabilizes.
      sandbox: false,
    },
  });

  void mainWindow.loadURL(rendererUrl);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function preloadPath(): string {
  // electron-vite emits out/main/index.js and out/preload/index.js as siblings.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "preload", "index.js");
}

async function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("could not allocate a local port"));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(1000), cache: "no-store" });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`backend at ${url} did not become ready: ${String(lastError)}`);
}

async function teardown(): Promise<void> {
  await Promise.allSettled(ownedBackends.map((backend) => backend.kill()));
  ownedBackends.length = 0;
  if (process.platform !== "darwin") {
    app.quit();
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

app.on("window-all-closed", () => {
  void teardown();
});

app.whenReady().then(() => {
  void bootstrap().catch((error) => {
    console.error("[pi-web-desktop] bootstrap failed", error);
    void teardown();
  });
});
