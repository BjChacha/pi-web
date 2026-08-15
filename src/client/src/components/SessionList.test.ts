import type { TemplateResult } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { SessionInfo, SessionStatus } from "../api";
import { markCachedNewSessionInfo } from "../cachedNewSessions";
import { isArchivableSessionInfo, isTransientNewSessionInfo } from "../sessionPersistence";
// Vitest runs in the node environment with no DOM, so menu/bulk-bar wiring is
// verified through the shared TemplateResult inspection escape hatch: handler
// lookups stay anchored to the buttons' own user-facing text.
import {
  findOptionalTemplateClickHandlerForText,
  isTemplateEventHandler,
  isTemplateResult,
  templateClickHandlerForText,
  templateStrings,
  templateValues,
  templateValuesAfterMarker,
  templateValueAfterMarker,
  type TemplateEventHandler,
} from "../templateInspection.testSupport";
import { SessionList, sessionRowActivityKind, sessionRowsForCurrentTree, sessionRowUnread, unreadSessionCount } from "./SessionList";

describe("sessionRowActivityKind", () => {
  const idle = sessionStatus("s");

  it("reports 'sending' for an uploading session, taking precedence over server activity", () => {
    expect(sessionRowActivityKind(session("s"), idle, undefined, true)).toBe("sending");
    expect(sessionRowActivityKind(session("s"), { ...idle, isStreaming: true }, undefined, true)).toBe("sending");
  });

  it("reports 'session' for server activity when not sending", () => {
    expect(sessionRowActivityKind(session("s"), { ...idle, isStreaming: true }, undefined, false)).toBe("session");
  });

  it("shows no active-work indicator for a session that is only starting up", () => {
    const startup = { sessionId: "s", phase: "active" as const, label: "Opening session", detail: "Starting the Pi session", at: "now", startup: true };

    expect(sessionRowActivityKind(session("s"), idle, startup, false)).toBeUndefined();
    // Ordinary activity is work and keeps its indicator.
    expect(sessionRowActivityKind(session("s"), idle, { sessionId: "s", phase: "active", label: "running tool", at: "now" }, false)).toBe("session");
  });

  it("reports undefined when idle and not sending, even for an unread session", () => {
    expect(sessionRowActivityKind(session("s"), idle, undefined, false)).toBeUndefined();
  });

  it("never shows an indicator for archived or cached-new sessions, even while sending", () => {
    expect(sessionRowActivityKind({ ...session("s"), archived: true }, idle, undefined, true)).toBeUndefined();
    expect(sessionRowActivityKind(markCachedNewSessionInfo(session("s")), idle, undefined, true)).toBeUndefined();
  });
});

describe("sessionRowUnread", () => {
  it("flags tracked current sessions regardless of activity state", () => {
    expect(sessionRowUnread(session("s"), new Set(["s"]))).toBe(true);
    expect(sessionRowUnread(session("s"), new Set())).toBe(false);
  });

  it("never flags archived or cached-new sessions, even when tracked as unread", () => {
    expect(sessionRowUnread({ ...session("s"), archived: true }, new Set(["s"]))).toBe(false);
    expect(sessionRowUnread(markCachedNewSessionInfo(session("s")), new Set(["s"]))).toBe(false);
  });
});

describe("unreadSessionCount", () => {
  it("counts only current persisted sessions, including busy ones", () => {
    const current = session("current");
    const archived = { ...session("archived"), archived: true, archivedAt: "2026-06-09T00:00:00.000Z" };
    const cached = markCachedNewSessionInfo(session("cached"));

    const unreadIds = new Set([current.id, archived.id, cached.id]);
    expect(unreadSessionCount([current, archived, cached], unreadIds)).toBe(1);
  });
});

