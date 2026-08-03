import { isSessionActive } from "../../shared/activity";
import type { SessionActivity, SessionInfo, SessionStatus } from "./api";
import { shortSessionId } from "./sessionLabels";

/**
 * A browser-tab-like pin to a session the user has visited.
 *
 * The tab strip shows recently visited sessions across every workspace of the
 * current machine and survives a page reload via localStorage. Each tab
 * snapshots the full navigation target (machine/project/workspace/session)
 * plus a display label, because the referenced session usually lives in a
 * workspace that is not the one currently loaded — when the user clicks the
 * tab, the snapshot is enough to restore the selection without first
 * re-listing every workspace.
 */
export interface SessionTab {
  machineId: string;
  sessionId: string;
  projectId: string;
  workspaceId: string;
  /** Session working directory; equal to its workspace's path. */
  cwd: string;
  title: string;
  /** Project name shown on the tab's second line. */
  projectLabel: string;
  pinned: boolean;
}

/**
 * Soft cap on un-pinned tabs. Pinned tabs are never evicted, so the real
 * length can exceed this when the user pins more sessions than the cap.
 */
export const DEFAULT_SESSION_TAB_LIMIT = 12;

/** Globally-unique identity for a tab within one browser. */
export function sessionTabKey(machineId: string, sessionId: string): string {
  return `${machineId}\u0000${sessionId}`;
}

export function tabKey(tab: SessionTab): string {
  return sessionTabKey(tab.machineId, tab.sessionId);
}

export function isActiveTab(tab: SessionTab, machineId: string | undefined, sessionId: string | undefined): boolean {
  return machineId !== undefined && sessionId !== undefined && tab.machineId === machineId && tab.sessionId === sessionId;
}

/**
 * Work-state a session tab may show, mirroring the session list's activity
 * language plus the state the list row does not carry: waiting on the user.
 * "Complete" is the session list's unread flag — new finished work the user
 * has not viewed yet, cleared by the same acknowledgment when the session is
 * opened. Precedence: a pending ask/dialog wins over active work, which wins
 * over an unread completion.
 */
export type SessionTabStatusKind = "waiting" | "active" | "complete";

export function sessionTabStatusKind(status: SessionStatus | undefined, activity: SessionActivity | undefined, unread: boolean): SessionTabStatusKind | undefined {
  if (status?.pendingAsk !== undefined) return "waiting";
  if ((status?.pendingDialogs?.length ?? 0) > 0) return "waiting";
  if (isSessionActive(status, activity)) return "active";
  if (unread) return "complete";
  return undefined;
}

/**
 * User-facing title for a session, mirroring the label used by the session
 * list and context bar: explicit name, then first message, then a short id.
 */
export function resolveSessionTitle(session: Pick<SessionInfo, "id" | "name" | "firstMessage">): string {
  const name = session.name?.trim();
  if (name !== undefined && name !== "") return name;
  const firstMessage = session.firstMessage.trim();
  if (firstMessage !== "") return firstMessage;
  return shortSessionId(session.id);
}

export interface BuildSessionTabContext {
  machineId: string;
  projectId: string;
  workspaceId: string;
  projectLabel: string;
}

export function buildSessionTab(session: SessionInfo, ctx: BuildSessionTabContext): SessionTab {
  return {
    machineId: ctx.machineId,
    sessionId: session.id,
    projectId: ctx.projectId,
    workspaceId: ctx.workspaceId,
    cwd: session.cwd,
    title: resolveSessionTitle(session),
    projectLabel: ctx.projectLabel,
    pinned: false,
  };
}

export interface RecordVisitedOptions {
  limit?: number;
}

/**
 * Record (or refresh) a visited session tab in browser-tab order.
 *
 * A brand-new session appends to the end of the strip. Re-visiting an existing
 * tab only refreshes its snapshot in place — the order never changes just
 * because a tab was activated, mirroring browser tabs whose position is fixed
 * at creation. The list is then trimmed from the oldest un-pinned tab.
 */
export function recordVisited(tabs: readonly SessionTab[], tab: SessionTab, options: RecordVisitedOptions = {}): SessionTab[] {
  const key = tabKey(tab);
  const limit = options.limit ?? DEFAULT_SESSION_TAB_LIMIT;
  const existingIndex = tabs.findIndex((existing) => tabKey(existing) === key);
  if (existingIndex !== -1) {
    const next = [...tabs];
    next[existingIndex] = tab;
    return next;
  }
  return enforceSessionTabLimit([...tabs, tab], limit);
}

/**
 * Trim from the oldest (head) un-pinned tab until the list fits the limit.
 * Pinned tabs are never evicted, so when everything still present is pinned the
 * trim stops early even if the length still exceeds the limit.
 */
export function enforceSessionTabLimit(tabs: readonly SessionTab[], limit: number): SessionTab[] {
  if (tabs.length <= limit) return [...tabs];
  const result = [...tabs];
  while (result.length > limit) {
    const oldestUnpinnedIndex = result.findIndex((tab) => !tab.pinned);
    if (oldestUnpinnedIndex === -1) break;
    result.splice(oldestUnpinnedIndex, 1);
  }
  return result;
}

