import { api as defaultApi, type Project, type SessionInfo, type Workspace } from "../api";
import { resetWorkspaceScopedState, type AppState } from "../appState";
import { mergeCachedNewSessions } from "../cachedNewSessions";
import { machineProjectKey } from "../machineKeys";
import { selectedMachineId, type GetState, type RouteTarget, type SetState, type UpdateUrl } from "./types";
import type { SessionController } from "./sessionController";
import { TrailingRefreshCoordinator } from "./trailingRefreshCoordinator";
import { InMemoryWorkspaceSelectionMemory, selectPreferredWorkspace, type WorkspaceSelectionMemory } from "./workspaceSelection";

export interface WorkspaceControllerDependencies {
  api?: Pick<typeof defaultApi, "sessions" | "workspaces">;
  onBackgroundError?: (message: string, error: unknown) => void;
}

export class WorkspaceController {
  private readonly api: Pick<typeof defaultApi, "sessions" | "workspaces">;
  private readonly onBackgroundError: (message: string, error: unknown) => void;
  private readonly topologyRefreshes = new TrailingRefreshCoordinator<string>();
  private readonly sessionRefreshes = new TrailingRefreshCoordinator<string>();

  constructor(
    private readonly getState: GetState,
    private readonly setState: SetState,
    private readonly updateUrl: UpdateUrl,
    private readonly sessions: Pick<SessionController, "clearActiveSession" | "preferredSession" | "selectSession">,
    private readonly workspaceSelection: WorkspaceSelectionMemory = new InMemoryWorkspaceSelectionMemory(),
    deps: WorkspaceControllerDependencies = {},
  ) {
    this.api = deps.api ?? defaultApi;
    this.onBackgroundError = deps.onBackgroundError ?? ((message, error) => { console.warn(message, error); });
  }

  clearSelection(options?: { updateUrl?: boolean | undefined }) {
    this.sessions.clearActiveSession();
    this.setState({ selectedProject: undefined, selectedWorkspace: undefined, workspaces: [], isLoadingWorkspaces: false, isLoadingSessions: false, ...resetWorkspaceScopedState() });
    if (options?.updateUrl !== false) this.updateUrl();
  }

  forgetProject(projectId: string): void {
    this.workspaceSelection.forgetProject(machineProjectKey(selectedMachineId(this.getState()), projectId));
    const state = this.getState();
    // Drop the cached session lists for the forgotten project's workspaces too,
    // so a later re-add never paints a stale snapshot from before the close.
    const forgottenCwds = new Set((state.workspacesByProjectId[projectId] ?? []).map((workspace) => workspace.path));
    const workspacesByProjectId = Object.fromEntries(Object.entries(state.workspacesByProjectId).filter(([candidate]) => candidate !== projectId));
    const sessionsByWorkspacePath = forgottenCwds.size === 0
      ? state.sessionsByWorkspacePath
      : Object.fromEntries(Object.entries(state.sessionsByWorkspacePath).filter(([cwd]) => !forgottenCwds.has(cwd)));
    this.setState({ workspacesByProjectId, sessionsByWorkspacePath });
  }

  async selectProject(project: Project, target?: RouteTarget) {
    const machineId = selectedMachineId(this.getState());

    // Re-selecting the already-selected project from a plain click (no route
    // target): keep the current selection and refresh the topology in the
    // background, instead of blanking the workspace list and reloading it.
    if (this.getState().selectedProject?.id === project.id && target?.workspaceId === undefined && target?.sessionId === undefined) {
      void this.refreshSelectedProjectTopology();
      return;
    }

    this.sessions.clearActiveSession();
    const cachedWorkspaces = this.getState().workspacesByProjectId[project.id];
    this.setState({
      selectedProject: project,
      selectedWorkspace: undefined,
      workspaces: cachedWorkspaces ?? [],
      isLoadingWorkspaces: cachedWorkspaces === undefined,
      isLoadingSessions: false,
      ...resetWorkspaceScopedState(),
    });

    // Stale-while-revalidate: when we already have this project's topology,
    // paint it instantly and refresh in the background. First visit loads it.
    if (cachedWorkspaces !== undefined) {
      void this.refreshSelectedProjectTopology();
      await this.selectPreferredWorkspaceFrom(project, cachedWorkspaces, machineId, target);
      return;
    }

    try {
      const workspaces = await this.api.workspaces(project.id, machineId);
      if (selectedMachineId(this.getState()) !== machineId || this.getState().selectedProject?.id !== project.id) return;
      this.setState({ workspaces, workspacesByProjectId: { ...this.getState().workspacesByProjectId, [project.id]: workspaces }, isLoadingWorkspaces: false });
      await this.selectPreferredWorkspaceFrom(project, workspaces, machineId, target);
    } catch (error) {
      if (selectedMachineId(this.getState()) === machineId && this.getState().selectedProject?.id === project.id) this.setState({ error: String(error), isLoadingWorkspaces: false });
    }
  }

