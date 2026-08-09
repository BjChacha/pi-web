import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { app } from "electron";

export type BackendRole = "sessiond" | "server";

export interface BackendProcess {
  readonly role: BackendRole;
  /** Terminate the backend gracefully, then force-kill on timeout. Idempotent. */
  kill(): Promise<void>;
}

export interface SpawnBackendOptions {
  role: BackendRole;
  env: Record<string, string>;
}

const BUILT_ENTRY: Record<BackendRole, string> = {
  sessiond: "dist/server/sessiond.js",
  server: "dist/server/index.js",
};

/**
 * Root that holds the shipped `dist/` and `node_modules/`.
 *
 * Packaged layout: `<exe>/resources/app` (asar disabled, see electron-builder.yml).
 * Development never reaches this code path: the dev script provides sessiond
 * and the web server out-of-band, so the main process only orchestrates in
 * packaged builds.
 */
function appRoot(): string {
  return app.isPackaged ? join(process.resourcesPath, "app") : process.cwd();
}

/**
 * Run a backend (sessiond or web server) as a pure Node process.
 *
 * A packaged Electron app ships no standalone `node` binary, so the backend
 * reuses the Electron executable with `ELECTRON_RUN_AS_NODE=1`, which makes it
 * behave as a regular Node runtime. `node-pty`'s native addon is rebuilt
 * against Electron's ABI during packaging (npmRebuild), so it dlopens cleanly
 * under this Node-mode process. Each backend keeps its own PID, so a crash in
 * one never tears down the UI or the other backend.
 */
export function spawnBackend(options: SpawnBackendOptions): BackendProcess {
  const entry = resolve(appRoot(), BUILT_ENTRY[options.role]);
  if (!existsSync(entry)) {
    throw new Error(`backend entry not found: ${entry}`);
  }

  const child = spawn(process.execPath, [entry], {
    cwd: appRoot(),
    env: { ...process.env, ...options.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  });

  child.once("error", (error) => {
    console.error(`[pi-web-desktop] ${options.role} failed to start`, error);
  });
  child.once("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`[pi-web-desktop] ${options.role} exited code=${code} signal=${signal ?? "null"}`);
    }
  });

  return { role: options.role, kill: () => terminate(options.role, child) };
}

function terminate(role: BackendRole, child: ChildProcess): Promise<void> {
  void role;
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolveExit) => {
    const force = setTimeout(() => child.kill("SIGKILL"), 4000);
    child.once("exit", () => {
      clearTimeout(force);
      resolveExit();
    });
    // SIGTERM routes into each backend's existing graceful-shutdown handler.
    child.kill("SIGTERM");
  });
}
