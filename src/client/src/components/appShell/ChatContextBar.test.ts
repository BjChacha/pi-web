// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project, Workspace } from "../../api";
import { ChatContextBar } from "./ChatContextBar";

afterEach(() => {
  document.body.replaceChildren();
});

describe("chat-context-bar", () => {
  it("renders the project / workspace breadcrumb with a worktree tag", async () => {
    const bar = new ChatContextBar();
    bar.project = project("p1");
    bar.workspace = workspace("auth", "p1", { branch: "feat/auth", main: false, worktree: true });
    document.body.append(bar);
    await bar.updateComplete;

    const crumbs = bar.shadowRoot?.querySelector(".breadcrumb")?.textContent ?? "";
    expect(crumbs).toContain("pi-web");
    expect(crumbs).toContain("feat/auth");
    expect(crumbs).toContain("worktree");

    const tag = bar.shadowRoot?.querySelector(".worktree-tag");
    expect(tag?.textContent).toContain("worktree");
  });

  it("omits the worktree tag for the main workspace", async () => {
    const bar = new ChatContextBar();
    bar.project = project("p1");
    bar.workspace = workspace("main", "p1", { main: true, worktree: false });
    document.body.append(bar);
    await bar.updateComplete;

    expect(bar.shadowRoot?.querySelector(".worktree-tag")).toBeNull();
  });

  it("focuses the navigation tree when the project crumb is clicked", async () => {
    const bar = new ChatContextBar();
    bar.project = project("p1");
    const onFocusTree = vi.fn();
    bar.onFocusTree = onFocusTree;
    document.body.append(bar);
    await bar.updateComplete;

    bar.shadowRoot?.querySelector<HTMLButtonElement>(".project-crumb")?.click();
    expect(onFocusTree).toHaveBeenCalledTimes(1);
  });

  it("offers copy actions and worktree deletion in the menu and closes it on outside clicks", async () => {
    const bar = new ChatContextBar();
    bar.project = project("p1");
    bar.workspace = workspace("auth", "p1", { branch: "feat/auth", main: false, worktree: true });
    const onDeleteWorkspace = vi.fn();
    bar.onDeleteWorkspace = onDeleteWorkspace;
    document.body.append(bar);
    await bar.updateComplete;

    const toggle = bar.shadowRoot?.querySelector<HTMLButtonElement>(".context-menu-toggle");
    if (toggle === null || toggle === undefined) throw new Error("expected a menu toggle");
    toggle.click();
    await bar.updateComplete;

    const buttons = Array.from(bar.shadowRoot?.querySelectorAll<HTMLButtonElement>(".action-menu-panel button") ?? []);
    expect(buttons.map((button) => button.textContent)).toContain("Copy path");
    expect(buttons.map((button) => button.textContent)).toContain("Delete workspace");

    const deleteButton = buttons.find((button) => button.textContent === "Delete workspace");
    deleteButton?.click();
    await bar.updateComplete;
    expect(onDeleteWorkspace).toHaveBeenCalledTimes(1);
    expect(bar.shadowRoot?.querySelector(".action-menu-panel")).toBeNull();

    toggle.click();
    await bar.updateComplete;
    document.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await bar.updateComplete;
    expect(bar.shadowRoot?.querySelector(".action-menu-panel")).toBeNull();
  });

  it("hides the delete action for the main workspace", async () => {
    const bar = new ChatContextBar();
    bar.project = project("p1");
    bar.workspace = workspace("main", "p1", { main: true, worktree: false });
    document.body.append(bar);
    await bar.updateComplete;

    bar.shadowRoot?.querySelector<HTMLButtonElement>(".context-menu-toggle")?.click();
    await bar.updateComplete;
    const labels = Array.from(bar.shadowRoot?.querySelectorAll<HTMLButtonElement>(".action-menu-panel button") ?? []).map((button) => button.textContent);
    expect(labels).not.toContain("Delete workspace");
  });
});

function project(id: string): Project {
  return { id, name: "pi-web", path: `F:/repo/${id}`, createdAt: "2026-01-01T00:00:00.000Z" };
}

function workspace(id: string, projectId: string, options: { main: boolean; worktree: boolean; branch?: string }): Workspace {
  return {
    id,
    projectId,
    path: `F:/repo/${projectId}/${id}`,
    label: id,
    ...(options.branch === undefined ? {} : { branch: options.branch }),
    isMain: options.main,
    isGitRepo: true,
    isGitWorktree: options.worktree,
  };
}
