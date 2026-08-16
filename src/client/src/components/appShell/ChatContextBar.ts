import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { writeClipboardText } from "../../clipboard";
import { t } from "../../i18n";
import { LocaleController } from "../../i18n/controller";
import type { Project, Workspace } from "../../api";
import { actionMenuPanelStyle } from "../actionMenu";

/**
 * Header strip above the chat composer: current project and workspace context
 * (absorbing the workspace attributes the navigation tree folded away), plus
 * worktree management actions.
 */
@customElement("chat-context-bar")
export class ChatContextBar extends LitElement {
  private readonly locale = new LocaleController(this);

  @property({ attribute: false }) project: Project | undefined;
  @property({ attribute: false }) workspace: Workspace | undefined;
  @property({ type: Boolean }) workspaceDeleting = false;
  @property({ attribute: false }) onFocusTree?: () => void | Promise<void>;
  @property({ attribute: false }) onDeleteWorkspace?: (workspace: Workspace) => void | Promise<void>;

  @state() private menuOpen = false;
  @state() private menuStyle = "";
  @state() private copiedKey: string | undefined;

  private readonly onDocumentClick = (event: MouseEvent) => {
    if (!this.menuOpen) return;
    if (event.composedPath().includes(this)) return;
    this.menuOpen = false;
  };

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("click", this.onDocumentClick);
  }

  override disconnectedCallback(): void {
    document.removeEventListener("click", this.onDocumentClick);
    super.disconnectedCallback();
  }

  override render() {
    if (this.project === undefined && this.workspace === undefined) return nothing;
    return html`
      <header class="bar" aria-label=${t("chat.context.heading")}>
        ${this.renderBreadcrumb()}
        ${this.renderActions()}
      </header>
    `;
  }

  /** project / workspace(branch) breadcrumb; clicking the project focuses the navigation tree. */
  private renderBreadcrumb(): TemplateResult {
    return html`
      <nav class="breadcrumb" aria-label=${t("chat.context.breadcrumb")}>
        ${this.project === undefined ? null : html`
          <button class="crumb project-crumb" title=${this.project.path} @click=${() => { void this.onFocusTree?.(); }}>
            ${this.project.name}
          </button>
        `}
        ${this.workspace === undefined ? null : html`
          <span class="crumb-separator" aria-hidden="true">/</span>
          <span class="crumb workspace-crumb" title=${this.workspace.path}>
            ${workspaceLabel(this.workspace)}
            ${this.workspace.isMain ? null : html`<span class="worktree-tag">${t("chat.context.worktree")}</span>`}
            ${this.workspaceDeleting ? html`<span class="deleting-tag">${t("nav.workspace.deleting")}</span>` : null}
          </span>
        `}
      </nav>
    `;
  }

  private renderActions(): TemplateResult | typeof nothing {
    if (this.workspace === undefined) return nothing;
    const menuId = "chat-context-menu";
    const open = this.menuOpen;
    const workspace = this.workspace;
    return html`
      <div class="actions">
        <button
          class="context-menu-toggle"
          title=${t("chat.context.actions")}
          aria-label=${t("chat.context.actions")}
          aria-expanded=${String(open)}
          aria-controls=${menuId}
          @click=${(event: MouseEvent) => { event.stopPropagation(); this.toggleMenu(event.currentTarget); }}
        >⋯</button>
        ${open ? html`
          <div class="action-menu-panel" id=${menuId} style=${this.menuStyle} @click=${(event: MouseEvent) => { event.stopPropagation(); }}>
            <button title=${t("nav.workspace.copyPath")} @click=${() => { void this.copyDetail("path", workspace.path); }}>${t("nav.workspace.copyPath")}${this.renderCopiedTick("path")}</button>
            ${workspace.branch === undefined ? null : html`
              <button title=${t("nav.workspace.copyBranch")} @click=${() => { void this.copyDetail("branch", workspace.branch ?? ""); }}>${t("nav.workspace.copyBranch")}${this.renderCopiedTick("branch")}</button>
            `}
            ${this.canDeleteWorkspace ? html`
              <button class="danger" title=${this.workspaceDeleting ? t("nav.workspace.deletingTitle") : t("nav.workspace.delete")} ?disabled=${this.workspaceDeleting} @click=${() => { this.menuOpen = false; void this.onDeleteWorkspace?.(workspace); }}>${t("nav.workspace.delete")}</button>
            ` : null}
          </div>
        ` : null}
      </div>
    `;
  }

  private get canDeleteWorkspace(): boolean {
    const workspace = this.workspace;
    return workspace !== undefined && workspace.isGitWorktree && !workspace.isMain && this.onDeleteWorkspace !== undefined;
  }

  private renderCopiedTick(key: string): TemplateResult | typeof nothing {
    return this.copiedKey === key ? html`<span class="copied-tick" aria-hidden="true">✓</span>` : nothing;
  }

  private async copyDetail(key: string, value: string): Promise<void> {
    const copied = await writeClipboardText(value);
    if (!copied) return;
    this.copiedKey = key;
    window.setTimeout(() => {
      if (this.copiedKey === key) this.copiedKey = undefined;
    }, 1200);
  }

  private toggleMenu(target: EventTarget | null): void {
    if (this.menuOpen) {
      this.menuOpen = false;
      return;
    }
    this.menuStyle = actionMenuPanelStyle(target, { constrainTo: "viewport" });
    this.menuOpen = true;
  }

  static override styles = css`
    :host { display: block; color: var(--pi-text); font: 12px system-ui, sans-serif; }
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; padding: 5px 12px; border-bottom: 1px solid var(--pi-border-muted); background: var(--pi-bg); }
    .breadcrumb { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 5px; overflow: hidden; }
    .crumb { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pi-muted); }
    button.crumb { border: 0; background: transparent; padding: 3px 5px; font: inherit; cursor: pointer; }
    button.crumb:hover, button.crumb:focus-visible { color: var(--pi-text); background: var(--pi-surface-hover); border-radius: 5px; }
    .crumb-separator { flex: 0 0 auto; color: var(--pi-dim); }
    .workspace-crumb { display: inline-flex; align-items: center; gap: 6px; }
    .worktree-tag, .deleting-tag { flex: 0 0 auto; border: 1px solid var(--pi-border-muted); border-radius: 999px; padding: 0 6px; font-size: 10px; line-height: 16px; color: var(--pi-muted); }
    .deleting-tag { border-color: var(--pi-warning-border); color: var(--pi-warning); }
    .actions { flex: 0 0 auto; position: relative; }
    .context-menu-toggle { display: inline-grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--pi-muted); cursor: pointer; }
    .context-menu-toggle:hover, .context-menu-toggle:focus-visible { color: var(--pi-text); background: var(--pi-surface-hover); }
    .action-menu-panel { position: fixed; z-index: 50; box-sizing: border-box; min-width: min(160px, calc(100vw - 16px)); overflow: auto; padding: 4px; border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); box-shadow: 0 8px 24px var(--pi-shadow); }
    .action-menu-panel button { display: block; width: 100%; text-align: left; white-space: normal; overflow-wrap: anywhere; border: 0; background: transparent; color: var(--pi-text); padding: 7px 9px; font-size: 13px; cursor: pointer; }
    .action-menu-panel button:hover { background: var(--pi-selection-bg); }
    .action-menu-panel button.danger { color: var(--pi-danger); }
    .copied-tick { margin-left: 6px; color: var(--pi-success); }
  `;
}

function workspaceLabel(workspace: Workspace): string {
  return workspace.branch ?? workspace.label;
}
