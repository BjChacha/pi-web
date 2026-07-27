// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import type { Workspace } from "../api";
import { WorkspaceList } from "./WorkspaceList";

afterEach(() => {
  document.body.replaceChildren();
});

describe("workspace unread indicator", () => {
  it("shows an unread dot only on workspaces tracked as unread", async () => {
    const list = await mountWorkspaceList([workspace("ws-a"), workspace("ws-b")], new Set(["ws-b"]));

    expect(unreadDot(rowFor(list, "ws-a"))).toBeNull();
    const dot = unreadDot(rowFor(list, "ws-b"));
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute("title")).toBe("Unread sessions in this workspace");
  });

  it("clears the dot once the workspace is no longer tracked as unread", async () => {
    const list = await mountWorkspaceList([workspace("ws-a")], new Set(["ws-a"]));
    expect(list.shadowRoot?.querySelector(".activity-indicator.unread")).not.toBeNull();

    list.unreadWorkspaceIds = new Set();
    await list.updateComplete;

    expect(list.shadowRoot?.querySelector(".activity-indicator.unread")).toBeNull();
  });
});

async function mountWorkspaceList(workspaces: Workspace[], unreadWorkspaceIds: ReadonlySet<string>): Promise<WorkspaceList> {
  const list = new WorkspaceList();
  list.workspaces = workspaces;
  list.unreadWorkspaceIds = unreadWorkspaceIds;
  document.body.append(list);
  await list.updateComplete;
  return list;
}

function rowFor(list: WorkspaceList, workspaceLabel: string): Element {
  const rows = [...(list.shadowRoot?.querySelectorAll(".workspace-row") ?? [])];
  const row = rows.find((candidate) => candidate.textContent.includes(workspaceLabel));
  if (row === undefined) throw new Error(`Expected a workspace row for ${workspaceLabel}`);
  return row;
}

function unreadDot(row: Element): Element | null {
  return row.querySelector(".activity-indicator.unread");
}

function workspace(id: string): Workspace {
  return { id, projectId: "project-1", path: `/repo/${id}`, label: id, isMain: true, isGitRepo: true, isGitWorktree: false };
}
