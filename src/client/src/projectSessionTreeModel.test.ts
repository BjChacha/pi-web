import { describe, expect, it } from "vitest";
import type { Project, SessionInfo, Workspace } from "./api";
import { buildProjectSessionList, projectSessionEntry, type ProjectSessionListNode, type ProjectSessionListInputs } from "./projectSessionTreeModel";

const project = (id: string, name: string): Project => ({ id, name, path: `/repo/${id}`, createdAt: "2026-01-01T00:00:00.000Z" });

const workspace = (id: string, projectId: string, options: { main?: boolean; branch?: string } = {}): Workspace => ({
  id,
  projectId,
  path: `/repo/${projectId}/${id}`,
  label: id,
  ...(options.branch === undefined ? {} : { branch: options.branch }),
  isMain: options.main ?? false,
  isGitRepo: true,
  isGitWorktree: !(options.main ?? false),
});

const session = (id: string, cwd: string, modified: string): SessionInfo => ({
  id,
  cwd,
  path: `${cwd}/.pi/sessions/${id}.jsonl`,
  created: "2026-01-01T00:00:00.000Z",
  modified,
  messageCount: 1,
  firstMessage: id,
});

const baseInputs: Omit<ProjectSessionListInputs, "projects" | "workspacesByProjectId"> = {
  selectedSessions: [],
  sessionsByWorkspacePath: {},
  selectedWorkspaceId: undefined,
  selectedProjectId: undefined,
  expansionOverrides: new Map(),
};

function first(nodes: ProjectSessionListNode[]): ProjectSessionListNode {
  const node = nodes[0];
  if (node === undefined) throw new Error("expected at least one list node");
  return node;
}

describe("buildProjectSessionList", () => {
  it("merges sessions from the main workspace and worktrees under the project", () => {
    const node = first(buildProjectSessionList({
      ...baseInputs,
      projects: [project("alpha", "Alpha")],
      workspacesByProjectId: {
        alpha: [workspace("main", "alpha", { main: true }), workspace("auth", "alpha", { branch: "feat/auth" })],
      },
      sessionsByWorkspacePath: {
        "/repo/alpha/auth": [session("s-auth", "/repo/alpha/auth", "2026-02-01T00:00:00.000Z")],
        "/repo/alpha/main": [session("s-main", "/repo/alpha/main", "2026-01-01T00:00:00.000Z")],
      },
    }));

    expect(node.sessions.map((entry) => entry.session.id)).toEqual(["s-auth", "s-main"]);
    expect(node.sessions.map((entry) => entry.worktreeLabel)).toEqual(["feat/auth", undefined]);
  });

  it("prefers live selected-workspace sessions over the browse cache and skips foreign cwd entries", () => {
    const node = first(buildProjectSessionList({
      ...baseInputs,
      projects: [project("beta", "Beta")],
      workspacesByProjectId: { beta: [workspace("main", "beta", { main: true })] },
      selectedSessions: [session("s-live", "/repo/beta/main", "2026-03-01T00:00:00.000Z")],
      sessionsByWorkspacePath: { "/repo/beta/main": [session("s-stale", "/repo/beta/main", "2026-01-01T00:00:00.000Z")] },
      selectedWorkspaceId: "main",
      selectedProjectId: "beta",
    }));

    expect(node.sessions.map((entry) => entry.session.id)).toEqual(["s-live"]);
  });

  it("expands the selected project by default and honors user overrides both ways", () => {
    const tree = buildProjectSessionList({
      ...baseInputs,
      projects: [project("alpha", "Alpha"), project("beta", "Beta"), project("gamma", "Gamma")],
      workspacesByProjectId: {},
      selectedProjectId: "alpha",
      expansionOverrides: new Map([["alpha", false], ["gamma", true]]),
    });

    const alpha = tree[0];
    const beta = tree[1];
    const gamma = tree[2];
    if (alpha === undefined || beta === undefined || gamma === undefined) throw new Error("expected three nodes");
    expect(alpha.expanded).toBe(false);
    expect(beta.expanded).toBe(false);
    expect(gamma.expanded).toBe(true);
  });

  it("sorts merged sessions by most recently modified", () => {
    const node = first(buildProjectSessionList({
      ...baseInputs,
      projects: [project("alpha", "Alpha")],
      workspacesByProjectId: {
        alpha: [workspace("main", "alpha", { main: true }), workspace("auth", "alpha", { branch: "feat/auth" })],
      },
      sessionsByWorkspacePath: {
        "/repo/alpha/main": [session("old", "/repo/alpha/main", "2026-01-01T00:00:00.000Z"), session("new", "/repo/alpha/main", "2026-05-01T00:00:00.000Z")],
        "/repo/alpha/auth": [session("mid", "/repo/alpha/auth", "2026-03-01T00:00:00.000Z")],
      },
    }));

    expect(node.sessions.map((entry) => entry.session.id)).toEqual(["new", "mid", "old"]);
  });
});

describe("projectSessionEntry", () => {
  it("falls back to the workspace label when the worktree has no branch", () => {
    const entry = projectSessionEntry(session("s", "/repo/x", "now"), workspace("auth", "x"));
    expect(entry.worktreeLabel).toBe("auth");
  });
});

const WIN_SEP = String.fromCharCode(92);
function backslashPath(drive: string, ...segments: string[]): string {
  return [drive, ...segments].join(WIN_SEP);
}

describe("buildProjectSessionList Windows path separators", () => {
  it("matches session cwds against workspace paths across separator styles", () => {
    const node = first(buildProjectSessionList({
      ...baseInputs,
      projects: [project("alpha", "Alpha")],
      // Server shape: workspace paths use forward slashes...
      workspacesByProjectId: { alpha: [{ ...workspace("main", "alpha", { main: true }), path: "F:/Projects/alpha" }] },
      // ...while session cwds come back with backslashes.
      sessionsByWorkspacePath: { "F:/Projects/alpha": [session("s1", backslashPath("F:", "Projects", "alpha"), "2026-01-01T00:00:00.000Z")] },
    }));

    expect(node.sessions.map((entry) => entry.session.id)).toEqual(["s1"]);
  });
});
