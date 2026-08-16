// @vitest-environment happy-dom
// Mark-as-read wiring rendered through the real DOM because the button labels
// come from the i18n layer as bound values, so template static-text lookups
// cannot anchor to them anymore.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionInfo } from "../api";
import { markCachedNewSessionInfo } from "../cachedNewSessions";
import { SessionList } from "./SessionList";

afterEach(() => {
  document.body.replaceChildren();
});

describe("session-list mark-as-read actions", () => {
  it("offers Mark as read in the menu of an unread current session and forwards it", async () => {
    const unread = session("unread");
    const list = await mountedList([unread, session("read")], new Set([unread.id]));
    const onMarkRead = vi.fn<(session: SessionInfo) => void>();
    list.onMarkRead = onMarkRead;

    await openMenuFor(list, "unread");
    menuButton(list, "Mark as read").click();
    await list.updateComplete;

    expect(onMarkRead).toHaveBeenCalledWith(unread);
    expect(menuPanel(list)).toBeNull();
  });

  it("hides Mark as read for read, transient, and archived sessions even when tracked as unread", async () => {
    const read = session("read");
    const cached = markCachedNewSessionInfo(session("cached"));
    const archived = { ...session("archived"), archived: true, archivedAt: "2026-06-09T00:00:00.000Z" };
    const list = await mountedList([read, cached, archived], new Set([cached.id, archived.id]));

    await openMenuFor(list, "read");
    expect(optionalMenuButton(list, "Mark as read")).toBeNull();

    await openMenuFor(list, "cached");
    expect(optionalMenuButton(list, "Mark as read")).toBeNull();

    await setStateAndRender(list, "archivedExpanded", true);
    await openMenuFor(list, "archived");
    expect(optionalMenuButton(list, "Mark as read")).toBeNull();
  });

  it("enables bulk Mark read only when a selected session is unread and forwards only the unread selection", async () => {
    const unreadA = session("unread-a");
    const readB = session("read-b");
    const unreadC = session("unread-c");
    const list = await mountedList([unreadA, readB, unreadC], new Set([unreadA.id, unreadC.id]));
    const onMarkReadMany = vi.fn<(sessions: SessionInfo[]) => void>();
    list.onMarkReadMany = onMarkReadMany;

    await setStateAndRender(list, "selectionScopes", new Set(["current"]));

    await setStateAndRender(list, "selectedSessionIds", new Set([readB.id]));
    const disabledButton = bulkButton(list, "Mark read");
    expect(disabledButton.disabled).toBe(true);
    disabledButton.click();
    await list.updateComplete;
    expect(onMarkReadMany).not.toHaveBeenCalled();

    await setStateAndRender(list, "selectedSessionIds", new Set([unreadA.id, readB.id, unreadC.id]));
    const enabledButton = bulkButton(list, "Mark read");
    expect(enabledButton.disabled).toBe(false);
    enabledButton.click();
    await list.updateComplete;
    expect(onMarkReadMany).toHaveBeenCalledWith([unreadA, unreadC]);
  });
});

async function mountedList(sessions: SessionInfo[], unreadSessionIds: ReadonlySet<string>): Promise<SessionList> {
  const list = new SessionList();
  list.sessions = sessions;
  list.unreadSessionIds = unreadSessionIds;
  document.body.append(list);
  await list.updateComplete;
  return list;
}

async function setStateAndRender(list: SessionList, property: string, value: unknown): Promise<void> {
  if (!Reflect.set(list, property, value)) throw new Error(`Could not set session list property ${property}`);
  list.requestUpdate();
  await list.updateComplete;
}

async function openMenuFor(list: SessionList, sessionId: string): Promise<void> {
  const row = sessionRow(list, sessionId);
  const toggle = row.querySelector<HTMLButtonElement>(".action-menu-toggle");
  if (toggle === null) throw new Error(`Expected an actions toggle for session ${sessionId}`);
  toggle.click();
  await list.updateComplete;
}

function sessionRow(list: SessionList, sessionId: string): HTMLElement {
  for (const row of list.shadowRoot?.querySelectorAll<HTMLElement>(".action-row") ?? []) {
    if (row.title === `/sessions/${sessionId}.jsonl`) return row;
  }
  throw new Error(`Expected a row for session ${sessionId}`);
}

function menuPanel(list: SessionList): Element | null {
  return list.shadowRoot?.querySelector(".action-menu-panel") ?? null;
}

function menuButton(list: SessionList, label: string): HTMLButtonElement {
  const button = optionalMenuButton(list, label);
  if (button === null) throw new Error(`Expected a menu button labeled ${label}`);
  return button;
}

function optionalMenuButton(list: SessionList, label: string): HTMLButtonElement | null {
  for (const button of menuPanel(list)?.querySelectorAll<HTMLButtonElement>("button") ?? []) {
    if (button.textContent === label) return button;
  }
  return null;
}

function bulkButton(list: SessionList, label: string): HTMLButtonElement {
  for (const row of list.shadowRoot?.querySelectorAll<HTMLElement>(".bulk-row") ?? []) {
    for (const button of row.querySelectorAll<HTMLButtonElement>("button")) {
      if (button.textContent === label) return button;
    }
  }
  throw new Error(`Expected a bulk toolbar button labeled ${label}`);
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