  async selectWorkspace(workspace: Workspace, target?: { sessionId?: string | undefined; updateUrl?: boolean | undefined }) {
    const machineId = selectedMachineId(this.getState());
    const cwd = workspace.path;

    // Re-selecting the already-selected workspace from a plain click (no route
    // target): keep the current selection and refresh the session list in the
    // background, instead of blanking it and reloading.
    if (this.getState().selectedWorkspace?.id === workspace.id && target?.sessionId === undefined) {
      void this.refreshSelectedWorkspaceSessions();
      return;
    }

    this.workspaceSelection.rememberWorkspace({ ...workspace, projectId: machineProjectKey(machineId, workspace.projectId) });
    this.sessions.clearActiveSession();
    const cachedSessions = this.getState().sessionsByWorkspacePath[cwd];
    this.setState({
      selectedWorkspace: workspace,
      isLoadingWorkspaces: false,
      ...resetWorkspaceScopedState(),
      ...(cachedSessions !== undefined ? { sessions: cachedSessions } : {}),
      isLoadingSessions: cachedSessions === undefined,
    });

    // Stale-while-revalidate: show the cached session list instantly and refresh
    // in the background; first visit loads it directly.
    if (cachedSessions !== undefined) {
      void this.refreshSelectedWorkspaceSessions();
      await this.selectPreferredSessionFrom(workspace, cachedSessions, target);
      return;
    }

    try {
      const sessions = mergeCachedNewSessions(cwd, await this.api.sessions(cwd, machineId), machineId);
      if (selectedMachineId(this.getState()) !== machineId || this.getState().selectedWorkspace?.id !== workspace.id || this.getState().selectedProject?.id !== workspace.projectId) return;
      this.setState({ sessions, sessionsByWorkspacePath: { ...this.getState().sessionsByWorkspacePath, [cwd]: sessions }, isLoadingSessions: false });
      await this.selectPreferredSessionFrom(workspace, sessions, target);
    } catch (error) {
      if (selectedMachineId(this.getState()) === machineId && this.getState().selectedWorkspace?.id === workspace.id) this.setState({ error: String(error), isLoadingSessions: false });
    }
  }

  /** Picks the workspace to select after a project load and routes to {@link selectWorkspace}, or updates the URL when none qualifies. */
  private async selectPreferredWorkspaceFrom(project: Project, workspaces: Workspace[], machineId: string, target: RouteTarget | undefined): Promise<void> {
    const workspace = selectPreferredWorkspace(workspaces, { targetWorkspaceId: target?.workspaceId, latestWorkspaceId: this.workspaceSelection.latestWorkspaceId(machineProjectKey(machineId, project.id)) });
    if (workspace !== undefined) {
      await this.selectWorkspace(workspace, { sessionId: target?.sessionId, updateUrl: target?.updateUrl });
      return;
    }
    if (target?.updateUrl !== false) this.updateUrl();
  }

  /** Picks the session to activate after a workspace load and routes to {@link SessionController.selectSession}, or updates the URL when none qualifies. */
  private async selectPreferredSessionFrom(workspace: Workspace, sessions: SessionInfo[], target: { sessionId?: string | undefined; updateUrl?: boolean | undefined } | undefined): Promise<void> {
    const session = this.sessions.preferredSession(workspace.path, sessions, target?.sessionId);
    if (session !== undefined) {
      await this.sessions.selectSession(session, { updateUrl: target?.updateUrl });
      return;
    }
    if (target?.updateUrl !== false) this.updateUrl();
  }

  async refreshProjectWorkspaces(projectId: string): Promise<Workspace[]> {
    const project = this.getState().projects.find((candidate) => candidate.id === projectId);
    if (project === undefined) throw new Error("Project not found");
    const workspaces = await this.api.workspaces(project.id, selectedMachineId(this.getState()));
    this.applyProjectWorkspaces(project.id, workspaces);
    return workspaces;
  }

