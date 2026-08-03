import { describe, expect, it } from "vitest";
import type { PendingAskUser, PendingExtensionDialog, SessionActivity, SessionInfo, SessionStatus } from "./api";
import {
  DEFAULT_SESSION_TAB_LIMIT,
  buildSessionTab,
  deserializeSessionTabs,
  enforceSessionTabLimit,
  forgetSessionTabs,
  isActiveTab,
  moveSessionTab,
  recordVisited,
  removeSessionTab,
  resolveSessionTitle,
  serializeSessionTabs,
  sessionTabKey,
  sessionTabStatusKind,
  sessionTabsForMachine,
  tabKey,
  toggleSessionTabPin,
  type SessionTab,
} from "./sessionTabs";

describe("resolveSessionTitle", () => {
  it("prefers an explicit name", () => {
    expect(resolveSessionTitle(session("s1", { name: "Named", firstMessage: "Hello" }))).toBe("Named");
  });

  it("falls back to the first message when there is no name", () => {
    expect(resolveSessionTitle(session("s1", { firstMessage: "Hello" }))).toBe("Hello");
  });

  it("falls back to a short id when name and first message are empty", () => {
    expect(resolveSessionTitle(session("abcdef1234567890"))).toBe("34567890");
  });
});

describe("buildSessionTab", () => {
  it("snapshots identity, display label, and workspace target", () => {
    const tab = buildSessionTab(session("s1", { name: "Named", cwd: "/tmp/p" }), {
      machineId: "local",
      projectId: "p1",
      workspaceId: "w1",
      projectLabel: "My Project",
    });
    expect(tab).toEqual<SessionTab>({
      machineId: "local",
      sessionId: "s1",
      projectId: "p1",
      workspaceId: "w1",
      cwd: "/tmp/p",
      title: "Named",
      projectLabel: "My Project",
      pinned: false,
    });
  });
});

describe("recordVisited", () => {
  it("appends a new tab at the end", () => {
    const result = recordVisited([tab("a")], tab("b"));
    expect(result.map((entry) => entry.sessionId)).toEqual(["a", "b"]);
  });

  it("keeps a re-visited tab in its original position", () => {
    const result = recordVisited([tab("a"), tab("b"), tab("c")], tab("a"));
    expect(result.map((entry) => entry.sessionId)).toEqual(["a", "b", "c"]);
  });

  it("refreshes the snapshot of a re-visited tab without moving it", () => {
    const result = recordVisited([tab("a", { title: "old" }), tab("b")], tab("a", { title: "new" }));
    expect(result.map((entry) => entry.sessionId)).toEqual(["a", "b"]);
    expect(result[0]?.title).toBe("new");
  });

  it("evicts the oldest un-pinned tab from the head once the limit is exceeded", () => {
    const tabs = [tab("a"), tab("b"), tab("c")];
    const result = recordVisited(tabs, tab("d"), { limit: 3 });
    expect(result.map((entry) => entry.sessionId)).toEqual(["b", "c", "d"]);
  });

  it("skips pinned tabs when evicting from the head", () => {
    const tabs = [tab("a", { pinned: true }), tab("b"), tab("c")];
    const result = recordVisited(tabs, tab("d"), { limit: 3 });
    expect(result.map((entry) => entry.sessionId)).toEqual(["a", "c", "d"]);
    expect(result.find((entry) => entry.sessionId === "a")?.pinned).toBe(true);
  });
});

describe("enforceSessionTabLimit", () => {
  it("leaves a list within the limit untouched", () => {
    const tabs = [tab("a"), tab("b")];
    expect(enforceSessionTabLimit(tabs, 3).map((entry) => entry.sessionId)).toEqual(["a", "b"]);
  });

  it("evicts the oldest un-pinned tab from the head", () => {
    const tabs = [tab("a"), tab("b"), tab("c"), tab("d")];
    expect(enforceSessionTabLimit(tabs, 3).map((entry) => entry.sessionId)).toEqual(["b", "c", "d"]);
  });

  it("stops once only pinned tabs remain even if over the limit", () => {
    const tabs = [tab("a", { pinned: true }), tab("b", { pinned: true }), tab("c", { pinned: true })];
    expect(enforceSessionTabLimit(tabs, 1).map((entry) => entry.sessionId)).toEqual(["a", "b", "c"]);
  });
});