/**
 * Flip a tab's pinned flag and move it to the pinned/unpinned boundary.
 * Pinning appends the tab to the end of the pinned block; unpinning prepends
 * it to the unpinned block. Both land at the same slot — the position of the
 * first un-pinned tab — so the two sections stay contiguous and an un-pinned
 * tab can never end up left of a pinned one.
 */
export function toggleSessionTabPin(tabs: readonly SessionTab[], key: string): SessionTab[] {
  const index = tabs.findIndex((tab) => tabKey(tab) === key);
  if (index === -1) return [...tabs];
  const tab = tabs[index];
  if (tab === undefined) return [...tabs];
  const updated: SessionTab = { ...tab, pinned: !tab.pinned };
  const without = tabs.filter((_, position) => position !== index);
  let insertIndex = without.findIndex((candidate) => !candidate.pinned);
  if (insertIndex === -1) insertIndex = without.length;
  const next = [...without];
  next.splice(insertIndex, 0, updated);
  return next;
}

export function removeSessionTab(tabs: readonly SessionTab[], key: string): SessionTab[] {
  return tabs.filter((tab) => tabKey(tab) !== key);
}

/** Tabs visible in the strip for a given machine; other machines are hidden. */
export function sessionTabsForMachine(tabs: readonly SessionTab[], machineId: string): SessionTab[] {
  return tabs.filter((tab) => tab.machineId === machineId);
}

/**
 * Move a tab by drag, landing it just before `targetKey` — or at the end of its
 * own pinned section when `targetKey` is omitted (dropped in the trailing gap).
 * A drag never crosses the pinned/unpinned boundary: dropping onto a tab in the
 * other section is a no-op, so an un-pinned tab can never end up left of a
 * pinned one.
 */
export function moveSessionTab(tabs: readonly SessionTab[], key: string, targetKey?: string): SessionTab[] {
  const fromIndex = tabs.findIndex((tab) => tabKey(tab) === key);
  if (fromIndex === -1) return [...tabs];
  const moved = tabs[fromIndex];
  if (moved === undefined) return [...tabs];
  const without = tabs.filter((_, position) => position !== fromIndex);
  let insertIndex: number;
  if (targetKey === undefined) {
    // End of the moved tab's own section: just past the last pinned tab, or the
    // very end of the list for an un-pinned tab.
    insertIndex = moved.pinned ? without.findIndex((tab) => !tab.pinned) : without.length;
    if (insertIndex === -1) insertIndex = without.length;
  } else {
    const targetIndex = without.findIndex((tab) => tabKey(tab) === targetKey);
    if (targetIndex === -1) return [...tabs];
    const target = without[targetIndex];
    if (target?.pinned !== moved.pinned) return [...tabs];
    insertIndex = targetIndex;
  }
  const next = [...without];
  next.splice(insertIndex, 0, moved);
  return next;
}

/** Drop tabs whose identity was deleted/archived-away, keyed by tab identity. */
export function forgetSessionTabs(tabs: readonly SessionTab[], keys: readonly string[]): SessionTab[] {
  if (keys.length === 0) return [...tabs];
  const remove = new Set(keys);
  return tabs.filter((tab) => !remove.has(tabKey(tab)));
}

interface SessionTabEnvelope {
  version: 1;
  tabs: SessionTab[];
}

const SESSION_TABS_STORAGE_KEY = "pi-web:session-tabs:v1";

export function sessionTabsStorageKey(): string {
  return SESSION_TABS_STORAGE_KEY;
}

export function serializeSessionTabs(tabs: readonly SessionTab[]): string {
  const envelope: SessionTabEnvelope = { version: 1, tabs: [...tabs] };
  return JSON.stringify(envelope);
}

/**
 * Parse persisted tabs defensively: a corrupt or hand-edited value must not
 * break the strip, so any structural mismatch yields an empty list rather than
 * throwing. Individual tabs that fail validation are dropped, not fatal.
 */
export function deserializeSessionTabs(raw: string): SessionTab[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isSessionTabEnvelope(value)) return [];
    return value.tabs.map(parseSessionTab).filter((tab): tab is SessionTab => tab !== undefined);
  } catch {
    return [];
  }
}

function parseSessionTab(value: unknown): SessionTab | undefined {
  if (!isSessionTab(value)) return undefined;
  return {
    machineId: value.machineId,
    sessionId: value.sessionId,
    projectId: value.projectId,
    workspaceId: value.workspaceId,
    cwd: value.cwd,
    title: value.title,
    projectLabel: value.projectLabel,
    pinned: value.pinned,
  };
}

function isSessionTabEnvelope(value: unknown): value is SessionTabEnvelope {
  // Only the envelope shape is checked here; individual tabs are re-validated
  // by parseSessionTab so one corrupt entry drops just itself, not the list.
  return isRecord(value) && value["version"] === 1 && Array.isArray(value["tabs"]);
}

function isSessionTab(value: unknown): value is SessionTab {
  return (
    isRecord(value) &&
    typeof value["machineId"] === "string" && value["machineId"] !== "" &&
    typeof value["sessionId"] === "string" && value["sessionId"] !== "" &&
    typeof value["projectId"] === "string" && value["projectId"] !== "" &&
    typeof value["workspaceId"] === "string" && value["workspaceId"] !== "" &&
    typeof value["cwd"] === "string" && value["cwd"] !== "" &&
    typeof value["title"] === "string" &&
    typeof value["projectLabel"] === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
