import type { Project, SessionInfo, Workspace } from "./api";
import { sessionPathsEqual } from "./sessionPaths";

/**
 * Two-level navigation model: project → sessions. Sessions from every
 * workspace (main + worktrees) of a project are merged into one flat list;
 * the owning workspace surfaces as a per-session attribute (worktree badge).
 * Pure so the folding rules are unit-testable without rendering.
 */

export interface ProjectSessionEntry {
  readonly session: SessionInfo;
  /** Owning workspace resolved from the session cwd; undefined when unmatched. */
  readonly workspace: Workspace | undefined;
  /** Branch label shown as the worktree attribute; undefined for the main workspace. */
  readonly worktreeLabel: string | undefined;
}

export interface ProjectSessionListNode {
  readonly project: Project;
  readonly expanded: boolean;
  readonly sessions: readonly ProjectSessionEntry[];
}

export interface ProjectSessionListInputs {
  readonly projects: readonly Project[];
  readonly workspacesByProjectId: Readonly<Record<string, Workspace[]>>;
  /** Live sessions of the selected workspace (authoritative, preferred over cache). */
  readonly selectedSessions: readonly SessionInfo[];
  /** Browse snapshots for non-selected workspaces, keyed by workspace path. */
  readonly sessionsByWorkspacePath: Readonly<Record<string, readonly SessionInfo[]>>;
  readonly selectedWorkspaceId: string | undefined;
  readonly selectedProjectId: string | undefined;
  /** Per-project user expand/collapse overrides; effective state falls back to selection. */
  readonly expansionOverrides: ReadonlyMap<string, boolean>;
}

export function buildProjectSessionList(inputs: ProjectSessionListInputs): ProjectSessionListNode[] {
  return inputs.projects.map((project) => {
    const workspaces = inputs.workspacesByProjectId[project.id] ?? [];
    const entries: ProjectSessionEntry[] = [];
    for (const workspace of workspaces) {
      const isSelected = inputs.selectedWorkspaceId === workspace.id;
      const workspaceSessions = isSelected
        ? inputs.selectedSessions
        : inputs.sessionsByWorkspacePath[workspace.path] ?? [];
      for (const session of workspaceSessions) {
        if (!sessionPathsEqual(session.cwd, workspace.path)) continue;
        entries.push(projectSessionEntry(session, workspace));
      }
    }
    entries.sort(byMostRecentlyModified);
    const override = inputs.expansionOverrides.get(project.id);
    return {
      project,
      expanded: override ?? inputs.selectedProjectId === project.id,
      sessions: entries,
    };
  });
}

export function projectSessionEntry(session: SessionInfo, workspace: Workspace): ProjectSessionEntry {
  return {
    session,
    workspace,
    worktreeLabel: workspace.isMain ? undefined : workspace.branch ?? workspace.label,
  };
}

function byMostRecentlyModified(left: ProjectSessionEntry, right: ProjectSessionEntry): number {
  return right.session.modified.localeCompare(left.session.modified);
}