describe("toggleSessionTabPin", () => {
  it("moves a newly pinned tab to the end of the pinned block", () => {
    const tabs = [tab("a", { pinned: true }), tab("b"), tab("c")];
    const result = toggleSessionTabPin(tabs, sessionTabKey("local", "c"));
    expect(result.map((entry) => entry.sessionId)).toEqual(["a", "c", "b"]);
    expect(result.find((entry) => entry.sessionId === "c")?.pinned).toBe(true);
  });

  it("moves a newly unpinned tab to the start of the unpinned block", () => {
    const tabs = [tab("a", { pinned: true }), tab("b", { pinned: true }), tab("c")];
    const result = toggleSessionTabPin(tabs, sessionTabKey("local", "a"));
    expect(result.map((entry) => entry.sessionId)).toEqual(["b", "a", "c"]);
    expect(result.find((entry) => entry.sessionId === "a")?.pinned).toBe(false);
  });

  it("is a no-op when the key is missing", () => {
    const tabs = [tab("a")];
    expect(toggleSessionTabPin(tabs, sessionTabKey("local", "missing")).map((entry) => entry.sessionId)).toEqual(["a"]);
  });
});

describe("moveSessionTab", () => {
  it("moves a tab before a later target in the same section", () => {
    const tabs = [tab("a"), tab("b"), tab("c"), tab("d")];
    expect(moveSessionTab(tabs, sessionTabKey("local", "a"), sessionTabKey("local", "c")).map((entry) => entry.sessionId)).toEqual(["b", "a", "c", "d"]);
  });

  it("moves a tab before an earlier target in the same section", () => {
    const tabs = [tab("a"), tab("b"), tab("c"), tab("d")];
    expect(moveSessionTab(tabs, sessionTabKey("local", "c"), sessionTabKey("local", "a")).map((entry) => entry.sessionId)).toEqual(["c", "a", "b", "d"]);
  });

  it("appends to the section end when no target is given", () => {
    const tabs = [tab("a"), tab("b"), tab("c")];
    expect(moveSessionTab(tabs, sessionTabKey("local", "a")).map((entry) => entry.sessionId)).toEqual(["b", "c", "a"]);
  });

  it("keeps a pinned tab within the pinned block when dropped at the section end", () => {
    const tabs = [tab("a", { pinned: true }), tab("b", { pinned: true }), tab("c")];
    expect(moveSessionTab(tabs, sessionTabKey("local", "a")).map((entry) => entry.sessionId)).toEqual(["b", "a", "c"]);
  });

  it("is a no-op across the pinned boundary (unpinned onto a pinned target)", () => {
    const tabs = [tab("a", { pinned: true }), tab("b")];
    expect(moveSessionTab(tabs, sessionTabKey("local", "b"), sessionTabKey("local", "a")).map((entry) => entry.sessionId)).toEqual(["a", "b"]);
  });

  it("is a no-op when either key is missing", () => {
    const tabs = [tab("a"), tab("b")];
    expect(moveSessionTab(tabs, sessionTabKey("local", "missing"), sessionTabKey("local", "b")).map((entry) => entry.sessionId)).toEqual(["a", "b"]);
  });
});

describe("removeSessionTab / forgetSessionTabs", () => {
  it("removes a tab by key", () => {
    const tabs = [tab("a"), tab("b")];
    expect(removeSessionTab(tabs, sessionTabKey("local", "a")).map((entry) => entry.sessionId)).toEqual(["b"]);
  });

  it("forgets multiple tabs by key", () => {
    const tabs = [tab("a"), tab("b"), tab("c")];
    const removed = forgetSessionTabs(tabs, [sessionTabKey("local", "a"), sessionTabKey("local", "c")]);
    expect(removed.map((entry) => entry.sessionId)).toEqual(["b"]);
  });

  it("returns a copy when nothing is forgotten", () => {
    const tabs = [tab("a")];
    const result = forgetSessionTabs(tabs, []);
    expect(result).not.toBe(tabs);
    expect(result).toEqual(tabs);
  });
});

describe("sessionTabsForMachine / isActiveTab", () => {
  it("keeps only the current machine's tabs", () => {
    const tabs = [tab("a", { machineId: "local" }), tab("b", { machineId: "remote" })];
    expect(sessionTabsForMachine(tabs, "local").map((entry) => entry.sessionId)).toEqual(["a"]);
  });

  it("matches the active tab by machine and session", () => {
    const active = tab("a", { machineId: "local" });
    expect(isActiveTab(active, "local", "a")).toBe(true);
    expect(isActiveTab(active, "remote", "a")).toBe(false);
    expect(isActiveTab(active, undefined, "a")).toBe(false);
  });
});