  /**
   * Re-lists the selected project's workspaces so worktrees created or removed outside
   * PI WEB become visible, without disturbing the current selection.
   *
   * Deliberately never routes through `selectWorkspace`: that has no already-selected
   * guard, so re-picking the same workspace would still call `clearActiveSession()` and
   * `resetWorkspaceScopedState()`, closing the session socket and blanking chat, file
   * tree, git status, and terminal selection. Callers run this on every browser resume,
   * so applying the list through `applyProjectWorkspaces` alone is the invariant.
   *
   * If the selected workspace disappeared, the selection is left alone: the user is
   * working there and the existing deletion path owns recovery.
   */
  async refreshSelectedProjectTopology(): Promise<void> {
    const state = this.getState();
    const project = state.selectedProject;
    if (project === undefined) return;
    const machineId = selectedMachineId(state);
    // Callers are independent (browser resume and the plugin-facing app refresh), so two
    // refreshes for the same machine+project can overlap. Sharing one request keeps a slow
    // earlier response from landing last and overwriting a newer list, which would make a
    // just-created worktree disappear again.
    await this.topologyRefreshes.request(machineProjectKey(machineId, project.id), async () => {
      try {
        const workspaces = await this.api.workspaces(project.id, machineId);
        const current = this.getState();
        if (selectedMachineId(current) !== machineId || current.selectedProject?.id !== project.id) return;
        this.applyProjectWorkspaces(project.id, workspaces);
      } catch (error) {
        this.onBackgroundError(`Failed to refresh workspaces for project ${project.id} on ${machineId}`, error);
      }
    });
  }

  /**
   * Re-lists the selected workspace's sessions so sessions created, archived, or
   * removed elsewhere become visible, without disturbing the current selection or the
   * surfaces keyed on it. The background counterpart of the eager cache fill in
   * {@link selectWorkspace}; mirrors {@link refreshSelectedProjectTopology} for the
   * session list.
   */
  async refreshSelectedWorkspaceSessions(): Promise<void> {
    const state = this.getState();
    const workspace = state.selectedWorkspace;
    if (workspace === undefined) return;
    const machineId = selectedMachineId(state);
    const cwd = workspace.path;
    await this.sessionRefreshes.request(cwd, async () => {
      try {
        const sessions = mergeCachedNewSessions(cwd, await this.api.sessions(cwd, machineId), machineId);
        const current = this.getState();
        if (selectedMachineId(current) !== machineId || current.selectedWorkspace?.id !== workspace.id) return;
        this.setState({ sessions, sessionsByWorkspacePath: { ...current.sessionsByWorkspacePath, [cwd]: sessions } });
      } catch (error) {
        this.onBackgroundError(`Failed to refresh sessions for ${cwd} on ${machineId}`, error);
      }
    });
  }

  async refreshAfterWorkspaceDeleted(projectId: string, workspaceId: string): Promise<void> {
    const workspaces = await this.refreshProjectWorkspaces(projectId);
    const state = this.getState();
    if (state.selectedProject?.id !== projectId || state.selectedWorkspace?.id !== workspaceId) return;

    const fallback = selectFallbackWorkspace(workspaces);
    if (fallback !== undefined) await this.selectWorkspace(fallback);
    else this.clearSelection();
  }

  private applyProjectWorkspaces(projectId: string, workspaces: Workspace[]): void {
    const state = this.getState();
    const workspacesByProjectId = { ...state.workspacesByProjectId, [projectId]: workspaces };
    if (state.selectedProject?.id !== projectId) {
      this.setState({ workspacesByProjectId });
      return;
    }
    this.setState({ workspaces, workspacesByProjectId, ...this.refreshedSelection(state.selectedWorkspace, workspaces) });
  }

  /**
   * Re-points `selectedWorkspace` at its refreshed entry when metadata changed outside PI WEB
   * (a branch switched in the worktree, say), so the workspace list and the surfaces that read
   * the selected workspace cannot disagree. Keyed by id, which is derived from the path, so
   * this never changes *which* workspace is selected and never triggers the session/terminal
   * teardown in `handleWorkspaceChange`. Returns nothing when the entry is gone or unchanged,
   * so an unchanged refresh does not churn object identity into state.
   */
  private refreshedSelection(selected: Workspace | undefined, workspaces: Workspace[]): Pick<AppState, "selectedWorkspace"> | undefined {
    if (selected === undefined) return undefined;
    const refreshed = workspaces.find((candidate) => candidate.id === selected.id);
    if (refreshed === undefined || sameWorkspaceMetadata(selected, refreshed)) return undefined;
    return { selectedWorkspace: refreshed };
  }
}

export function canDeleteWorkspace(workspace: Workspace | undefined): boolean {
  return workspace !== undefined && workspace.isGitWorktree && !workspace.isMain;
}

function selectFallbackWorkspace(workspaces: Workspace[]): Workspace | undefined {
  return workspaces.find((workspace) => workspace.isMain) ?? workspaces[0];
}

function sameWorkspaceMetadata(left: Workspace, right: Workspace): boolean {
  return left.path === right.path
    && left.label === right.label
    && left.branch === right.branch
    && left.isMain === right.isMain
    && left.isGitRepo === right.isGitRepo
    && left.isGitWorktree === right.isGitWorktree;
}