describe("session action eligibility", () => {
  it("requires a persisted server signal before archiving when persistence is authoritative", () => {
    const authoritative = { authoritative: true };
    expect(isArchivableSessionInfo(session("persisted", { persisted: true }), undefined, authoritative)).toBe(true);
    expect(isArchivableSessionInfo(session("unknown"), undefined, authoritative)).toBe(false);
    expect(isArchivableSessionInfo(session("transient", { persisted: false }), undefined, authoritative)).toBe(false);
    expect(isArchivableSessionInfo({ ...session("archived", { persisted: true }), archived: true, archivedAt: "2026-06-09T00:00:00.000Z" }, undefined, authoritative)).toBe(false);
  });

  it("preserves legacy archiving when persistence support is not advertised", () => {
    expect(isArchivableSessionInfo(session("legacy"))).toBe(true);
    expect(isTransientNewSessionInfo(session("legacy"))).toBe(false);
  });

  it("allows deleting transient non-archived sessions from server or browser-cached signals", () => {
    expect(isTransientNewSessionInfo(session("transient", { persisted: false }))).toBe(true);
    expect(isTransientNewSessionInfo(markCachedNewSessionInfo(session("cached")))).toBe(true);
    expect(isTransientNewSessionInfo(session("persisted", { persisted: true }))).toBe(false);
    expect(isTransientNewSessionInfo({ ...session("archived", { persisted: false }), archived: true, archivedAt: "2026-06-09T00:00:00.000Z" })).toBe(false);
  });

  it("uses matching status as the freshest persistence signal", () => {
    const staleTransient = session("s", { persisted: false });
    expect(isArchivableSessionInfo(staleTransient, sessionStatus("s", { persisted: true }))).toBe(true);
    expect(isTransientNewSessionInfo(staleTransient, sessionStatus("s", { persisted: true }))).toBe(false);

    const stalePersisted = session("s", { persisted: true });
    expect(isArchivableSessionInfo(stalePersisted, sessionStatus("s", { persisted: false }))).toBe(false);
    expect(isTransientNewSessionInfo(stalePersisted, sessionStatus("s", { persisted: false }))).toBe(true);

    expect(isArchivableSessionInfo(staleTransient, sessionStatus("other", { persisted: true }))).toBe(false);
  });
});