describe("serializeSessionTabs / deserializeSessionTabs", () => {
  it("round-trips tabs including the pinned flag", () => {
    const tabs = [tab("a"), tab("b", { pinned: true, projectLabel: "Other Project" })];
    expect(deserializeSessionTabs(serializeSessionTabs(tabs))).toEqual(tabs);
  });

  it("yields an empty list for non-JSON garbage", () => {
    expect(deserializeSessionTabs("not json")).toEqual([]);
  });

  it("yields an empty list for an unexpected envelope shape", () => {
    expect(deserializeSessionTabs(JSON.stringify({ version: 2, tabs: [] }))).toEqual([]);
    expect(deserializeSessionTabs(JSON.stringify({ version: 1, tabs: "nope" }))).toEqual([]);
  });

  it("drops individual tabs that fail validation but keeps the valid ones", () => {
    const valid = tab("a");
    const raw = JSON.stringify({
      version: 1,
      tabs: [
        valid,
        { ...valid, sessionId: "" },
        { ...valid, title: 123 },
        "garbage",
      ],
    });
    expect(deserializeSessionTabs(raw)).toEqual([valid]);
  });

  it("does not exceed the default limit over many visits", () => {
    let tabs: SessionTab[] = [];
    for (let index = 0; index < DEFAULT_SESSION_TAB_LIMIT + 5; index += 1) {
      tabs = recordVisited(tabs, tab(`s${String(index)}`));
    }
    expect(tabs.length).toBe(DEFAULT_SESSION_TAB_LIMIT);
    const last = tabs[tabs.length - 1];
    expect(last?.sessionId).toBe(`s${String(DEFAULT_SESSION_TAB_LIMIT + 4)}`);
  });
});

describe("tabKey", () => {
  it("is stable for the same identity", () => {
    expect(tabKey(tab("a"))).toBe(sessionTabKey("local", "a"));
  });
});

describe("sessionTabStatusKind", () => {
  it("reports waiting when an ask is pending", () => {
    expect(sessionTabStatusKind(status({ pendingAsk: pendingAsk() }), undefined, false)).toBe("waiting");
  });

  it("reports waiting when extension dialogs are pending", () => {
    expect(sessionTabStatusKind(status({ pendingDialogs: [extensionDialog()] }), undefined, false)).toBe("waiting");
  });

  it("reports active while the session is streaming", () => {
    expect(sessionTabStatusKind(status({ isStreaming: true }), undefined, false)).toBe("active");
  });

  it("reports active from an active activity phase", () => {
    expect(sessionTabStatusKind(undefined, activity("active"), false)).toBe("active");
  });

  it("reports complete from an unread completion", () => {
    expect(sessionTabStatusKind(undefined, undefined, true)).toBe("complete");
  });

  it("does not report complete for a viewed idle session", () => {
    expect(sessionTabStatusKind(undefined, activity("idle"), false)).toBeUndefined();
  });

  it("returns undefined without status, activity, or unread", () => {
    expect(sessionTabStatusKind(undefined, undefined, false)).toBeUndefined();
  });
});

function session(id: string, overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id,
    path: `/tmp/project/.pi/sessions/${id}.jsonl`,
    cwd: "/tmp/project",
    created: "2026-01-01T00:00:00.000Z",
    modified: "2026-01-01T00:00:00.000Z",
    messageCount: 0,
    firstMessage: "",
    ...overrides,
  };
}

function tab(sessionId: string, partial: Partial<SessionTab> = {}): SessionTab {
  return {
    machineId: "local",
    sessionId,
    projectId: "p1",
    workspaceId: "w1",
    cwd: "/tmp/project",
    title: sessionId,
    projectLabel: "main",
    pinned: false,
    ...partial,
  };
}

function status(overrides: Partial<SessionStatus> = {}): SessionStatus {
  return {
    sessionId: "s1",
    isStreaming: false,
    isCompacting: false,
    isBashRunning: false,
    pendingMessageCount: 0,
    queuedMessages: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    cost: 0,
    ...overrides,
  };
}

function activity(phase: SessionActivity["phase"]): SessionActivity {
  return { sessionId: "s1", phase, label: "working", at: "2026-01-01T00:00:00.000Z" };
}

function pendingAsk(): PendingAskUser {
  return { askId: "ask-1", askedAt: "2026-01-01T00:00:00.000Z", questions: [] };
}

function extensionDialog(): PendingExtensionDialog {
  return { dialogId: "dialog-1", kind: "confirm", title: "Confirm", askedAt: "2026-01-01T00:00:00.000Z", runScoped: false };
}
