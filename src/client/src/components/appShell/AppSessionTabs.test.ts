// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { sessionTabKey, type SessionTab } from "../../sessionTabs";
import { AppSessionTabs } from "./AppSessionTabs";

afterEach(() => {
  document.body.replaceChildren();
});

describe("AppSessionTabs", () => {
  it("renders nothing when there are no tabs", async () => {
    const el = new AppSessionTabs();
    el.tabs = [];
    document.body.append(el);
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector(".session-tabs-frame")).toBeNull();
  });

  it("renders one chip per tab", async () => {
    const el = new AppSessionTabs();
    el.tabs = [tab("a"), tab("b")];
    document.body.append(el);
    await el.updateComplete;

    expect(el.shadowRoot?.querySelectorAll(".session-tab")).toHaveLength(2);
  });

  it("renders the title and project label on separate lines", async () => {
    const el = new AppSessionTabs();
    el.tabs = [tab("a", { projectLabel: "My Project" })];
    document.body.append(el);
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector(".tab-title")?.textContent).toBe("a");
    expect(el.shadowRoot?.querySelector(".tab-project")?.textContent).toBe("My Project");
  });

  it("marks only the active tab as selected", async () => {
    const el = new AppSessionTabs();
    el.tabs = [tab("a"), tab("b")];
    el.activeKey = sessionTabKey("local", "b");
    document.body.append(el);
    await el.updateComplete;

    const selected = el.shadowRoot?.querySelectorAll<HTMLButtonElement>(".tab-main[aria-selected='true']") ?? [];
    expect(selected).toHaveLength(1);
    expect(selected[0]?.getAttribute("aria-label")).toBe("b, main");
  });

  it("activates a tab when its main area is clicked", async () => {
    const activated: SessionTab[] = [];
    const el = new AppSessionTabs();
    el.tabs = [tab("a")];
    el.onActivate = (clicked) => { activated.push(clicked); };
    document.body.append(el);
    await el.updateComplete;

    el.shadowRoot?.querySelector<HTMLButtonElement>(".tab-main")?.click();
    expect(activated.map((entry) => entry.sessionId)).toEqual(["a"]);
  });

  it("closes a tab when its close button is clicked", async () => {
    const closed: string[] = [];
    const el = new AppSessionTabs();
    el.tabs = [tab("a")];
    el.onClose = (key) => { closed.push(key); };
    document.body.append(el);
    await el.updateComplete;

    el.shadowRoot?.querySelector<HTMLButtonElement>(".tab-close")?.click();
    expect(closed).toEqual([sessionTabKey("local", "a")]);
  });

  it("toggles pin when the pin button is clicked", async () => {
    const toggled: string[] = [];
    const el = new AppSessionTabs();
    el.tabs = [tab("a")];
    el.onTogglePin = (key) => { toggled.push(key); };
    document.body.append(el);
    await el.updateComplete;

    el.shadowRoot?.querySelector<HTMLButtonElement>(".tab-pin")?.click();
    expect(toggled).toEqual([sessionTabKey("local", "a")]);
  });

  it("marks pinned tabs with the pressed pin icon", async () => {
    const el = new AppSessionTabs();
    el.tabs = [tab("a", { pinned: true })];
    document.body.append(el);
    await el.updateComplete;

    const pinIcon = el.shadowRoot?.querySelector(".pin-icon");
    expect(pinIcon?.getAttribute("data-pinned")).toBe("true");
  });

  it("renders the work-state dot for a tab", async () => {
    const el = new AppSessionTabs();
    el.tabs = [tab("a")];
    el.statusByTab = new Map([[sessionTabKey("local", "a"), "active"]]);
    document.body.append(el);
    await el.updateComplete;

    const dot = el.shadowRoot?.querySelector(".tab-status-dot");
    expect(dot?.classList.contains("active")).toBe(true);
    expect(dot?.getAttribute("aria-label")).toBe("Session active");
  });

  it("renders the waiting dot distinctly", async () => {
    const el = new AppSessionTabs();
    el.tabs = [tab("a")];
    el.statusByTab = new Map([[sessionTabKey("local", "a"), "waiting"]]);
    document.body.append(el);
    await el.updateComplete;

    const dot = el.shadowRoot?.querySelector(".tab-status-dot");
    expect(dot?.classList.contains("waiting")).toBe(true);
    expect(dot?.getAttribute("aria-label")).toBe("Waiting for response");
  });

  it("renders no work-state dot when the tab has no state", async () => {
    const el = new AppSessionTabs();
    el.tabs = [tab("a")];
    document.body.append(el);
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector(".tab-status-dot")).toBeNull();
  });
});

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