describe("rename action", () => {
  function renameInput(list: SessionList): TemplateResult {
    return findTemplateWithStaticText(renderList(list), "class=\"rename-input\"");
  }

  // Lit interleaves each handler between its own attribute chunk and the next
  // attribute's chunk, so a "near marker" lookup misattributes @keydown to the
  // @input handler (and @blur to @keydown). Match on the chunk that *precedes*
  // each value instead, which binds each marker to its own handler.
  function inputHandler(list: SessionList, marker: string): TemplateEventHandler {
    for (const value of templateValuesAfterMarker(renameInput(list), marker)) {
      if (isTemplateEventHandler(value)) return value;
    }
    throw new Error(`Expected input handler after ${marker}`);
  }

  function dblclickHandler(list: SessionList): TemplateEventHandler {
    const span = findTemplateWithStaticText(renderList(list), 'action-name" dir="auto"');
    const handler = templateValuesAfterMarker(span, "@dblclick=").find(isTemplateEventHandler);
    if (handler === undefined) throw new Error("Expected dblclick handler on the session title");
    return handler;
  }

  it("enters inline edit mode seeded with the current name when Rename is chosen", () => {
    const named = session("named", { name: "Existing" });
    const list = sessionList([named], new Set());

    openSessionMenu(list, named.id);
    templateClickHandlerForText(renderList(list), "Rename")(new Event("click"));

    expect(componentState(list, "renamingSessionId")).toBe(named.id);
    expect(componentState(list, "renameValue")).toBe("Existing");
    expect(templateValueAfterMarker(renameInput(list), ".value=")).toBe("Existing");
  });

  it("seeds the rename field blank for a session without a custom name", () => {
    const target = session("target");
    const list = sessionList([target], new Set());

    openSessionMenu(list, target.id);
    templateClickHandlerForText(renderList(list), "Rename")(new Event("click"));

    expect(componentState(list, "renameValue")).toBe("");
  });

  it("commits a non-empty changed name on Enter", () => {
    const target = session("target");
    const list = sessionList([target], new Set());
    const onRename = vi.fn<(session: SessionInfo, name: string) => void>();
    list.onRename = onRename;
    setComponentState(list, "renamingSessionId", target.id);
    setComponentState(list, "renameValue", "New Name");

    const keydown = inputHandler(list, "@keydown=");
    keydown(Object.assign(new Event("keydown"), { key: "Enter" }));

    expect(onRename).toHaveBeenCalledWith(target, "New Name");
    expect(componentState(list, "renamingSessionId")).toBeUndefined();
  });

  it("cancels on Escape without forwarding", () => {
    const target = session("target");
    const list = sessionList([target], new Set());
    const onRename = vi.fn<(session: SessionInfo, name: string) => void>();
    list.onRename = onRename;
    setComponentState(list, "renamingSessionId", target.id);
    setComponentState(list, "renameValue", "New Name");

    const keydown = inputHandler(list, "@keydown=");
    keydown(Object.assign(new Event("keydown"), { key: "Escape" }));

    expect(onRename).not.toHaveBeenCalled();
    expect(componentState(list, "renamingSessionId")).toBeUndefined();
  });

  it("commits on blur", () => {
    const target = session("target");
    const list = sessionList([target], new Set());
    const onRename = vi.fn<(session: SessionInfo, name: string) => void>();
    list.onRename = onRename;
    setComponentState(list, "renamingSessionId", target.id);
    setComponentState(list, "renameValue", "Blurred");

    inputHandler(list, "@blur=")(new Event("blur"));

    expect(onRename).toHaveBeenCalledWith(target, "Blurred");
  });

  it("does not commit an empty or unchanged name", () => {
    const named = session("named", { name: "Kept" });
    const list = sessionList([named], new Set());
    const onRename = vi.fn<(session: SessionInfo, name: string) => void>();
    list.onRename = onRename;
    setComponentState(list, "renamingSessionId", named.id);
    setComponentState(list, "renameValue", "");
    inputHandler(list, "@blur=")(new Event("blur"));

    setComponentState(list, "renamingSessionId", named.id);
    setComponentState(list, "renameValue", "Kept");
    inputHandler(list, "@blur=")(new Event("blur"));

    expect(onRename).not.toHaveBeenCalled();
  });

  it("enters rename on double-click of a current session title", () => {
    const target = session("target");
    const list = sessionList([target], new Set());
    dblclickHandler(list)(new Event("dblclick"));
    expect(componentState(list, "renamingSessionId")).toBe(target.id);
  });

  it("ignores double-click on an archived session title", () => {
    const archived = { ...session("archived"), archived: true, archivedAt: "2026-06-09T00:00:00.000Z" };
    const list = sessionList([archived], new Set());
    setComponentState(list, "archivedExpanded", true);
    dblclickHandler(list)(new Event("dblclick"));
    expect(componentState(list, "renamingSessionId")).toBeUndefined();
  });

  it("hides Rename for archived and transient sessions", () => {
    const archived = { ...session("archived"), archived: true, archivedAt: "2026-06-09T00:00:00.000Z" };
    const cached = markCachedNewSessionInfo(session("cached"));
    const list = sessionList([archived, cached], new Set());

    setComponentState(list, "archivedExpanded", true);
    openSessionMenu(list, archived.id);
    expect(findOptionalTemplateClickHandlerForText(renderList(list), "Rename")).toBeUndefined();

    openSessionMenu(list, cached.id);
    expect(findOptionalTemplateClickHandlerForText(renderList(list), "Rename")).toBeUndefined();
  });

  it("freezes the session list snapshot while renaming and thaws on commit", () => {
    const a = session("a");
    const b = session("b");
    const list = sessionList([a, b], new Set());
    expect(componentState(list, "frozenSessions")).toBeUndefined();
    openSessionMenu(list, a.id);
    templateClickHandlerForText(renderList(list), "Rename")(new Event("click"));
    // The snapshot is captured at edit start so a later modified-time reshuffle
    // of the live list cannot reflow rows and tear down the input.
    expect(componentState(list, "frozenSessions")).toEqual([a, b]);
    setComponentState(list, "renameValue", "New Name");
    inputHandler(list, "@blur=")(new Event("blur"));
    expect(componentState(list, "frozenSessions")).toBeUndefined();
  });
});

