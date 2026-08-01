#!/usr/bin/env node
// Cross-platform dev-process orchestrator.
//
// Runs several long-running dev commands concurrently, prefixes each output
// line with a short colored label, and tears down the entire process tree on
// Ctrl+C — including grandchildren (e.g. esbuild spawned by Vite, workers
// spawned by tsx) — on Windows (taskkill /T /F) and POSIX (process groups).
//
// This replaces the previous `bash -c '... & wait'` orchestrator, which is
// unreliable under Git Bash on Windows: `trap "kill 0" EXIT` does not reliably
// signal grandchildren across MSYS process-group emulation, so Vite could be
// killed while the API server survived.
//
// Usage:
//   node scripts/dev.mjs <spec> [<spec> ...]
//
// Each <spec> is one of:
//   npm:<script>   runs `npm run <script>` and labels output with <script>
//   "<command>"    runs the raw command and labels output with its first token
//
// Examples:
//   node scripts/dev.mjs npm:dev:sessiond npm:dev:web npm:dev:client
//   node scripts/dev.mjs npm:dev:plugins "tsx watch src/server/index.ts"

import { spawn, spawnSync } from "node:child_process";
import { argv, exit, platform, stdout, stderr } from "node:process";

const isWindows = platform === "win32";
const useColor = Boolean(stdout.isTTY);

const PALETTE = ["cyan", "magenta", "green", "yellow", "blue", "red"];
const ANSI = useColor
  ? {
      cyan: "\x1b[36m",
      magenta: "\x1b[35m",
      green: "\x1b[32m",
      yellow: "\x1b[33m",
      blue: "\x1b[34m",
      red: "\x1b[31m",
      gray: "\x1b[90m",
      reset: "\x1b[0m",
    }
  : { cyan: "", magenta: "", green: "", yellow: "", blue: "", red: "", gray: "", reset: "" };

const specs = argv.slice(2);
if (specs.length === 0) {
  stderr.write(`${ANSI.red}dev: no commands given.${ANSI.reset}\n`);
  stderr.write('Usage: node scripts/dev.mjs <npm:script | "command">...\n');
  exit(1);
}

function parseSpec(spec) {
  if (spec.startsWith("npm:")) {
    const script = spec.slice("npm:".length);
    return { label: script, command: `npm run ${script}` };
  }
  return { label: spec.split(/\s+/)[0], command: spec };
}

const tasks = specs.map((spec, index) => ({
  ...parseSpec(spec),
  color: PALETTE[index % PALETTE.length],
  child: null,
  exited: false,
  code: null,
}));

const labelWidth = Math.max(...tasks.map((task) => task.label.length));
const tagFor = (task) => `${ANSI[task.color]}[${task.label.padEnd(labelWidth)}]${ANSI.reset}`;

stdout.write(`${ANSI.gray}[dev] starting ${String(tasks.length)} task(s): ${tasks.map((task) => task.label).join(", ")}${ANSI.reset}\n`);

// Kill a process and every descendant it spawned. Windows needs /T to walk the
// tree; on POSIX we spawned each child detached as its own process-group
// leader, so signaling -pid reaches the whole group (and its grandchildren).
function killTree(pid) {
  if (pid === undefined) return;
  if (isWindows) {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      /* process group already gone */
    }
  }
}

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  stdout.write(`${ANSI.gray}[dev] stopping all tasks${ANSI.reset}\n`);
  for (const task of tasks) killTree(task.child?.pid);
  // Give the tree a moment to die, then exit. unref() so this never keeps the
  // process alive on its own.
  setTimeout(() => exit(0), 250).unref();
}

function attachOutput(task, stream) {
  if (stream === null) return;
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      stdout.write(`${tagFor(task)} ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffer.length > 0) {
      stdout.write(`${tagFor(task)} ${buffer.replace(/\r$/, "")}\n`);
    }
  });
}

function markExited(task, code) {
  if (task.exited || shuttingDown) return;
  task.exited = true;
  task.code = code;
  const detail = code === null ? "via signal" : `with code ${String(code)}`;
  stdout.write(`${tagFor(task)} ${ANSI.gray}exited ${detail}${ANSI.reset}\n`);
  if (tasks.every((other) => other.exited)) {
    exit(tasks.reduce((worst, other) => Math.max(worst, other.code ?? 0), 0));
  }
}

for (const task of tasks) {
  const child = spawn(task.command, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    // POSIX: new process group so -pid reaches grandchildren. Windows relies on
    // taskkill /T instead and must NOT detach (detaching opens a new console).
    detached: !isWindows,
  });
  task.child = child;
  attachOutput(task, child.stdout);
  attachOutput(task, child.stderr);
  child.on("exit", (code) => markExited(task, code));
  child.on("error", (error) => {
    stderr.write(`${tagFor(task)} ${ANSI.red}failed to start: ${error.message}${ANSI.reset}\n`);
    markExited(task, 1);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
