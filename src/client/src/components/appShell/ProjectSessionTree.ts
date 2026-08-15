import { LitElement, css, html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { Project, SessionActivity, SessionInfo, SessionStatus, Workspace, WorkspaceActivity } from "../../api";
import { t } from "../../i18n";
import { LocaleController } from "../../i18n/controller";
import { buildProjectSessionList, type ProjectSessionListNode } from "../../projectSessionTreeModel";
import { projectActivityIndicator } from "../../workspaceActivity";
import { actionMenuPanelStyle } from "../actionMenu";
import { renderActionActivityIndicator } from "../activityBadge";
import type { KeyboardNavigableSection } from "../navigationFocus";
import { activateSelectableRow, focusSelectedOrFirstSelectableRow, handleSelectableRowKeyboard } from "../selectableRow";
import { listStyles, flatListRowStyles } from "../shared";
import { SessionList, sessionRowUnread } from "../SessionList";
import type { ParentSessionLocation } from "../../parentSessionLocation";

/**
 * Two-level navigation tree: projects expand into a flat, merged session list
 * across all of the project's workspaces (main + worktrees); the owning
 * worktree surfaces as a per-session attribute. Clicking a project row toggles
 * that project's expansion independently. Browsing a project lazily loads its
 * topology and session snapshots without disturbing the app-level selection.
 */
@customElement("project-session-tree")
export class ProjectSessionTree extends LitElement implements KeyboardNavigableSection {
  private readonly locale = new LocaleController(this);

  @property({ attribute: false }) projects: Project[] = [];
  @property({ attribute: false }) workspacesByProjectId: Record<string, Workspace[]> = {};
  @property({ attribute: false }) selectedProject?: Project;
  @property({ attribute: false }) selectedWorkspace?: Workspace;
  @property({ attribute: false }) selectedSession?: SessionInfo;
  /** Live sessions of the selected workspace (authoritative). */
  @property({ attribute: false }) sessions: SessionInfo[] = [];
  /** Browse snapshots for non-selected workspaces, keyed by workspace path. */
  @property({ attribute: false }) sessionsByWorkspacePath: Record<string, SessionInfo[]> = {};
  @property({ attribute: false }) workspaceActivities: Record<string, WorkspaceActivity> = {};
  @property({ attribute: false }) unreadProjectIds: ReadonlySet<string> = new Set();

  @property({ type: Boolean, reflect: true }) collapsible = false;
  @property({ type: Boolean, reflect: true }) collapsed = false;

  @property({ attribute: false }) onAddProject?: () => void;
  @property({ attribute: false }) onProjectStartSession?: (project: Project) => void | Promise<void>;
  @property({ attribute: false }) onCloseProject?: (project: Project) => void | Promise<void>;
  @property({ attribute: false }) onBrowseProject?: (project: Project) => void | Promise<void>;
  @property({ attribute: false }) onBrowseWorkspaceSessions?: (workspace: Workspace) => void | Promise<void>;
  @property({ attribute: false }) onFocusPreviousSection?: () => void | Promise<void>;
  @property({ attribute: false }) onFocusNextSection?: () => void | Promise<void>;
  @property({ attribute: false }) onCancelKeyboardNavigation?: () => void | Promise<void>;

  // Session-list passthrough state and callbacks (see SessionList for meaning).
  @property({ attribute: false }) sessionStatuses: Record<string, SessionStatus> = {};
  @property({ attribute: false }) sessionActivities: Record<string, SessionActivity> = {};
  @property({ attribute: false }) sendingPrompts: Record<string, true> = {};
  @property({ attribute: false }) unreadSessionIds: ReadonlySet<string> = new Set();
  @property({ type: Number }) startingSessionCount = 0;
  @property({ type: Boolean }) canStartSession = false;
  @property({ type: Boolean }) canDeleteArchivedSessions = false;
  @property({ type: Boolean }) canReloadSessions = false;
  @property({ type: Boolean }) canCleanupSessions = false;
  @property({ type: Boolean }) authoritativeSessionPersistence = false;
  @property({ type: String }) archivedDeleteUnavailableMessage = "Update and restart Pi-Web on this machine to delete archived sessions.";
  @property({ type: String }) cleanupUnavailableMessage = "Update and restart Pi-Web on this machine to clean up sessions.";
  @property({ attribute: false }) parentSessionLocation: (session: SessionInfo) => ParentSessionLocation = () => ({ kind: "unknown" });
  @property({ attribute: false }) onSelectSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onStartSession?: () => void | Promise<void>;
  @property({ attribute: false }) onArchiveSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onArchiveSessionWithDescendants?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onArchiveSessions?: (sessions: SessionInfo[]) => void | Promise<void>;
  @property({ attribute: false }) onRestoreSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onDeleteCachedNewSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onDeleteArchivedSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onDeleteArchivedSessions?: (sessions: SessionInfo[]) => void | Promise<void>;
  @property({ attribute: false }) onDetachParentSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onGoToParentSession?: (session: SessionInfo, location: ParentSessionLocation) => void | Promise<void>;
  @property({ attribute: false }) onMarkSessionRead?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onMarkSessionsRead?: (sessions: SessionInfo[]) => void | Promise<void>;
  @property({ attribute: false }) onReloadSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onRenameSession?: (session: SessionInfo, name: string) => void | Promise<void>;
  @property({ attribute: false }) onCleanupSessions?: () => void | Promise<void>;
  @property({ attribute: false }) onArchivedCollapsed?: () => void | Promise<void>;

  /** Per-project expand/collapse overrides; effective state falls back to selection. */
  @state() private expansionOverrides = new Map<string, boolean>();
  @state() private openMenuProjectId: string | undefined;
  @state() private menuStyle = "";

  private readonly onDocumentClick = (event: MouseEvent) => {
    if (this.openMenuProjectId === undefined) return;
    // Dismiss on any click that is not inside the open panel itself; the
    // toggle button stops propagation and toggles through its own handler.
    if (event.composedPath().some((target) => target instanceof HTMLElement && target.classList.contains("action-menu-panel"))) return;
    this.openMenuProjectId = undefined;
  };

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("click", this.onDocumentClick);
  }

  override disconnectedCallback(): void {
    document.removeEventListener("click", this.onDocumentClick);
    super.disconnectedCallback();
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (this.openMenuProjectId !== undefined && !this.projects.some((project) => project.id === this.openMenuProjectId)) this.openMenuProjectId = undefined;
    if (changed.has("collapsed") && this.collapsed) this.openMenuProjectId = undefined;
  }

  async focusSelectedOrFirst(): Promise<boolean> {
    await this.updateComplete;
    const selectedRow = this.renderRoot.querySelector<HTMLElement>(".action-row.selected");
    if (selectedRow !== null) {
      selectedRow.focus();
      selectedRow.scrollIntoView({ block: "nearest" });
      return true;
    }
    const selectedSessionId = this.selectedSession?.id;
    for (const list of this.embeddedSessionLists()) {
      if (selectedSessionId !== undefined && list.sessions.some((session) => session.id === selectedSessionId)) return await list.focusSelectedOrFirst();
    }
    return focusSelectedOrFirstSelectableRow(this.renderRoot, { fallbackSelector: ".section-toggle, .add-project" });
  }

  /** Whether any embedded session list is editing a name inline, so parents can avoid stealing focus. */
  get isRenaming(): boolean {
    return this.embeddedSessionLists().some((list) => list.isRenaming);
  }

  override render() {
    return html`
      <section>
        <h2>
          ${this.renderHeading()}
          ${this.onAddProject === undefined ? null : html`<button class="add-project" title=${t("nav.project.add")} aria-label=${t("nav.project.add")} @click=${() => { this.onAddProject?.(); }}>+</button>`}
        </h2>
        ${this.collapsed ? null : html`
          <div class="list-body">
            ${this.tree().map((node) => this.renderProject(node))}
          </div>
        `}
      </section>
    `;
  }

  private tree(): ProjectSessionListNode[] {
    return buildProjectSessionList({
      projects: this.projects,
      workspacesByProjectId: this.workspacesByProjectId,
      selectedSessions: this.sessions,
      sessionsByWorkspacePath: this.sessionsByWorkspacePath,
      selectedWorkspaceId: this.selectedWorkspace?.id,
      selectedProjectId: this.selectedProject?.id,
      expansionOverrides: this.expansionOverrides,
    });
  }

  private renderHeading() {
    if (!this.collapsible) return html`<span>${t("nav.projects.heading")}</span>`;
    const selectedSummary = this.selectedProject?.name ?? t("sessions.noneSelected");
    const selectedTitle = this.selectedProject?.path ?? selectedSummary;
    return html`
      <button class="section-toggle" aria-expanded=${String(!this.collapsed)} @click=${() => { this.collapsed = !this.collapsed; }}><span class="section-title"><span class="section-name">${this.collapsed ? "▸" : "▾"} ${t("nav.projects.heading")}</span>${this.collapsed ? html`<small class="section-selected" title=${selectedTitle}>${selectedSummary}</small>` : null}</span><small class="section-count">${String(this.projects.length)}</small></button>
    `;
  }

  private renderProject(node: ProjectSessionListNode) {
    const selected = this.selectedProject?.id === node.project.id;
    return html`
      ${this.renderProjectRow(node, selected)}
      ${node.expanded ? this.renderProjectSessions(node) : null}
    `;
  }

  private renderProjectRow(node: ProjectSessionListNode, selected: boolean) {
    const project = node.project;
    const hasWorkspaces = (this.workspacesByProjectId[project.id] ?? []).length > 0;
    const pending = node.sessions.filter((entry) => sessionRowUnread(entry.session, this.unreadSessionIds)).length;
    const total = node.sessions.length;
    return html`
      <div
        class=${`action-row project-row ${selected ? "selected" : ""}`}
        tabindex="0"
        title=${project.path}
        @pointerenter=${() => { this.ensureProjectBrowsed(project); }}
        @click=${(event: MouseEvent) => { activateSelectableRow(event, () => { this.toggleProject(node); }); }}
        @keydown=${(event: KeyboardEvent) => { this.handleProjectKeydown(event, node); }}
      >
        <div class="action-main">
          ${this.renderFolderIcon(node.expanded)}
          <span class="action-name">${project.name}</span>
          ${this.renderProjectActivity(node)}
          ${hasWorkspaces ? null : html`<span class="project-loading" aria-hidden="true"></span>`}
          <span class="project-counts ${pending > 0 ? "has-pending" : ""}" title=${t("nav.project.countsTitle", { pending, total })}>${String(pending)}/${String(total)}</span>
        </div>
        <div class="action-menu">
          <button class="action-menu-toggle row-action start" title=${t("nav.project.startSession")} aria-label=${t("nav.project.startSessionFor", { name: project.name })} @click=${(event: MouseEvent) => { event.stopPropagation(); void this.onProjectStartSession?.(project); }}>+</button>
          <button class="action-menu-toggle" title=${t("nav.project.actions")} aria-label=${t("nav.project.actionsFor", { name: project.name })} @click=${(event: MouseEvent) => { event.stopPropagation(); this.toggleProjectMenu(project.id, event.currentTarget); }}>⋯</button>
          ${this.openMenuProjectId === project.id ? html`
            <div class="action-menu-panel" style=${this.menuStyle}>
              <button title=${t("nav.project.closeTitle")} @click=${() => { this.closeProject(project); }}>${t("nav.project.close")}</button>
            </div>
          ` : null}
        </div>
      </div>
    `;
  }

  /** Folder glyph whose open/closed state mirrors the project's expansion. */
  private renderFolderIcon(expanded: boolean) {
    return html`
      <span class="folder-icon" aria-hidden="true">
        ${expanded
          ? html`
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 3a1.5 1.5 0 0 0-1.5 1.5v2h13V5.5A1.5 1.5 0 0 0 12 4H8.4L7 2.6A1.5 1.5 0 0 0 5.9 2H2z"></path>
              <path d="M.5 6.5h13.2c.95 0 1.62.9 1.37 1.8l-1.1 4a1.9 1.9 0 0 1-1.87 1.4H2.1A1.6 1.6 0 0 1 .5 12.1z"></path>
            </svg>
          `
          : html`
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 3a1.5 1.5 0 0 0-1.5 1.5V12a1.5 1.5 0 0 0 1.5 1.5h12A1.5 1.5 0 0 0 15.5 12V5.5A1.5 1.5 0 0 0 14 4H8.4L7 2.6A1.5 1.5 0 0 0 5.9 2H2z"></path>
            </svg>
          `}
      </span>
    `;
  }

  private renderProjectSessions(node: ProjectSessionListNode) {
    const isSelectedProject = this.selectedProject?.id === node.project.id;
    const workspaces = this.workspacesByProjectId[node.project.id] ?? [];
    const isLoading = workspaces.length === 0 || (!isSelectedProject && node.sessions.length === 0 && !this.projectFullyCached(node));
    const worktreeLabelFor = (session: SessionInfo): string | undefined =>
      node.sessions.find((entry) => entry.session.id === session.id)?.worktreeLabel;
    return html`
      <session-list
        id=${embeddedListId(node.project.id)}
        class="embedded"
        embedded
        .sessions=${node.sessions.map((entry) => entry.session)}
        .isLoading=${isLoading}
        .statuses=${this.sessionStatuses}
        .activities=${this.sessionActivities}
        .sending=${this.sendingPrompts}
        .unreadSessionIds=${this.unreadSessionIds}
        .selected=${this.selectedSession}
        .startingCount=${isSelectedProject ? this.startingSessionCount : 0}
        .canStart=${isSelectedProject && this.canStartSession}
        .canDeleteArchived=${this.canDeleteArchivedSessions}
        .canReload=${this.canReloadSessions}
        .canCleanup=${this.canCleanupSessions}
        .authoritativeSessionPersistence=${this.authoritativeSessionPersistence}
        .archivedDeleteUnavailableMessage=${this.archivedDeleteUnavailableMessage}
        .cleanupUnavailableMessage=${this.cleanupUnavailableMessage}
        .parentLocation=${this.parentSessionLocation}
        .worktreeLabelFor=${worktreeLabelFor}
        .onStart=${() => { void this.onStartSession?.(); }}
        .onSelect=${(session: SessionInfo) => { void this.onSelectSession?.(session); }}
        .onArchive=${(session: SessionInfo) => { void this.onArchiveSession?.(session); }}
        .onArchiveWithDescendants=${(session: SessionInfo) => { void this.onArchiveSessionWithDescendants?.(session); }}
        .onArchiveMany=${(sessions: SessionInfo[]) => { void this.onArchiveSessions?.(sessions); }}
        .onRestore=${(session: SessionInfo) => { void this.onRestoreSession?.(session); }}
        .onDelete=${(session: SessionInfo) => { void this.onDeleteCachedNewSession?.(session); }}
        .onDeleteArchived=${(session: SessionInfo) => { void this.onDeleteArchivedSession?.(session); }}
        .onDeleteArchivedMany=${(sessions: SessionInfo[]) => { void this.onDeleteArchivedSessions?.(sessions); }}
        .onDetachParent=${(session: SessionInfo) => { void this.onDetachParentSession?.(session); }}
        .onGoToParent=${this.onGoToParentSession === undefined ? undefined : (session: SessionInfo, location: ParentSessionLocation) => this.onGoToParentSession?.(session, location)}
        .onMarkRead=${(session: SessionInfo) => { void this.onMarkSessionRead?.(session); }}
        .onMarkReadMany=${(sessions: SessionInfo[]) => { void this.onMarkSessionsRead?.(sessions); }}
        .onReload=${(session: SessionInfo) => { void this.onReloadSession?.(session); }}
        .onRename=${(session: SessionInfo, name: string) => { void this.onRenameSession?.(session, name); }}
        .onCleanup=${() => { void this.onCleanupSessions?.(); }}
        .onArchivedCollapsed=${() => { void this.onArchivedCollapsed?.(); }}
        .onFocusPreviousSection=${() => { this.focusAboveEmbeddedList(node.project.id); }}
        .onFocusNextSection=${this.onFocusNextSection === undefined ? undefined : () => { void this.onFocusNextSection?.(); }}
        .onCancelKeyboardNavigation=${this.onCancelKeyboardNavigation === undefined ? undefined : () => { void this.onCancelKeyboardNavigation?.(); }}
      ></session-list>
    `;
  }

  private renderProjectActivity(node: ProjectSessionListNode) {
    const kind = projectActivityIndicator(node.project, this.workspacesByProjectId[node.project.id] ?? [], this.workspaceActivities);
    const unreadLabel = this.unreadProjectIds.has(node.project.id) ? t("nav.project.unread") : undefined;
    return renderActionActivityIndicator(kind, kind === "terminal" ? t("nav.project.terminalActive") : t("nav.project.active"), unreadLabel);
  }

  /** Click on a project row toggles that project's expansion independently. */
  private toggleProject(node: ProjectSessionListNode): void {
    const effective = this.expansionOverrides.get(node.project.id) ?? this.selectedProject?.id === node.project.id;
    this.expansionOverrides = new Map(this.expansionOverrides).set(node.project.id, !effective);
    if (!effective) this.ensureProjectBrowsed(node.project);
  }

  /** Hover/expand prefetch: warm the project's topology and workspace session snapshots. */
  private ensureProjectBrowsed(project: Project): void {
    if (this.workspacesByProjectId[project.id] === undefined) {
      void this.onBrowseProject?.(project);
      return;
    }
    for (const workspace of this.workspacesByProjectId[project.id] ?? []) {
      if (workspace.id === this.selectedWorkspace?.id) continue;
      if (this.sessionsByWorkspacePath[workspace.path] === undefined) void this.onBrowseWorkspaceSessions?.(workspace);
    }
  }

  private projectFullyCached(node: ProjectSessionListNode): boolean {
    return (this.workspacesByProjectId[node.project.id] ?? []).every((workspace) =>
      workspace.id === this.selectedWorkspace?.id || this.sessionsByWorkspacePath[workspace.path] !== undefined);
  }

  private toggleProjectMenu(projectId: string, target: EventTarget | null) {
    if (this.openMenuProjectId === projectId) {
      this.openMenuProjectId = undefined;
      return;
    }
    this.menuStyle = actionMenuPanelStyle(target, { constrainTo: "viewport" });
    this.openMenuProjectId = projectId;
  }

  private closeProject(project: Project) {
    this.openMenuProjectId = undefined;
    if (confirm(t("nav.project.closeConfirm", { name: project.name }))) void this.onCloseProject?.(project);
  }

  private handleProjectKeydown(event: KeyboardEvent, node: ProjectSessionListNode) {
    const row = event.currentTarget;
    if (row instanceof HTMLElement) {
      if (event.key === "ArrowDown") {
        const next = row.nextElementSibling;
        if (next instanceof SessionList) {
          event.preventDefault();
          void next.focusSelectedOrFirst();
          return;
        }
      }
      if (event.key === "ArrowUp") {
        const previous = row.previousElementSibling;
        if (previous instanceof SessionList) {
          event.preventDefault();
          previous.focusLastRow();
          return;
        }
      }
    }
    handleSelectableRowKeyboard(event, {
      activate: () => { this.toggleProject(node); },
      previousSection: this.onFocusPreviousSection === undefined ? undefined : () => { void this.onFocusPreviousSection?.(); },
      nextSection: this.onFocusNextSection === undefined ? undefined : () => { void this.onFocusNextSection?.(); },
      cancel: this.onCancelKeyboardNavigation === undefined ? undefined : () => { void this.onCancelKeyboardNavigation?.(); },
    });
  }

  /** Focus the row (or embedded list tail) directly above an embedded list. */
  private focusAboveEmbeddedList(projectId: string) {
    const list = this.renderRoot.querySelector(`#${embeddedListId(projectId)}`);
    const previous = list?.previousElementSibling;
    if (previous instanceof SessionList) {
      previous.focusLastRow();
      return;
    }
    if (previous instanceof HTMLElement && previous.matches(".action-row")) {
      previous.focus();
      previous.scrollIntoView({ block: "nearest" });
    }
  }

  private embeddedSessionLists(): SessionList[] {
    return Array.from(this.renderRoot.querySelectorAll<SessionList>("session-list"));
  }

  static override styles = [listStyles, flatListRowStyles, css`
    section { padding: 8px 8px 12px; }
    .folder-icon { flex: 0 0 auto; display: inline-grid; place-items: center; width: 18px; height: 16px; color: var(--pi-accent); }
    .folder-icon svg { width: 15px; height: 15px; }
    .action-row.selected .folder-icon { color: var(--pi-accent); }
    .action-row:not(.selected) .folder-icon { opacity: .85; }
    .project-counts { flex: 0 0 auto; margin-left: auto; color: var(--pi-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
    .project-counts.has-pending { color: var(--pi-accent); }
    session-list.embedded { flex: 0 0 auto; display: block; margin-left: 16px; }
    .project-loading { flex: 0 0 auto; width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid var(--pi-border); border-top-color: var(--pi-muted); animation: project-spin .7s linear infinite; }
    @keyframes project-spin { to { transform: rotate(360deg); } }
  `];
}

function embeddedListId(projectId: string): string {
  return `tree-sessions-${projectId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