describe("sessionRowsForCurrentTree", () => {
  it("keeps archived ancestors visible while they have unarchived descendants", () => {
    const parent = { ...session("parent"), archived: true, archivedAt: "2026-06-09T00:00:00.000Z" };
    const child = session("child", { parentSessionPath: parent.path });

    expect(rowSummaries(sessionRowsForCurrentTree([parent, child]))).toEqual([
      { id: "parent", depth: 0, hasMissingParent: false },
      { id: "child", depth: 1, hasMissingParent: false },
    ]);
  });

  it("hides archived parents from the current tree once children are detached", () => {
    const parent = { ...session("parent"), archived: true, archivedAt: "2026-06-09T00:00:00.000Z" };
    const detachedChild = session("child");

    expect(rowSummaries(sessionRowsForCurrentTree([parent, detachedChild]))).toEqual([
      { id: "child", depth: 0, hasMissingParent: false },
    ]);
  });

  it("nests a child whose recorded parent path differs only by a trailing separator", () => {
    // A session.created broadcast carries the live runtime's file path, while the
    // listed parent's path comes from the session store enumeration.
    const parent = session("parent");
    const child = session("child", { parentSessionPath: `${parent.path}/` });

    expect(rowSummaries(sessionRowsForCurrentTree([parent, child]))).toEqual([
      { id: "parent", depth: 0, hasMissingParent: false },
      { id: "child", depth: 1, hasMissingParent: false },
    ]);
  });

  it("still marks unavailable parents when the parent record is missing", () => {
    const child = session("child", { parentSessionPath: "/sessions/missing.jsonl" });

    expect(rowSummaries(sessionRowsForCurrentTree([child]))).toEqual([
      { id: "child", depth: 0, hasMissingParent: true },
    ]);
  });
});

function rowSummaries(rows: ReturnType<typeof sessionRowsForCurrentTree>) {
  return rows.map((row) => ({ id: row.session.id, depth: row.depth, hasMissingParent: row.hasMissingParent }));
}

function sessionList(sessions: SessionInfo[], unreadSessionIds: ReadonlySet<string>): SessionList {
  const list = new SessionList();
  list.sessions = sessions;
  list.unreadSessionIds = unreadSessionIds;
  return list;
}

function renderList(list: SessionList): TemplateResult {
  return list.render();
}

function openSessionMenu(list: SessionList, sessionId: string): void {
  setComponentState(list, "openMenuSessionId", sessionId);
}

function componentState(list: SessionList, property: string): unknown {
  return Reflect.get(list, property);
}

function setComponentState(list: SessionList, property: string, value: unknown): void {
  if (!Reflect.set(list, property, value)) throw new Error(`Could not set session list property ${property}`);
}


function findTemplateWithStaticText(value: unknown, text: string): TemplateResult {
  const found = findOptionalTemplateWithStaticText(value, text);
  if (found === undefined) throw new Error(`Expected template containing ${text}`);
  return found;
}

function findOptionalTemplateWithStaticText(value: unknown, text: string): TemplateResult | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findOptionalTemplateWithStaticText(item, text);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isTemplateResult(value)) return undefined;
  if (templateStrings(value).some((chunk) => chunk.includes(text))) return value;
  for (const item of templateValues(value)) {
    const found = findOptionalTemplateWithStaticText(item, text);
    if (found !== undefined) return found;
  }
  return undefined;
}


function sessionStatus(sessionId: string, overrides: Partial<SessionStatus> = {}): SessionStatus {
  return {
    sessionId,
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

function session(id: string, overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id,
    path: `/sessions/${id}.jsonl`,
    cwd: "/workspace",
    created: "2026-06-09T00:00:00.000Z",
    modified: "2026-06-09T00:00:00.000Z",
    messageCount: 1,
    firstMessage: id,
    ...overrides,
  };
}
