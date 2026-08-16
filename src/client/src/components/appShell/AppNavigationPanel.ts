import { LitElement, css, html } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import type { Machine, MachineHealth, Project, SessionActivity, SessionInfo, SessionStatus, Workspace, WorkspaceActivity } from "../../api";
import type { NavigationSection } from "../../appShell/navigationState";
import { NAVIGATION_SECTION_ORDER } from "../../appShell/navigationState";
import { EMPTY_UNREAD_PRESENCE, type UnreadPresence } from "../../unreadPresence";
import { t } from "../../i18n";
import type { KeyboardNavigableSection } from "../navigationFocus";
import type { ParentSessionLocation } from "../../parentSessionLocation";
import "../MachineList";
import "../MachineSwitcher";
// Side-effect import: registers <project-session-tree>. The class is only
// referenced in type positions here, so a value import would be stripped by
// the transform and the element would never upgrade in the browser.
import "./ProjectSessionTree";
import type { ProjectSessionTree } from "./ProjectSessionTree";

export type NavigationFocusTarget = NavigationSection | "chat";

@customElement("app-navigation-panel")
export class AppNavigationPanel extends LitElement {
  @property({ attribute: false }) machines: Machine[] = [];
  @property({ attribute: false }) selectedMachine?: Machine;
  @property({ attribute: false }) machineStatuses: Record<string, MachineHealth> = {};
  @property({ attribute: false }) machineActivities: Record<string, Record<string, WorkspaceActivity>> = {};
  @property({ attribute: false }) projects: Project[] = [];
  @property({ attribute: false }) selectedProject?: Project;
  @property({ attribute: false }) workspacesByProjectId: Record<string, Workspace[]> = {};
  @property({ type: Boolean }) isLoadingWorkspaces = false;
  @property({ attribute: false }) selectedWorkspace?: Workspace;
  @property({ attribute: false }) selectedSession?: SessionInfo;
  @property({ attribute: false }) sessions: SessionInfo[] = [];
  @property({ type: Boolean }) isLoadingSessions = false;
  @property({ attribute: false }) sessionsByWorkspacePath: Record<string, SessionInfo[]> = {};
  @property({ attribute: false }) workspaceActivities: Record<string, WorkspaceActivity> = {};
  @property({ attribute: false }) sessionActivities: Record<string, SessionActivity> = {};
  @property({ attribute: false }) sessionStatuses: Record<string, SessionStatus> = {};
  @property({ attribute: false }) sendingPrompts: Record<string, true> = {};
  @property({ attribute: false }) unreadSessionIds: ReadonlySet<string> = new Set();
  @property({ attribute: false }) unreadPresence: UnreadPresence = EMPTY_UNREAD_PRESENCE;
  @property({ attribute: false }) refreshControl: unknown;
  @property({ type: Boolean, reflect: true }) collapsible = false;
  @property({ type: Boolean, reflect: true }) compact = false;
  @property({ type: Boolean }) machinesCollapsed = false;
  @property({ type: Boolean }) treeCollapsed = false;
  @property({ type: Number }) startingSessionCount = 0;
  @property({ type: Boolean }) canStartSession = false;
  @property({ type: Boolean }) canDeleteArchivedSessions = false;
  @property({ type: Boolean }) canReloadSessions = false;
  @property({ type: Boolean }) canCleanupSessions = false;
  @property({ type: Boolean }) authoritativeSessionPersistence = false;
  @property({ type: String }) archivedDeleteUnavailableMessage = "Update and restart Pi-Web on this machine to delete archived sessions.";
  @property({ type: String }) cleanupUnavailableMessage = "Update and restart Pi-Web on this machine to clean up sessions.";
  @property({ attribute: false }) onShowActions?: () => void;
  @property({ attribute: false }) onToggleMachines?: () => void;
  @property({ attribute: false }) onToggleTree?: () => void;
  @property({ attribute: false }) onAddProject?: () => void;
  @property({ attribute: false }) onSelectProject?: (project: Project) => void | Promise<void>;
  @property({ attribute: false }) onCloseProject?: (project: Project) => void | Promise<void>;
  @property({ attribute: false }) onBrowseProjectWorkspaces?: (project: Project) => void | Promise<void>;
  @property({ attribute: false }) onProjectStartSession?: (project: Project) => void | Promise<void>;
  @property({ attribute: false }) onBrowseWorkspaceSessions?: (workspace: Workspace) => void | Promise<void>;
  @property({ attribute: false }) onStartSession?: () => void | Promise<void>;
  @property({ attribute: false }) onSelectSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onArchiveSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onArchiveSessionWithDescendants?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onArchiveSessions?: (sessions: SessionInfo[]) => void | Promise<void>;
  @property({ attribute: false }) onRestoreSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onDeleteCachedNewSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onDeleteArchivedSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onDeleteArchivedSessions?: (sessions: SessionInfo[]) => void | Promise<void>;
  @property({ attribute: false }) onDetachParentSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) parentSessionLocation?: (session: SessionInfo) => ParentSessionLocation;
  @property({ attribute: false }) onGoToParentSession?: (session: SessionInfo, location: ParentSessionLocation) => void | Promise<void>;
  @property({ attribute: false }) onMarkSessionRead?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onMarkSessionsRead?: (sessions: SessionInfo[]) => void | Promise<void>;
  @property({ attribute: false }) onReloadSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onRenameSession?: (session: SessionInfo, name: string) => void | Promise<void>;
  @property({ attribute: false }) onCleanupSessions?: () => void | Promise<void>;
  @property({ attribute: false }) onArchivedCollapsed?: () => void | Promise<void>;
  @property({ attribute: false }) onSelectMachine?: (machine: Machine) => void | Promise<void>;
  @property({ attribute: false }) onRemoveMachine?: (machine: Machine) => void | Promise<void>;
  @property({ attribute: false }) onFocusNavigationTarget?: (target: NavigationFocusTarget) => void | Promise<void>;
  @property({ attribute: false }) onCancelKeyboardNavigation?: () => void | Promise<void>;

  @query("machine-list") private machineList?: KeyboardNavigableSection;
  @query("machine-switcher") private machineSwitcher?: KeyboardNavigableSection;
  @query("project-session-tree") private projectSessionTree?: ProjectSessionTree;

  /** Whether the session list is currently editing a name inline. */
  get sessionListRenaming(): boolean {
    return this.projectSessionTree?.isRenaming === true;
  }

  async focusSection(section: NavigationSection): Promise<boolean> {
    await this.updateComplete;
    switch (section) {
      case "machines": return await this.focusNavigableSection(this.compact ? this.machineList : this.machineSwitcher);
      case "tree": return await this.focusNavigableSection(this.projectSessionTree);
    }
  }

  override render() {
    return html`
      <header>
        <strong>PI WEB</strong>
        ${shouldShowMachinesSection(this.machines) ? html`
          <machine-switcher
            .machines=${this.machines}
            .selected=${this.selectedMachine}
            .statuses=${this.machineStatuses}
            .activities=${this.machineActivities}
            .unreadMachineIds=${this.unreadPresence.machines}
            .onSelect=${(machine: Machine) => this.onSelectMachine?.(machine)}
            .onRemove=${(machine: Machine) => this.onRemoveMachine?.(machine)}
            .onFocusNextSection=${() => { this.focusNextFrom("machines"); }}
            .onCancelKeyboardNavigation=${() => { this.cancelKeyboardNavigation(); }}
          ></machine-switcher>
        ` : null}
        <div class="header-actions">
          ${this.refreshControl}
          <button title=${t("nav.actions.show")} aria-label=${t("nav.actions.show")} @click=${() => { this.onShowActions?.(); }}>Actions</button>
        </div>
      </header>
      ${this.compact && shouldShowMachinesSection(this.machines) ? html`
        <machine-list
          .machines=${this.machines}
          .selected=${this.selectedMachine}
          .statuses=${this.machineStatuses}
          .activities=${this.machineActivities}
          .unreadMachineIds=${this.unreadPresence.machines}
          .collapsible=${this.collapsible}
          .collapsed=${this.machinesCollapsed}
          .onToggleCollapsed=${() => { this.onToggleMachines?.(); }}
          .onSelect=${(machine: Machine) => this.onSelectMachine?.(machine)}
          .onRemove=${(machine: Machine) => this.onRemoveMachine?.(machine)}
          .onFocusNextSection=${() => { this.focusNextFrom("machines"); }}
          .onCancelKeyboardNavigation=${() => { this.cancelKeyboardNavigation(); }}
        ></machine-list>
      ` : null}
      <project-session-tree
        .projects=${this.projects}
        .workspacesByProjectId=${this.workspacesByProjectId}
        .isLoadingWorkspaces=${this.isLoadingWorkspaces}
        .selectedProject=${this.selectedProject}
        .selectedWorkspace=${this.selectedWorkspace}
        .selectedSession=${this.selectedSession}
        .sessions=${this.sessions}
        .isLoadingSessions=${this.isLoadingSessions}
        .sessionsByWorkspacePath=${this.sessionsByWorkspacePath}
        .workspaceActivities=${this.workspaceActivities}
        .sessionActivities=${this.sessionActivities}
        .sessionStatuses=${this.sessionStatuses}
        .sendingPrompts=${this.sendingPrompts}
        .unreadSessionIds=${this.unreadSessionIds}
        .unreadProjectIds=${this.unreadPresence.projects}
        .startingSessionCount=${this.startingSessionCount}
        .canStartSession=${this.canStartSession}
        .canDeleteArchivedSessions=${this.canDeleteArchivedSessions}
        .canReloadSessions=${this.canReloadSessions}
        .canCleanupSessions=${this.canCleanupSessions}
        .authoritativeSessionPersistence=${this.authoritativeSessionPersistence}
        .archivedDeleteUnavailableMessage=${this.archivedDeleteUnavailableMessage}
        .cleanupUnavailableMessage=${this.cleanupUnavailableMessage}
        .collapsible=${this.collapsible}
        .collapsed=${this.treeCollapsed}
        .parentSessionLocation=${this.parentSessionLocation ?? unknownParentSessionLocation}
        .onToggleCollapsed=${() => { this.onToggleTree?.(); }}
        .onAddProject=${this.onAddProject === undefined ? undefined : () => { this.onAddProject?.(); }}
        .onSelectProject=${(project: Project) => this.onSelectProject?.(project)}
        .onCloseProject=${(project: Project) => this.onCloseProject?.(project)}
        .onBrowseProject=${this.onBrowseProjectWorkspaces === undefined ? undefined : (project: Project) => this.onBrowseProjectWorkspaces?.(project)}
        .onProjectStartSession=${this.onProjectStartSession === undefined ? undefined : (project: Project) => { void this.onProjectStartSession?.(project); }}
        .onBrowseWorkspaceSessions=${this.onBrowseWorkspaceSessions === undefined ? undefined : (workspace: Workspace) => this.onBrowseWorkspaceSessions?.(workspace)}
        .onStartSession=${() => { void this.onStartSession?.(); }}
        .onSelectSession=${(session: SessionInfo) => this.onSelectSession?.(session)}
        .onArchiveSession=${(session: SessionInfo) => this.onArchiveSession?.(session)}
        .onArchiveSessionWithDescendants=${(session: SessionInfo) => this.onArchiveSessionWithDescendants?.(session)}
        .onArchiveSessions=${(sessions: SessionInfo[]) => this.onArchiveSessions?.(sessions)}
        .onRestoreSession=${(session: SessionInfo) => this.onRestoreSession?.(session)}
        .onDeleteCachedNewSession=${(session: SessionInfo) => this.onDeleteCachedNewSession?.(session)}
        .onDeleteArchivedSession=${(session: SessionInfo) => this.onDeleteArchivedSession?.(session)}
        .onDeleteArchivedSessions=${(sessions: SessionInfo[]) => this.onDeleteArchivedSessions?.(sessions)}
        .onDetachParentSession=${(session: SessionInfo) => this.onDetachParentSession?.(session)}
        .onGoToParentSession=${this.onGoToParentSession === undefined ? undefined : (session: SessionInfo, location: ParentSessionLocation) => this.onGoToParentSession?.(session, location)}
        .onMarkSessionRead=${(session: SessionInfo) => this.onMarkSessionRead?.(session)}
        .onMarkSessionsRead=${(sessions: SessionInfo[]) => this.onMarkSessionsRead?.(sessions)}
        .onReloadSession=${(session: SessionInfo) => this.onReloadSession?.(session)}
        .onRenameSession=${(session: SessionInfo, name: string) => this.onRenameSession?.(session, name)}
        .onCleanupSessions=${() => { void this.onCleanupSessions?.(); }}
        .onArchivedCollapsed=${() => { void this.onArchivedCollapsed?.(); }}
        .onFocusPreviousSection=${() => { this.focusPreviousFrom("tree"); }}
        .onFocusNextSection=${() => { this.focusNextFrom("tree"); }}
        .onCancelKeyboardNavigation=${() => { this.cancelKeyboardNavigation(); }}
      ></project-session-tree>
    `;
  }

  private async focusNavigableSection(section: KeyboardNavigableSection | undefined): Promise<boolean> {
    if (section === undefined) return false;
    return await section.focusSelectedOrFirst();
  }

  private focusPreviousFrom(section: NavigationSection): void {
    const target = previousVisibleNavigationTarget(section, this.machines);
    if (target !== undefined) void this.onFocusNavigationTarget?.(target);
  }

  private focusNextFrom(section: NavigationSection): void {
    void this.onFocusNavigationTarget?.(nextVisibleNavigationTarget(section, this.machines));
  }

  private cancelKeyboardNavigation(): void {
    void this.onCancelKeyboardNavigation?.();
  }

  static override styles = css`
    :host { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
    :host([compact]) { flex: 1 1 auto; }
    header { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px; border-bottom: 1px solid var(--pi-border); }
    header strong { flex: 0 0 auto; }
    machine-switcher { flex: 1 1 auto; min-width: 0; }
    :host([compact]) header { display: none; }
    .header-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
    machine-list { flex: 0 0 auto; max-height: 26%; min-height: 0; overflow: hidden; border-bottom: 1px solid var(--pi-border-muted); }
    machine-list[collapsed] { flex: 0 0 auto; min-height: auto; overflow: hidden; }
    project-session-tree { flex: 1 1 auto; min-height: 0; overflow: hidden; }
    project-session-tree[collapsed] { flex: 0 0 auto; min-height: auto; overflow: hidden; }
    :host([compact]) machine-list,
    :host([compact]) project-session-tree { flex: 1 1 auto; max-height: none; min-height: 0; overflow: hidden; }
    :host([compact]) machine-list[collapsed],
    :host([compact]) project-session-tree[collapsed] { flex: 0 0 auto; min-height: auto; overflow: hidden; }
    button { border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); color: var(--pi-text); padding: 7px 9px; cursor: pointer; }
  `;
}

/** Stable default so the tree does not see a new resolver identity each render. */
const unknownParentSessionLocation = (): ParentSessionLocation => ({ kind: "unknown" });

export function shouldShowMachinesSection(machines: readonly Machine[]): boolean {
  return machines.length > 1;
}

function previousVisibleNavigationTarget(section: NavigationSection, machines: readonly Machine[]): NavigationSection | undefined {
  const sections = visibleNavigationSections(machines);
  return sections[sections.indexOf(section) - 1];
}

function nextVisibleNavigationTarget(section: NavigationSection, machines: readonly Machine[]): NavigationFocusTarget {
  const sections = visibleNavigationSections(machines);
  return sections[sections.indexOf(section) + 1] ?? "chat";
}

function visibleNavigationSections(machines: readonly Machine[]): NavigationSection[] {
  return NAVIGATION_SECTION_ORDER.filter((section) => section !== "machines" || shouldShowMachinesSection(machines));
}
