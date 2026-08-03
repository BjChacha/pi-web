import { describe, expect, it } from "vitest";
import type { ReactiveControllerHost } from "lit";
import type { SessionInfo } from "../api";
import { sessionTabKey } from "../sessionTabs";
import { SessionTabsController } from "./sessionTabsController";
import type { KeyValueStorage } from "./sessionStorageMemory";

describe("SessionTabsController", () => {
  it("starts empty when storage has nothing persisted", () => {
    const controller = new SessionTabsController(createFakeHost(), { storage: memoryStorage() });
    expect(controller.allTabs()).toEqual([]);
  });

  it("records a visited session and persists it", () => {
    const storage = memoryStorage();
    const host = createFakeHost();
    const controller = new SessionTabsController(host, { storage });

    controller.record("local", session("s1"), ctx());

    expect(controller.allTabs().map((tab) => tab.sessionId)).toEqual(["s1"]);
    expect(host.updateRequested).toBe(1);

    const restored = new SessionTabsController(createFakeHost(), { storage });
    expect(restored.allTabs().map((tab) => tab.sessionId)).toEqual(["s1"]);
  });

  it("restores persisted tabs from a previous controller instance", () => {
    const storage = memoryStorage();
    const first = new SessionTabsController(createFakeHost(), { storage });
    first.record("local", session("a"), ctx());
    first.record("local", session("b"), ctx());

    const restored = new SessionTabsController(createFakeHost(), { storage });
    expect(restored.allTabs().map((tab) => tab.sessionId)).toEqual(["a", "b"]);
  });

  it("toggles pin, closes, and forgets tabs while persisting each change", () => {
    const storage = memoryStorage();
    const host = createFakeHost();
    const controller = new SessionTabsController(host, { storage });
    controller.record("local", session("a"), ctx());
    controller.record("local", session("b"), ctx());

    const beforePin = host.updateRequested;
    controller.togglePin(sessionTabKey("local", "a"));
    expect(controller.allTabs().find((tab) => tab.sessionId === "a")?.pinned).toBe(true);
    expect(host.updateRequested).toBe(beforePin + 1);

    controller.close(sessionTabKey("local", "b"));
    expect(controller.allTabs().map((tab) => tab.sessionId)).toEqual(["a"]);

    controller.forget([sessionTabKey("local", "a")]);
    expect(controller.allTabs()).toEqual([]);

    // All mutations persisted: a fresh controller sees the final empty state.
    expect(new SessionTabsController(createFakeHost(), { storage }).allTabs()).toEqual([]);
  });

  it("does not request an update or write when a mutation changes nothing", () => {
    const storage = memoryStorage();
    const host = createFakeHost();
    const controller = new SessionTabsController(host, { storage });

    controller.togglePin(sessionTabKey("local", "missing"));
    controller.close(sessionTabKey("local", "missing"));
    controller.forget([sessionTabKey("local", "missing")]);

    expect(host.updateRequested).toBe(0);
    expect(storage.getItem("pi-web:session-tabs:v1")).toBeNull();
  });

  it("respects the configured limit when recording many sessions", () => {
    const controller = new SessionTabsController(createFakeHost(), { storage: memoryStorage(), limit: 2 });
    controller.record("local", session("a"), ctx());
    controller.record("local", session("b"), ctx());
    controller.record("local", session("c"), ctx());
    expect(controller.allTabs().map((tab) => tab.sessionId)).toEqual(["b", "c"]);
  });

  it("reorders a tab onto another tab's slot and persists it", () => {
    const storage = memoryStorage();
    const controller = new SessionTabsController(createFakeHost(), { storage });
    controller.record("local", session("a"), ctx());
    controller.record("local", session("b"), ctx());
    controller.record("local", session("c"), ctx());

    controller.reorder(sessionTabKey("local", "a"), sessionTabKey("local", "c"));

    expect(controller.allTabs().map((tab) => tab.sessionId)).toEqual(["b", "a", "c"]);
    expect(new SessionTabsController(createFakeHost(), { storage }).allTabs().map((tab) => tab.sessionId)).toEqual(["b", "a", "c"]);
  });

  it("survives a storage that throws on read", () => {
    const storage = throwingStorage();
    const controller = new SessionTabsController(createFakeHost(), { storage });
    expect(controller.allTabs()).toEqual([]);
  });

  it("survives a storage that throws on write but keeps the in-memory tab", () => {
    const storage = throwingStorage();
    const controller = new SessionTabsController(createFakeHost(), { storage });
    controller.record("local", session("s1"), ctx());
    expect(controller.allTabs().map((tab) => tab.sessionId)).toEqual(["s1"]);
  });
});

function ctx() {
  return { projectId: "p1", workspaceId: "w1", projectLabel: "main" };
}

function session(id: string): SessionInfo {
  return {
    id,
    path: `/tmp/project/.pi/sessions/${id}.jsonl`,
    cwd: "/tmp/project",
    created: "2026-01-01T00:00:00.000Z",
    modified: "2026-01-01T00:00:00.000Z",
    messageCount: 0,
    firstMessage: "",
  };
}

function createFakeHost(): ReactiveControllerHost & { updateRequested: number } {
  let updateRequested = 0;
  const host = {
    addController: () => undefined,
    removeController: () => undefined,
    requestUpdate: () => { updateRequested += 1; },
    get updateRequested() { return updateRequested; },
    updateComplete: Promise.resolve(true),
  };
  return host;
}

function memoryStorage(seed: Record<string, string> = {}): KeyValueStorage {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function throwingStorage(): KeyValueStorage {
  const fail = (): never => {
    throw new Error("storage unavailable");
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}
