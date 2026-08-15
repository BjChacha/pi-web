// @vitest-environment happy-dom
// Binding-source text (a property binding missing its ${ prefix) renders as
// visible text instead of throwing, so these guards render the navigation
// panel and tree for real and assert no template source leaks into the DOM.
import { afterEach, describe, expect, it } from "vitest";
import type { Project, SessionInfo, Workspace } from "../../api";
import { AppNavigationPanel } from "./AppNavigationPanel";
import { ProjectSessionTree } from "./ProjectSessionTree";
import { SessionList } from "../SessionList";

afterEach(() => {
  document.body.replaceChildren();
});

describe("navigation panel rendering", () => {
  it("renders the panel without leaking binding source", async () => {
    const panel = new AppNavigationPanel();
    document.body.append(panel);
    await panel.updateComplete;
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(leakedBindings(panel.shadowRoot?.textContent ?? "")).toEqual([]);
  });

  it("renders a populated tree without leaking binding source", async () => {
    const tree = new ProjectSessionTree();
    tree.projects = [project("p1")];
    tree.workspacesByProjectId = { p1: [workspace("w1", "p1")] };
    tree.selectedWorkspace = workspace("w1", "p1");
    tree.sessions = [session("s1", "/repo/p1/w1")];
    tree.selectedSession = session("s1", "/repo/p1/w1");
    tree.collapsible = true;
    document.body.append(tree);
    await tree.updateComplete;

    // Projects start collapsed without a selection; expand by clicking the row.
    const projectRow = tree.shadowRoot?.querySelector(".action-row.project-row");
    if (!(projectRow instanceof HTMLElement)) throw new Error("expected a project row");
    projectRow.click();
    await tree.updateComplete;
    await new Promise((resolve) => { setTimeout(resolve, 10); });

    expect(leakedBindings(tree.shadowRoot?.textContent ?? "")).toEqual([]);
    expect(tree.shadowRoot?.querySelectorAll(".action-row.project-row").length).toBe(1);
    const sessionList = tree.shadowRoot?.querySelector("session-list");
    if (!(sessionList instanceof SessionList)) throw new Error("expected an embedded session list");
    await sessionList.updateComplete;
    await new Promise((resolve) => { setTimeout(resolve, 10); });
    expect(sessionList.shadowRoot?.querySelectorAll(".action-row").length).toBe(1);
  });
});

/** Binding-body fragments that must never appear as rendered text. */
function leakedBindings(text: string): string[] {
  const markers = ["?.()", "() =>", "focusNextFrom"];
  return markers.filter((marker) => text.includes(marker));
}

function project(id: string): Project {
  return { id, name: id, path: `/repo/${id}`, createdAt: "2026-01-01T00:00:00.000Z" };
}

function workspace(id: string, projectId: string): Workspace {
  return { id, projectId, path: `/repo/${projectId}/${id}`, label: id, isMain: true, isGitRepo: true, isGitWorktree: false };
}

function session(id: string, cwd: string): SessionInfo {
  return { id, path: `${cwd}/.pi/sessions/${id}.jsonl`, cwd, created: "2026-01-01T00:00:00.000Z", modified: "2026-01-01T00:00:00.000Z", messageCount: 1, firstMessage: id };
}

describe("project row interactions", () => {
  it("shows pending/total counts and colors when unread sessions exist", async () => {
    const tree = populatedTree();
    tree.unreadSessionIds = new Set(["s1"]);
    document.body.append(tree);
    await expandFirstProject(tree);

    const counts = tree.shadowRoot?.querySelector(".project-counts");
    if (!(counts instanceof HTMLElement)) throw new Error("expected project counts");
    expect(counts.textContent).toBe("1/2");
    expect(counts.classList.contains("has-pending")).toBe(true);
  });

  it("starts a session in the project through the + button", async () => {
    const tree = populatedTree();
    let started = "";
    tree.onProjectStartSession = (project) => { started = project.id; };
    document.body.append(tree);
    await expandFirstProject(tree);

    const plus = tree.shadowRoot?.querySelector<HTMLButtonElement>(".row-action.start");
    if (plus === null || plus === undefined) throw new Error("expected a project + button");
    plus.click();
    expect(started).toBe("p1");
    // The row click must not toggle expansion through the + button.
    expect(tree.shadowRoot?.querySelector("session-list")).toBeTruthy();
  });

  it("closes the project menu on clicks outside the open panel", async () => {
    const tree = populatedTree();
    document.body.append(tree);
    await expandFirstProject(tree);

    const menuToggle = tree.shadowRoot?.querySelector<HTMLButtonElement>(".action-menu-toggle:not(.start)");
    if (menuToggle === null || menuToggle === undefined) throw new Error("expected a project menu toggle");
    menuToggle.click();
    await tree.updateComplete;
    expect(tree.shadowRoot?.querySelector(".action-menu-panel")).toBeTruthy();

    document.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await tree.updateComplete;
    expect(tree.shadowRoot?.querySelector(".action-menu-panel")).toBeNull();

    // Clicks inside the open panel keep it open.
    menuToggle.click();
    await tree.updateComplete;
    const panel = tree.shadowRoot?.querySelector<HTMLElement>(".action-menu-panel");
    if (panel === null || panel === undefined) throw new Error("expected the reopened menu");
    panel.click();
    await tree.updateComplete;
    expect(tree.shadowRoot?.querySelector(".action-menu-panel")).toBeTruthy();
  });
});

function populatedTree(): ProjectSessionTree {
  const tree = new ProjectSessionTree();
  tree.projects = [project("p1")];
  tree.workspacesByProjectId = { p1: [workspace("w1", "p1")] };
  tree.selectedWorkspace = workspace("w1", "p1");
  tree.sessions = [session("s1", "/repo/p1/w1"), session("s2", "/repo/p1/w1")];
  return tree;
}

async function expandFirstProject(tree: ProjectSessionTree): Promise<void> {
  await tree.updateComplete;
  const projectRow = tree.shadowRoot?.querySelector(".action-row.project-row");
  if (!(projectRow instanceof HTMLElement)) throw new Error("expected a project row");
  projectRow.click();
  await tree.updateComplete;
}
