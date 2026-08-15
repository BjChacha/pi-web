/**
 * Browser-only persistence for the plan-mode toggle's on/off state.
 *
 * Pi exposes no channel for pi-web to read a plan extension's real mode state,
 * so the toggle tracks its own view of it: clicking the button flips this flag
 * and re-runs `/plan`. The flag is persisted per session so it survives session
 * switches and page reloads within a browser session. It is a best-effort hint,
 * not a source of truth — if the mode is toggled another way (typing `/plan`,
 * another client) this view can drift until the button is clicked again.
 */

function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function key(machineId: string, sessionId: string): string {
  return `pi-web:plan-mode:${machineId}:${sessionId}`;
}

export function loadPlanModeActive(machineId: string, sessionId: string): boolean {
  try {
    return browserStorage()?.getItem(key(machineId, sessionId)) === "true";
  } catch {
    return false;
  }
}

export function savePlanModeActive(machineId: string, sessionId: string, active: boolean): void {
  try {
    browserStorage()?.setItem(key(machineId, sessionId), active ? "true" : "false");
  } catch {
    // Ignore localStorage quota/privacy errors.
  }
}
