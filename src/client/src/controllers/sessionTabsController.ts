import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { SessionInfo } from "../api";
import {
  DEFAULT_SESSION_TAB_LIMIT,
  buildSessionTab,
  deserializeSessionTabs,
  forgetSessionTabs,
  moveSessionTab,
  recordVisited,
  removeSessionTab,
  serializeSessionTabs,
  sessionTabsStorageKey,
  toggleSessionTabPin,
  type BuildSessionTabContext,
  type SessionTab,
} from "../sessionTabs";
import type { KeyValueStorage } from "./sessionStorageMemory";

export interface SessionTabsControllerOptions {
  storage?: KeyValueStorage | undefined;
  limit?: number | undefined;
}

/**
 * Owns the visited-session tab strip state and its localStorage persistence.
 *
 * The host (PiWebApp) reports visits via {@link SessionTabsController.record},
 * driven by the existing `onSelectedSessionReady` hook, and reads
 * {@link SessionTabsController.allTabs} to render the strip. Persistence is
 * side-effect-at-the-edge: storage failures never escape, so a full or blocked
 * localStorage bucket degrades to in-memory-only without breaking the strip.
 */
export class SessionTabsController implements ReactiveController {
  private readonly storage: KeyValueStorage | undefined;
  private readonly limit: number;
  private tabs: SessionTab[];

  constructor(
    private readonly host: ReactiveControllerHost,
    options: SessionTabsControllerOptions = {},
  ) {
    host.addController(this);
    this.storage = options.storage ?? defaultLocalStorage();
    this.limit = options.limit ?? DEFAULT_SESSION_TAB_LIMIT;
    this.tabs = this.load();
  }

  hostConnected(): void {
    // Tabs are loaded eagerly in the constructor; there is nothing to subscribe to.
  }

  allTabs(): readonly SessionTab[] {
    return this.tabs;
  }

  record(machineId: string, session: SessionInfo, ctx: Omit<BuildSessionTabContext, "machineId">): void {
    this.commit(recordVisited(this.tabs, buildSessionTab(session, { ...ctx, machineId }), { limit: this.limit }));
  }

  togglePin(key: string): void {
    this.commit(toggleSessionTabPin(this.tabs, key));
  }

  close(key: string): void {
    this.commit(removeSessionTab(this.tabs, key));
  }

  /** Remove tabs whose underlying session was deleted or otherwise gone. */
  forget(keys: readonly string[]): void {
    this.commit(forgetSessionTabs(this.tabs, keys));
  }

  /**
   * Reorder a tab by drag: land it before `targetKey`, or at the end of its
   * pinned section when `targetKey` is omitted (dropped in the trailing gap).
   */
  reorder(fromKey: string, targetKey?: string): void {
    this.commit(moveSessionTab(this.tabs, fromKey, targetKey));
  }

  private commit(next: SessionTab[]): void {
    if (serializeSessionTabs(next) === serializeSessionTabs(this.tabs)) return;
    this.tabs = next;
    this.save();
    this.host.requestUpdate();
  }

  private load(): SessionTab[] {
    try {
      const raw = this.storage?.getItem(sessionTabsStorageKey());
      if (raw === undefined || raw === null || raw === "") return [];
      return deserializeSessionTabs(raw);
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      if (this.tabs.length === 0) {
        this.storage?.removeItem(sessionTabsStorageKey());
        return;
      }
      this.storage?.setItem(sessionTabsStorageKey(), serializeSessionTabs(this.tabs));
    } catch {
      // Keep the in-memory strip even if storage is unavailable, full, or blocked.
    }
  }
}

function defaultLocalStorage(): KeyValueStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
