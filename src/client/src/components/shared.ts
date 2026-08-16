import { css, svg, type TemplateResult } from "lit";
import type {
	AskUserOutcome,
	ExtensionDialogAnswer,
	ExtensionDialogCloseReason,
	PendingExtensionDialog,
} from "../../../shared/apiTypes";
import type { SessionWarningSeverity } from "../api";

export function renderSessionWarningIcon(
	severity: SessionWarningSeverity,
	className: string,
): TemplateResult {
	if (severity === "error") {
		return svg`
      <svg class=${className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="m15 9-6 6"></path>
        <path d="m9 9 6 6"></path>
      </svg>
    `;
	}
	if (severity === "info") {
		return svg`
      <svg class=${className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 11v5"></path>
        <path d="M12 8h.01"></path>
      </svg>
    `;
	}
	return svg`
    <svg class=${className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10.3 3.7 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"></path>
      <path d="M12 9v4"></path>
      <path d="M12 17h.01"></path>
    </svg>
  `;
}

/** The display name shown beside an avatar for a top-level message. */
export function messageDisplayName(role: ChatLine["role"]): string {
  if (role === "user") return "You";
  if (role === "assistant") return "Pi";
  return role;
}

/** Inline avatar mark for a top-level chat message. The assistant uses the Pi brand bar; the user a person glyph. */
export function renderMessageAvatar(role: ChatLine["role"]): TemplateResult {
  if (role === "user") {
    return svg`
      <svg class="avatar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="8" r="4"></circle>
        <path d="M4 20a8 8 0 0 1 16 0"></path>
      </svg>
    `;
  }
  return svg`
    <svg class="avatar-icon avatar-icon-brand" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="10.5" width="16" height="3" rx="1.5"></rect>
    </svg>
  `;
}

export interface ToolPreview {
	diff?: string;
	firstChangedLine?: number;
	error?: string;
}

export interface ToolExecutionPart {
	type: "toolExecution";
	toolCallId?: string;
	toolName: string;
	summary: string;
	args?: unknown;
	status: "pending" | "running" | "success" | "error";
	resultText?: string;
	content?: unknown;
	details?: unknown;
	preview?: ToolPreview;
}

export type ChatPart =
	| { type: "text"; text: string }
	| { type: "image"; mimeType: string; data: string }
	| { type: "thinking"; text: string }
	| { type: "skillInvocation"; name: string; location: string; content: string }
	| { type: "skillRead"; name: string; path: string; toolCallId?: string }
	| { type: "askUserRecord"; outcome: AskUserOutcome }
	| {
			type: "extensionDialogRecord";
			dialog: PendingExtensionDialog;
			reason: ExtensionDialogCloseReason;
			answer?: ExtensionDialogAnswer;
	  }
	| {
			type: "toolCall";
			toolCallId?: string;
			toolName: string;
			summary: string;
			args?: unknown;
	  }
	| ToolExecutionPart
	| {
			type: "toolResult";
			toolCallId?: string;
			toolName: string;
			text: string;
			isError: boolean;
			content?: unknown;
			details?: unknown;
	  }
	| { type: "empty" };

export interface ChatLine {
	role: "user" | "assistant" | "tool" | "system" | "bash" | "skill";
	parts: ChatPart[];
	source?: "compaction" | "branch_summary";
	meta?: {
		timestamp?: string;
		model?: { provider?: string; id?: string; responseId?: string };
		/** Thinking level the assistant message was generated with, when known. */
		thinkingLevel?: string;
	};
}

export interface CompletionItem {
	kind: "command" | "file" | "model";
	replaceFrom: number;
	replaceTo: number;
	insertText: string;
	detail: string;
	description?: string;
	cursorOffset?: number;
}

/**
 * Flat sidebar rows for components that render `.action-row` lists after
 * `listStyles`: single-line flex rows with no per-row border or card surface,
 * hover tint, selected tint, and the row menu revealed only on
 * hover/focus/selection as an overlay instead of occupying a bordered column.
 * Append AFTER listStyles so these rules win by cascade order.
 */
export const flatListRowStyles = css`
  .action-row { position: relative; display: block; margin: 1px 0; border-radius: 6px; }
  .action-main { display: flex; align-items: center; gap: 7px; min-height: 26px; border: 0; border-radius: 6px; background: transparent; padding: 3px 26px 3px calc(6px + var(--depth, 0) * 14px); }
  .action-name { flex: 1 1 auto; min-width: 0; display: block; max-height: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; -webkit-line-clamp: unset; }
  .action-main > small { flex: 0 1 auto; display: inline; min-width: 0; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-left: auto; }
  .action-activity { position: static; flex: 0 0 auto; top: auto; right: auto; }
  .rename-input { width: 100%; }
  .action-row:not(.selected):hover .action-main { background: var(--pi-surface-hover); }
  .action-row.selected .action-main { background: var(--pi-selection-bg); color: var(--pi-text-bright); }
  .action-menu { position: absolute; top: 4px; right: 4px; align-self: auto; }
  .action-menu-toggle { width: 22px; height: 22px; min-width: 22px; border: 0; border-radius: 5px; background: transparent; color: var(--pi-muted); opacity: 0; }
  .action-menu-toggle:hover, .action-menu-toggle:focus-visible { color: var(--pi-text); background: var(--pi-surface-hover); opacity: 1; }
  .action-row:hover .action-menu-toggle, .action-row:focus-within .action-menu-toggle, .action-row.selected .action-menu-toggle { opacity: 1; }
`;

export const appStyles = css`
  /* Mobile browsers already subtract browser controls from 100dvh; reserve bottom safe area only in standalone PWA modes. */
  :host { --pi-app-safe-area-bottom: 0px; position: fixed; top: 0; right: 0; left: 0; display: block; height: 100dvh; box-sizing: border-box; overflow: hidden; padding: env(safe-area-inset-top) env(safe-area-inset-right) var(--pi-app-safe-area-bottom) env(safe-area-inset-left); color: var(--pi-text); background: var(--pi-bg); font: 14px system-ui, sans-serif; }
  :host([pwa-display-mode]) { --pi-app-safe-area-bottom: env(safe-area-inset-bottom); }
  @media (display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui) {
    :host { --pi-app-safe-area-bottom: env(safe-area-inset-bottom); }
  }
  .shell { --navigation-panel-size: 340px; --workspace-panel-size: minmax(360px, 42vw); --navigation-panel-width: var(--navigation-panel-size); --workspace-panel-width: var(--workspace-panel-size); display: grid; grid-template-columns: var(--navigation-panel-width) 1px minmax(320px, 1fr) 1px var(--workspace-panel-width); height: 100%; min-height: 0; }
  aside { grid-column: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
  aside app-navigation-panel { flex: 1 1 auto; min-height: 0; }
  header { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px; border-bottom: 1px solid var(--pi-border); }
  .header-actions { display: flex; align-items: center; gap: 8px; }
  project-list, workspace-list { flex: 0 0 auto; max-height: 26%; min-height: 0; overflow: hidden; border-bottom: 1px solid var(--pi-border-muted); }
  session-list { flex: 1 1 auto; min-height: 0; overflow: hidden; }
  main { grid-column: 3; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .context-bar { position: relative; flex: 0 0 auto; min-width: 0; display: none; align-items: center; gap: 0; padding: 6px 0; border-bottom: 1px solid var(--pi-border-muted); background: var(--pi-bg); }
  .context-bar::before, .context-bar::after { content: ""; position: absolute; top: 0; bottom: 0; z-index: 2; width: 20px; opacity: 0; pointer-events: none; transition: opacity .15s ease; }
  .context-bar::before { left: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--pi-shadow-strong) 55%, transparent) 0%, transparent 100%); }
  .context-bar::after { right: 0; background: linear-gradient(270deg, color-mix(in srgb, var(--pi-shadow-strong) 55%, transparent) 0%, transparent 100%); }
  .context-bar.can-scroll-left::before, .context-bar.can-scroll-right::after { opacity: 1; }
  .context-bar-label { display: none; }
  .context-items { flex: 1 1 auto; min-width: 0; display: flex; align-items: stretch; gap: 5px; margin: 0; padding: 0 8px; list-style: none; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scroll-padding-inline: 8px; scrollbar-width: thin; }
  .context-bar.has-context-actions .context-items { padding-right: 52px; scroll-padding-inline: 8px 52px; }
  .context-item { flex: 0 0 auto; min-width: 0; display: flex; }
  .context-actions { position: absolute; top: 6px; right: 0; bottom: 6px; z-index: 3; display: flex; align-items: center; padding: 0 8px 0 0; pointer-events: none; }
  .context-actions::after { content: ""; position: absolute; top: 0; right: 0; bottom: 0; z-index: 0; width: 26px; background: var(--pi-bg); pointer-events: none; }
  .context-chip { flex: 0 0 auto; min-width: 0; display: inline-flex; align-items: baseline; gap: 5px; border: 1px solid var(--pi-border-muted); border-radius: 999px; background: var(--pi-surface); color: var(--pi-text); padding: 4px 8px; font: inherit; text-align: left; }
  .context-chip:hover { background: var(--pi-surface-hover); }
  .context-chip:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 2px; }
  .context-chip.empty { border-style: dashed; color: var(--pi-muted); }
  .context-kind { display: none; }
  .context-value { min-width: 0; overflow: visible; text-overflow: clip; white-space: nowrap; }
  app-mobile-main-tabs { display: none; }
  .mobile-tabs-frame { position: relative; display: none; flex: 0 0 auto; min-width: 0; border-bottom: 1px solid var(--pi-border); background: var(--pi-bg); }
  .mobile-tabs-frame::before, .mobile-tabs-frame::after { content: ""; position: absolute; top: 0; bottom: 0; z-index: 2; width: 20px; opacity: 0; pointer-events: none; transition: opacity .15s ease; }
  .mobile-tabs-frame::before { left: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--pi-shadow-strong) 55%, transparent) 0%, transparent 100%); }
  .mobile-tabs-frame::after { right: 0; background: linear-gradient(270deg, color-mix(in srgb, var(--pi-shadow-strong) 55%, transparent) 0%, transparent 100%); }
  .mobile-tabs-frame.can-scroll-left::before, .mobile-tabs-frame.can-scroll-right::after { opacity: 1; }
  .mobile-tabs { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 8px; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scrollbar-width: thin; }
  .mobile-tabs button { flex: 0 0 auto; white-space: nowrap; }
  .mobile-navigation-tab, .mobile-navigation-panel { display: none; }
  .mobile-tabs button.selected { border-color: var(--pi-accent); background: var(--pi-selection-bg); }
  .tab-badge { display: inline-block; min-width: 14px; margin-left: 4px; border: 1px solid var(--pi-success-border); border-radius: 999px; background: var(--pi-success-surface); color: var(--pi-success); padding: 0 5px; font-size: 11px; line-height: 16px; text-align: center; }
  .navigation-panel-edge, .workspace-panel-edge { min-width: 0; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: visible; background: var(--pi-border-muted); z-index: 2; }
  .navigation-panel-edge { grid-column: 2; }
  .workspace-panel-edge { grid-column: 4; }
  .navigation-panel-edge-button, .workspace-panel-edge-button { position: relative; z-index: 1; box-sizing: border-box; display: grid; place-items: center; width: 18px; height: 48px; padding: 0; border: 1px solid var(--pi-border-muted); border-radius: 999px; background: var(--pi-bg); color: var(--pi-muted); opacity: .75; cursor: pointer; }
  .navigation-panel-edge-button:hover, .navigation-panel-edge-button:focus-visible, .workspace-panel-edge-button:hover, .workspace-panel-edge-button:focus-visible { color: var(--pi-text); background: var(--pi-surface-hover); opacity: 1; }
  .shell.navigation-panel-collapsed .navigation-panel-edge-button { transform: translateX(calc(50% - .5px)); }
  .shell.workspace-panel-collapsed .workspace-panel-edge-button { transform: translateX(calc(-50% + .5px)); }
  .navigation-panel-edge-icon, .workspace-panel-edge-icon { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
  workspace-panel { grid-column: 5; min-width: 0; min-height: 0; overflow: hidden; }
  @media (min-width: 1181px) {
    .shell.navigation-panel-collapsed { --navigation-panel-width: 0px; }
    .shell.navigation-panel-collapsed > aside { display: none; }
    .shell.workspace-panel-collapsed { --workspace-panel-width: 0px; }
    .shell.workspace-panel-collapsed > workspace-panel { display: none; }
  }
  @media (max-width: 1180px) {
    .shell { grid-template-columns: var(--navigation-panel-width) 1px minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    .shell.navigation-panel-collapsed { --navigation-panel-width: 0px; }
    .shell.navigation-panel-collapsed > aside { display: none; }
    aside { grid-row: 1 / 3; }
    .navigation-panel-edge { grid-row: 1 / 3; }
    main { grid-column: 3; grid-row: 1 / 3; }
    app-mobile-main-tabs { display: block; flex: 0 0 auto; min-width: 0; }
    .mobile-tabs-frame { display: flex; }
    .shell.workspace-view main { grid-row: 1; min-height: auto; }
    .shell.workspace-view > workspace-panel { grid-column: 3; grid-row: 2; display: flex; border-left: 0; }
    .shell:not(.workspace-view) > workspace-panel { display: none; }
    .workspace-panel-edge { display: none; }
    main.workspace-view chat-view, main.workspace-view prompt-editor, main.workspace-view status-bar,
    main.workspace-view .empty { display: none; }
    main.workspace-view { overflow: hidden; }
  }
  @media (max-width: 760px) {
    .shell { grid-template-columns: minmax(0, 1fr); }
    aside, .navigation-panel-edge { display: none; }
    main, .shell.workspace-view > workspace-panel { grid-column: 1; }
    .context-bar { display: flex; }
    .mobile-navigation-tab { display: block; }
    main.navigation-view chat-view, main.navigation-view prompt-editor, main.navigation-view status-bar,
    main.navigation-view .empty { display: none; }
    main.navigation-view .mobile-navigation-panel { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
    main.navigation-view .mobile-navigation-panel app-navigation-panel { flex: 1 1 auto; min-height: 0; }
    main.navigation-view .mobile-navigation-panel project-list,
    main.navigation-view .mobile-navigation-panel workspace-list,
    main.navigation-view .mobile-navigation-panel session-list { flex: 1 1 auto; max-height: none; min-height: 0; overflow: hidden; }
    main.navigation-view .mobile-navigation-panel project-list[collapsed],
    main.navigation-view .mobile-navigation-panel workspace-list[collapsed],
    main.navigation-view .mobile-navigation-panel session-list[collapsed] { flex: 0 0 auto; min-height: auto; overflow: hidden; }
  }
  status-bar { flex: 0 0 auto; }
  chat-view { flex: 1 1 auto; min-height: 0; overflow: hidden; }
  prompt-editor { flex: 0 0 auto; }
  button { border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); color: var(--pi-text); padding: 7px 9px; cursor: pointer; }
  .empty { margin: auto; color: var(--pi-muted); }
  .error { padding: 10px 16px; border-bottom: 1px solid var(--pi-border); color: var(--pi-danger); }
`;

export const workspacePanelStyles = css`
  :host { display: flex; flex-direction: column; min-height: 0; color: var(--pi-text); background: var(--pi-bg); font: 13px system-ui, sans-serif; container-type: inline-size; }
  header { flex: 0 0 auto; min-width: 0; border-bottom: 1px solid var(--pi-border); }
  .workspace-header-scroll-frame { position: relative; min-width: 0; background: var(--pi-bg); }
  .workspace-header-scroll-frame::before, .workspace-header-scroll-frame::after { content: ""; position: absolute; top: 0; bottom: 0; z-index: 2; width: 18px; opacity: 0; pointer-events: none; transition: opacity .15s ease; }
  .workspace-header-scroll-frame::before { left: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--pi-shadow-strong) 55%, transparent) 0%, transparent 100%); }
  .workspace-header-scroll-frame::after { right: 0; background: linear-gradient(270deg, color-mix(in srgb, var(--pi-shadow-strong) 55%, transparent) 0%, transparent 100%); }
  .workspace-header-scroll-frame.can-scroll-left::before, .workspace-header-scroll-frame.can-scroll-right::after { opacity: 1; }
  .workspace-header-strip { display: flex; justify-content: space-between; align-items: center; gap: 4px; min-width: 0; padding: 6px 8px; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scrollbar-width: thin; }
  .tabs { flex: 0 0 auto; display: flex; gap: 2px; align-items: center; }
  .tabs button { flex: 0 0 auto; white-space: nowrap; }
  .tabs button.icon-tab { min-width: 34px; }
  button { display: inline-flex; align-items: center; gap: 5px; border: 0; border-radius: 7px; background: transparent; color: var(--pi-muted); padding: 5px 9px; cursor: pointer; }
  button:hover { color: var(--pi-text); background: var(--pi-surface-hover); }
  button.selected { color: var(--pi-text-bright); background: var(--pi-selection-bg); }
  .tab-icon { flex: 0 0 auto; width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
  .tab-custom-icon { flex: 0 0 auto; width: 16px; height: 16px; display: inline-grid; place-items: center; color: currentColor; pointer-events: none; }
  .tab-custom-icon svg { width: 16px; height: 16px; pointer-events: none; }
  .tab-label { min-width: 0; }
  .tab-badge { flex: 0 0 auto; display: inline-block; min-width: 14px; border: 1px solid var(--pi-success-border); border-radius: 999px; background: var(--pi-success-surface); color: var(--pi-success); padding: 0 5px; font-size: 11px; line-height: 16px; text-align: center; }
  @container (max-width: 430px) {
    .tabs button.icon-tab { justify-content: center; padding-inline: 7px; }
    .tabs button.icon-tab .tab-label { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }
  }
  .panel-content { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: auto; }
  .empty-state { box-sizing: border-box; width: min(100%, 380px); margin: auto; padding: 24px; display: grid; gap: 8px; color: var(--pi-muted); text-align: center; }
  .empty-state h2 { margin: 0; color: var(--pi-text); font-size: 15px; line-height: 1.3; }
  .empty-state p { margin: 0; line-height: 1.45; }
  small, .muted { color: var(--pi-muted); }
  @media (max-width: 1180px) { header { display: none; } }
  .workspace-label { min-width: 0; display: inline-flex; align-items: baseline; gap: 5px; max-width: 100%; overflow: hidden; white-space: nowrap; }
  .workspace-label-base, .workspace-label-item, .workspace-label-render { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .workspace-label-item, .workspace-label-render, .workspace-label-separator { color: var(--pi-muted); }
  .workspace-label-link { color: var(--pi-accent); text-decoration: none; }
  .workspace-label-link:hover, .workspace-label-link:focus { text-decoration: underline; }
  .toolbar { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 8px; border-bottom: 1px solid var(--pi-border-muted); }
  .toolbar button { margin-left: auto; }
  .stale { border: 1px solid var(--pi-warning-border); border-radius: 999px; color: var(--pi-warning); padding: 1px 6px; font-size: 12px; }
  .split { flex: 1 1 auto; min-height: 0; display: grid; grid-template-rows: minmax(160px, 34%) minmax(0, 1fr); }
  .list { min-height: 0; overflow: auto; border-bottom: 1px solid var(--pi-border); padding: 6px; }
  .row { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 4px; width: 100%; border: 0; border-radius: 5px; background: transparent; text-align: left; padding: 4px 6px 4px calc(6px + var(--depth, 0) * 14px); }
  .row:hover, .row.selected { background: var(--pi-selection-bg); }
  .row span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .summary { margin: 4px 6px 8px; color: var(--pi-muted); }
  .viewer { min-height: 0; overflow: auto; display: flex; flex-direction: column; }
  .diffs { flex: 1 1 auto; min-height: 0; overflow: auto; display: grid; grid-template-rows: minmax(120px, 1fr) minmax(120px, 1fr); }
  .diffs.single { grid-template-rows: minmax(0, 1fr); }
  .diff-section { min-height: 0; display: flex; flex-direction: column; border-bottom: 1px solid var(--pi-border); }
  .diff-section:last-child { border-bottom: 0; }
  .viewer-header { position: sticky; top: 0; display: flex; justify-content: space-between; gap: 8px; padding: 8px; border-bottom: 1px solid var(--pi-border-muted); background: var(--pi-bg); }
  .viewer-header strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  code-viewer, unified-diff-viewer { flex: 1 1 auto; min-height: 0; }
  .image-preview { flex: 1 1 auto; min-height: 0; box-sizing: border-box; display: flex; align-items: center; justify-content: center; overflow: auto; padding: 16px; }
  .image-preview img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; border: 1px solid var(--pi-border-muted); border-radius: 8px; background-color: var(--pi-surface); background-image: linear-gradient(45deg, color-mix(in srgb, var(--pi-border-muted) 45%, transparent) 25%, transparent 25%), linear-gradient(-45deg, color-mix(in srgb, var(--pi-border-muted) 45%, transparent) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, color-mix(in srgb, var(--pi-border-muted) 45%, transparent) 75%), linear-gradient(-45deg, transparent 75%, color-mix(in srgb, var(--pi-border-muted) 45%, transparent) 75%); background-position: 0 0, 0 8px, 8px -8px, -8px 0; background-size: 16px 16px; box-shadow: 0 8px 24px var(--pi-shadow-soft); }
  pre { margin: 0; padding: 10px; overflow: auto; font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
  p { margin: 10px; }
`;

export const listStyles = css`
  :host { display: flex; flex-direction: column; min-height: 0; overflow: hidden; color: var(--pi-text); font: 14px system-ui, sans-serif; }
  :host([collapsed]) { flex: 0 0 auto; min-height: auto; overflow: hidden; }
  section { box-sizing: border-box; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; padding: 10px; }
  h2 { flex: 0 0 auto; display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 0 0 8px; color: var(--pi-muted); font-size: 12px; text-transform: uppercase; }
  .list-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
  button { border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); color: var(--pi-text); padding: 7px 9px; cursor: pointer; }
  section > button { display: block; width: 100%; text-align: left; margin: 6px 0; }
  .subheading { margin-top: 14px; }
  .section-toggle { display: flex; flex: 1 1 auto; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; width: 100%; border: 0; background: transparent; color: inherit; padding: 0; font: inherit; text-align: left; text-transform: inherit; }
  .section-toggle span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .section-title { display: grid; gap: 2px; min-width: 0; }
  .section-toggle .section-selected { display: block; color: var(--pi-text); font-size: 12px; font-weight: 600; line-height: 1.25; text-transform: none; }
  .section-toggle .section-count { flex: 0 0 auto; display: inline; color: var(--pi-muted); font-size: inherit; }
  .section-toggle small { display: inline; color: inherit; font-size: inherit; }
  .add-project { flex: 0 0 auto; display: inline-grid; place-items: center; width: 22px; height: 22px; padding: 0; border-radius: 6px; color: var(--pi-muted); line-height: 1; }
  .add-project:hover, .add-project:focus-visible { color: var(--pi-text); border-color: var(--pi-accent); background: var(--pi-surface-hover); }
  .action-row { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; margin: 6px 0; cursor: pointer; }
  .action-row:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 2px; border-radius: 8px; }
  .action-row.selected .action-main, .action-row.selected .action-menu-toggle { border-color: var(--pi-accent); background: var(--pi-selection-bg); }
  .action-row.archived .action-main { color: var(--pi-muted); }
  .action-main { position: relative; box-sizing: border-box; min-width: 0; width: 100%; border: 1px solid var(--pi-border); border-top-right-radius: 0; border-bottom-right-radius: 0; border-top-left-radius: 8px; border-bottom-left-radius: 8px; background: var(--pi-surface); color: var(--pi-text); padding: 7px 22px 7px calc(9px + var(--depth, 0) * 16px); text-align: left; }
  .action-name { display: -webkit-box; max-height: 2.5em; overflow: hidden; overflow-wrap: anywhere; line-height: 1.25; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .action-row:not(.selected):hover .action-main { background: var(--pi-surface-hover); }
  .workspace-row .action-main { border-radius: 8px 0 0 8px; }
  .workspace-primary { min-width: 0; display: flex; align-items: baseline; gap: 6px; }
  .workspace-primary-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .workspace-status { flex: 0 0 auto; color: var(--pi-warning); font-size: 12px; }
  .workspace-secondary { margin-top: 3px; }
  .workspace-menu-panel { width: max-content; min-width: min(120px, calc(100vw - 16px)); padding: 8px; }
  .workspace-menu-actions { margin: 0 0 8px; padding-bottom: 8px; border-bottom: 1px solid var(--pi-border-muted); }
  .workspace-menu-actions button.danger { color: var(--pi-danger); }
  .workspace-menu-actions button.danger:hover, .workspace-menu-actions button.danger:focus { background: color-mix(in srgb, var(--pi-danger) 14%, transparent); }
  .workspace-menu-details { display: grid; gap: 6px; margin: 0; }
  .workspace-detail-row { display: grid; grid-template-columns: minmax(58px, max-content) minmax(0, 1fr); gap: 8px; align-items: baseline; }
  .workspace-detail-row dt { color: var(--pi-muted); font-size: 12px; white-space: normal; }
  .workspace-detail-row dd { min-width: 0; margin: 0; overflow-wrap: anywhere; white-space: normal; }
  .action-menu-panel .detail-copy { box-sizing: border-box; display: inline-grid; place-items: center; width: 18px; height: 18px; margin-left: 6px; padding: 0; border: 1px solid var(--pi-border); border-radius: 5px; background: transparent; color: var(--pi-muted); font-size: 11px; line-height: 1; cursor: pointer; vertical-align: middle; }
  .action-menu-panel .detail-copy:hover, .action-menu-panel .detail-copy:focus { color: var(--pi-text); border-color: var(--pi-accent); background: var(--pi-surface-hover); }
  .tree-marker { color: var(--pi-dim); margin-right: 5px; }
  .badge { display: inline-block; margin-left: 5px; border: 1px solid var(--pi-border); border-radius: 999px; color: var(--pi-muted); padding: 0 5px; font-size: 11px; font-weight: 400; }
  .action-activity { position: absolute; top: 5px; right: 6px; z-index: 1; display: grid; place-items: center; width: 10px; height: 10px; }
  .action-activity .activity-indicator { margin: 0; vertical-align: 0; }
  .activity-indicator { flex: 0 0 auto; display: inline-block; width: 7px; height: 7px; margin-right: 6px; background: var(--pi-success); animation: pulse 1s ease-in-out infinite; vertical-align: 1px; }
  .activity-indicator.session { border-radius: 50%; background: var(--pi-success); }
  .activity-indicator.terminal { border-radius: 2px; background: var(--pi-accent); }
  /* Client-side sending (upload in flight); distinct from server activity, which propagates to workspace/machine rows. */
  .activity-indicator.sending { border-radius: 50%; background: var(--pi-warning); }
  /* Unread is a stable state, not ongoing work: keep it static and accent-colored. */
  .activity-indicator.unread { border-radius: 50%; background: var(--pi-accent); animation: none; box-shadow: 0 0 0 2px color-mix(in srgb, var(--pi-accent) 20%, transparent); }
  /* Unread + ongoing work: a static accent ring wraps the still-pulsing work dot. */
  .unread-ring { flex: 0 0 auto; box-sizing: border-box; display: inline-grid; place-items: center; width: 9px; height: 9px; margin-right: 6px; border: 1.5px solid var(--pi-accent); border-radius: 50%; vertical-align: 1px; }
  .unread-ring .activity-indicator { width: 5px; height: 5px; margin: 0; vertical-align: 0; }
  .action-activity .unread-ring { margin: 0; vertical-align: 0; }
  .action-menu { position: relative; align-self: stretch; }
  .action-menu-toggle { display: grid; place-items: center; height: 100%; min-width: 32px; padding: 0; color: var(--pi-muted); border-left: 0; border-top-left-radius: 0; border-bottom-left-radius: 0; }
  .action-menu-toggle:hover { color: var(--pi-text); background: var(--pi-surface-hover); }
  .action-menu-panel { position: fixed; z-index: 50; box-sizing: border-box; min-width: min(120px, calc(100vw - 16px)); overflow: auto; padding: 4px; border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); box-shadow: 0 8px 24px var(--pi-shadow); overflow-wrap: anywhere; }
  .action-menu-panel button { display: block; width: 100%; text-align: left; white-space: normal; overflow-wrap: anywhere; border: 0; background: transparent; color: var(--pi-text); }
  .action-menu-panel button:hover { background: var(--pi-selection-bg); }
  button.selected { border-color: var(--pi-accent); background: var(--pi-selection-bg); }
  button:disabled { opacity: .5; cursor: not-allowed; }
  small { display: block; color: var(--pi-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .workspace-label { min-width: 0; display: inline-flex; align-items: baseline; gap: 5px; max-width: 100%; overflow: hidden; white-space: nowrap; }
  .workspace-label-base, .workspace-label-item, .workspace-label-render { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .workspace-label-item, .workspace-label-render, .workspace-label-separator { color: var(--pi-muted); }
  .workspace-label-link { color: var(--pi-accent); text-decoration: none; }
  .workspace-label-link:hover, .workspace-label-link:focus { text-decoration: underline; }
  .workspace-detail-row .workspace-label { overflow: visible; white-space: normal; flex-wrap: wrap; }
  .workspace-detail-row .workspace-label-base, .workspace-detail-row .workspace-label-item, .workspace-detail-row .workspace-label-render { overflow: visible; text-overflow: clip; overflow-wrap: anywhere; white-space: normal; }
  @keyframes pulse { 0%, 100% { transform: scale(.75); opacity: .55; } 50% { transform: scale(1.2); opacity: 1; } }
  /* First-load placeholder shown before any list data has arrived; background refreshes never use it. */
  .skeleton-row { box-sizing: border-box; min-height: 38px; margin: 6px 0; border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); animation: skeleton-shimmer 1.4s ease-in-out infinite; }
  @keyframes skeleton-shimmer { 0%, 100% { opacity: .35; } 50% { opacity: .65; } }
`;

export const chatStyles = css`
  :host { position: relative; z-index: 0; display: flex; flex-direction: column; min-height: 0; overflow: hidden; color: var(--pi-text); font: 14px system-ui, sans-serif; }
  .chat-wrap { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
  .top-notices { box-sizing: border-box; flex: 0 0 auto; max-height: 40%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; border-bottom: 1px solid var(--pi-border); background: var(--pi-bg-overlay); }
  .session-warnings { flex: 0 1 auto; display: grid; gap: 8px; max-height: 50%; min-height: 0; overflow-y: auto; box-sizing: border-box; padding: 10px 16px; border-bottom: 1px solid var(--pi-border-muted); }
  .session-warnings:only-child { flex: 1 1 auto; max-height: 100%; border-bottom: 0; }
  .session-warnings-controls { display: flex; justify-content: flex-end; }
  .session-warnings-collapse { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--pi-border); border-radius: 6px; background: var(--pi-surface); color: var(--pi-muted); padding: 4px 7px; font: 12px system-ui, sans-serif; cursor: pointer; }
  .session-warnings-collapse:hover, .session-warnings-collapse:focus-visible { color: var(--pi-text-bright); border-color: var(--pi-accent); background: var(--pi-bg-overlay); }
  .session-warnings-collapse:focus-visible { outline: 1px solid var(--pi-border); outline-offset: 2px; }
  .session-warnings-collapse-icon { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
  .session-warning { position: relative; display: grid; gap: 4px; box-sizing: border-box; padding: 10px 34px 10px 12px; border: 1px solid var(--pi-warning-border); border-radius: 10px; background: var(--pi-warning-surface); color: var(--pi-text); }
  .session-warning.error { border-color: var(--pi-danger); background: color-mix(in srgb, var(--pi-danger) 12%, var(--pi-surface)); }
  .session-warning.info { border-color: var(--pi-accent-border); background: var(--pi-selection-bg); }
  .session-warning-head { display: flex; align-items: center; gap: 8px; min-height: 16px; }
  .session-warning-icon { flex: 0 0 auto; width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .session-warning-body { min-width: 0; display: grid; gap: 3px; }
  .session-warning-message { margin: 0; overflow-wrap: anywhere; }
  .session-warning-path { margin: 0; color: var(--pi-muted); font-size: 12px; font-family: var(--pi-mono, ui-monospace, monospace); overflow-wrap: anywhere; }
  .session-warning-source { color: var(--pi-muted); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .session-warning-dismiss { position: absolute; top: 6px; right: 6px; display: inline-grid; place-items: center; width: 22px; height: 22px; padding: 0; border: 1px solid var(--pi-border); border-radius: 6px; background: var(--pi-surface); color: var(--pi-muted); font: 15px/1 system-ui, sans-serif; cursor: pointer; }
  .session-warning-dismiss:hover, .session-warning-dismiss:focus-visible { color: var(--pi-text-bright); border-color: var(--pi-accent); background: var(--pi-bg-overlay); }
  .session-warning-dismiss:focus-visible { outline: 1px solid var(--pi-border); outline-offset: 2px; }
  .notification-icon { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
  .notification-close-icon { width: 16px; height: 16px; }
  .notification-toasts { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 30; display: flex; flex-direction: column; align-items: center; gap: 6px; width: max-content; max-width: min(92%, 560px); pointer-events: none; }
  .toast { position: relative; box-sizing: border-box; width: 100%; min-width: 0; padding: 8px 34px 8px 12px; border: 1px solid var(--pi-border); border-radius: 10px; background: var(--pi-bg-overlay); color: var(--pi-text); box-shadow: 0 8px 28px var(--pi-shadow); pointer-events: auto; overflow: hidden; animation: pi-toast-in 180ms ease-out; }
  .toast.error { border-color: var(--pi-danger); background: color-mix(in srgb, var(--pi-danger) 10%, var(--pi-bg-overlay)); }
  .toast.warning { border-color: var(--pi-warning-border); background: var(--pi-warning-surface); }
  .toast.info { border-color: var(--pi-accent-border); background: var(--pi-selection-bg); }
  .toast.warning { --pi-toast-progress: var(--pi-warning); }
  .toast.error { --pi-toast-progress: var(--pi-danger); }
  .toast.info { --pi-toast-progress: var(--pi-accent); }
  .toast::before { content: ""; position: absolute; inset: 0; z-index: 0; border-radius: inherit; background: var(--pi-toast-progress, var(--pi-accent)); opacity: .18; transform-origin: left center; pointer-events: none; }
  .toast.timed::before { animation: pi-toast-progress var(--pi-toast-duration, 5s) linear forwards; }
  .toast > * { position: relative; z-index: 1; }
  @keyframes pi-toast-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pi-toast-progress { from { transform: scaleX(1); } to { transform: scaleX(0); } }
  .toast-severity { display: block; margin-bottom: 2px; color: var(--pi-muted); font-size: 11px; font-weight: 600; letter-spacing: .02em; }
  .toast.warning .toast-severity { color: var(--pi-warning); }
  .toast.error .toast-severity { color: var(--pi-danger); }
  .toast-message { margin: 0; max-height: 7.5em; overflow-y: auto; overflow-wrap: anywhere; white-space: pre-wrap; text-align: start; unicode-bidi: plaintext; }
  .toast-dismiss { position: absolute; top: 4px; right: 4px; display: inline-grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--pi-muted); cursor: pointer; }
  .toast-dismiss:hover, .toast-dismiss:focus-visible { background: var(--pi-selection-bg); color: var(--pi-text-bright); }
  .toast-dismiss:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 1px; }
  .toast-dismiss:disabled { opacity: .5; cursor: default; }
  .toast-dismiss-all { align-self: center; border: 1px solid var(--pi-border); border-radius: 999px; background: var(--pi-surface); color: var(--pi-muted); padding: 3px 12px; font: 12px system-ui, sans-serif; cursor: pointer; pointer-events: auto; }
  .toast-dismiss-all:hover, .toast-dismiss-all:focus-visible { color: var(--pi-text-bright); border-color: var(--pi-accent); }
  .toast-dismiss-all:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 1px; }
  .visually-hidden { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0 0 0 0) !important; clip-path: inset(50%) !important; white-space: nowrap !important; border: 0 !important; }
  .notification-live span { display: block; }
  @media (pointer: coarse) {
    .toast-dismiss { width: 32px; height: 32px; }
  }
  .chat { height: 100%; min-height: 0; overflow: auto; overflow-anchor: none; padding: 16px 16px 64px; box-sizing: border-box; }
  .scroll-marker { display: block; height: 0; overflow: hidden; pointer-events: none; }
  .activity-dock { position: absolute; left: 16px; right: 16px; bottom: 12px; z-index: 20; display: flex; align-items: center; gap: 8px; min-width: 0; box-sizing: border-box; border: 1px solid var(--pi-border); border-radius: 999px; background: var(--pi-bg-overlay); color: var(--pi-muted); padding: 8px 12px; font-size: 13px; pointer-events: none; box-shadow: 0 8px 28px var(--pi-shadow); backdrop-filter: blur(6px); }
  .activity-dock.active { border-color: var(--pi-success-border); color: var(--pi-success); background: var(--pi-success-bg-overlay); }
  .activity-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: .45; flex: 0 0 auto; }
  .activity-dock.active .dot { animation: pulse 1s ease-in-out infinite; opacity: 1; }
  /* message layout: a 28px lead column (avatar or process rail) + content body */
  .msg { max-width: 100%; min-width: 0; box-sizing: border-box; display: grid; grid-template-columns: 28px 1fr; column-gap: 12px; align-items: start; margin: 0 0 18px; padding: 0; border: 0; background: transparent; overflow: visible; }
  .msg-body { min-width: 0; }
  .avatar { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--pi-bg); color: var(--pi-muted); }
  .msg.user { grid-template-columns: 1fr 28px; }
  .msg.user .avatar { grid-column: 2; background: color-mix(in srgb, var(--pi-accent) 16%, var(--pi-bg)); color: var(--pi-accent); }
  .msg.assistant .avatar, .msg.tool-image-output .avatar { background: color-mix(in srgb, var(--pi-success) 20%, var(--pi-bg)); color: var(--pi-success); }
  .msg.skill .avatar { background: color-mix(in srgb, var(--pi-purple) 16%, var(--pi-bg)); color: var(--pi-purple); }
  .avatar-icon { width: 16px; height: 16px; }
  .avatar-icon circle, .avatar-icon path { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .avatar-icon-brand rect { fill: currentColor; }
  .process-rail { display: flex; justify-content: center; width: 28px; align-self: stretch; }
  .process-rail::before { content: ""; width: 2px; background: var(--pi-border-muted); border-radius: 1px; }
  .msg.system .process-rail::before { background: color-mix(in srgb, var(--pi-danger) 55%, var(--pi-border-muted)); }
  .msg.skill .process-rail::before { background: color-mix(in srgb, var(--pi-purple-border) 55%, var(--pi-border-muted)); }
  .msg.user .msg-body { grid-column: 1; justify-self: end; max-width: 100%; box-sizing: border-box; border: 1px solid color-mix(in srgb, var(--pi-accent-border) 45%, transparent); border-radius: 12px; background: var(--pi-selection-bg); padding: 10px 14px; }
  .msg.assistant .msg-body, .msg.tool-image-output .msg-body { padding: 4px 0 0; }
  .msg.tool-execution-shell, .msg.ask-user-record-shell { color: var(--pi-text); }
  .msg.tool-execution-shell .msg-body, .msg.ask-user-record-shell .msg-body { padding: 0; }
  .msg.ask-user-record-shell ask-user-card { margin: 0 auto; }
  .msg.system { color: var(--pi-danger); }
  /* event groups sit in the body column (avatar width + gap) with a single left rail; live = success rail + pulse dot */
  .msg.event-group { display: block; margin-left: 40px; padding: 0; border: 0; border-left: 2px solid var(--pi-border-muted); border-radius: 0; background: transparent; color: var(--pi-muted); }
  .msg.event-group.live { border-left-color: var(--pi-success); }
  .msg.event-group > summary { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--pi-border-muted); background: var(--pi-bg); color: var(--pi-muted); }
  .msg.event-group.live > summary { border-bottom-color: var(--pi-success-border); color: var(--pi-success); }
  .msg.event-group.live > summary::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--pi-success); animation: pulse 1s ease-in-out infinite; flex: 0 0 auto; }
  .msg.event-group > summary .label { margin: 0; }
  .group-body { padding: 2px 10px 6px; }
  .chat-image { display: block; max-width: 100%; max-height: 320px; margin: 8px 0 0; border: 1px solid var(--pi-border-muted); border-radius: 8px; object-fit: contain; cursor: zoom-in; }
  .chat-image:focus-visible { outline: 2px solid var(--pi-accent, var(--pi-success-border)); outline-offset: 2px; }
  dialog.image-zoom { position: fixed; inset: 0; margin: auto; max-width: calc(96vw - env(safe-area-inset-left) - env(safe-area-inset-right)); max-height: calc(96vh - env(safe-area-inset-top) - env(safe-area-inset-bottom)); width: fit-content; height: fit-content; padding: 0; border: none; background: transparent; overflow: visible; }
  dialog.image-zoom[open] { display: flex; }
  dialog.image-zoom::backdrop { background: rgba(0, 0, 0, 0.8); }
  .image-zoom-full { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; border-radius: 8px; object-fit: contain; cursor: zoom-out; }
  .image-zoom-close { position: absolute; top: max(8px, env(safe-area-inset-top)); right: max(8px, env(safe-area-inset-right)); display: inline-grid; place-items: center; width: 28px; height: 28px; padding: 0; font: 16px/1 system-ui, sans-serif; color: var(--pi-muted); background: color-mix(in srgb, var(--pi-surface) 88%, transparent); border: 1px solid var(--pi-border); border-radius: 6px; cursor: pointer; }
  .image-zoom-close:hover, .image-zoom-close:focus-visible { color: var(--pi-text-bright); border-color: var(--pi-accent); }
  .image-zoom-close:focus-visible { outline: 1px solid var(--pi-border); outline-offset: 2px; }
  /* nested events are flat rows inside the group; the group rail carries the indentation */
  .group-msg { max-width: 100%; min-width: 0; box-sizing: border-box; padding: 8px 0; border-top: 1px solid var(--pi-border-muted); color: var(--pi-text); overflow: visible; }
  .group-msg:first-child { border-top: 0; }
  .group-msg.system { color: var(--pi-danger); }
  .history-boundary { position: relative; z-index: 5; display: grid; gap: 3px; justify-items: center; margin: 0 0 14px; color: var(--pi-muted); font-size: 12px; text-align: center; }
  .history-load-button { border: 1px solid var(--pi-border); border-radius: 999px; background: var(--pi-surface); color: var(--pi-text-secondary); padding: 5px 12px; font: 12px system-ui, sans-serif; cursor: pointer; }
  .history-load-button:hover, .history-load-button:focus { border-color: var(--pi-accent); color: var(--pi-text-bright); }
  .history-load-button:disabled { cursor: default; opacity: .55; }
  .queued-messages { max-width: 100%; min-width: 0; box-sizing: border-box; display: grid; gap: 8px; margin: 0 0 14px; padding: 12px; border: 1px solid var(--pi-warning-border); border-radius: 10px; background: var(--pi-warning-surface); color: var(--pi-text); overflow: hidden; }
  .queued-header { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .queued-heading { min-width: 0; flex: 1 1 180px; display: grid; gap: 2px; }
  .queued-heading strong { color: var(--pi-warning); }
  .queued-heading small { color: var(--pi-muted); }
  .queued-clear-button { flex: 0 0 auto; border: 1px solid var(--pi-warning-border); border-radius: 999px; background: var(--pi-surface); color: var(--pi-warning); padding: 5px 10px; font: 12px system-ui, sans-serif; white-space: nowrap; cursor: pointer; }
  .queued-clear-button:hover, .queued-clear-button:focus { border-color: var(--pi-warning); color: var(--pi-text-bright); }
  .queued-message { display: grid; gap: 4px; padding-top: 8px; border-top: 1px solid var(--pi-border); }
  .queued-message:first-of-type { padding-top: 0; border-top: 0; }
  .queued-kind { color: var(--pi-muted); font-size: 12px; text-transform: uppercase; }
  .queued-dialogs { margin: -8px 0 14px; padding: 0 4px; color: var(--pi-muted); font-size: 12px; text-align: center; }
  .session-activity { max-width: 100%; min-width: 0; box-sizing: border-box; display: grid; gap: 4px; margin: 0 0 14px; padding: 12px; border: 1px solid var(--pi-border); border-radius: 10px; background: var(--pi-surface); color: var(--pi-text); overflow: hidden; }
  .session-activity.compacting { border-color: var(--pi-purple-border); background: var(--pi-purple-surface); }
  .session-activity strong { color: var(--pi-purple); }
  .session-activity span, .session-activity small { color: var(--pi-muted); }
  .history-boundary small { color: var(--pi-dim); }
  /* message identity row (replaces the sticky header): name + hover-only meta + actions */
  .msg-identity { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; min-height: 22px; margin-bottom: 6px; }
  .msg-name { color: var(--pi-text-bright); font-size: 13px; font-weight: 600; }
  .msg.user .msg-name { color: var(--pi-accent); }
  .msg-identity-trailing { min-width: 0; flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: flex-end; gap: 8px; }
  .msg-actions { flex: 0 0 auto; display: inline-flex; gap: 6px; opacity: 0; transition: opacity .12s ease; }
  .msg-action { display: inline-grid; place-items: center; width: 24px; height: 24px; border: 1px solid var(--pi-border); border-radius: 6px; background: var(--pi-surface); color: var(--pi-muted); padding: 0; font: 14px system-ui, sans-serif; line-height: 1; cursor: pointer; }
  .msg-action:hover, .msg-action:focus { color: var(--pi-text); border-color: var(--pi-accent); }
  .msg:hover .msg-actions, .msg:focus-within .msg-actions, .group-msg:hover .msg-actions, .group-msg:focus-within .msg-actions { opacity: 1; }
  .label { color: var(--pi-muted); font-size: 12px; text-transform: uppercase; }
  .msg-meta { min-width: 0; opacity: 0; border: 0; background: transparent; color: var(--pi-dim); padding: 0; font: 11px system-ui, sans-serif; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: opacity .12s ease; cursor: pointer; user-select: text; -webkit-user-select: text; }
  .msg:hover .msg-meta, .msg:focus-within .msg-meta, .group-msg:hover .msg-meta, .group-msg:focus-within .msg-meta, .msg-meta:focus, .msg-meta.expanded { opacity: 1; }
  .msg-meta.expanded { flex: 1 1 auto; max-width: 100%; white-space: normal; overflow: visible; overflow-wrap: anywhere; text-overflow: clip; }
  .msg-meta:focus { outline: 1px solid var(--pi-border); outline-offset: 3px; border-radius: 4px; }
  @media (hover: none) {
    .msg-actions { opacity: 1; }
    .msg-meta { opacity: .75; max-width: 26px; }
    .msg-meta:not(.expanded) { display: inline-grid; width: 26px; height: 22px; place-items: center; font-size: 0; text-overflow: clip; }
    .msg-meta::before { content: "ⓘ"; font-size: 13px; }
    .msg-meta.expanded { opacity: 1; max-width: 100%; }
    .msg-meta.expanded::before { content: ""; }
  }
  formatted-text.part { display: block; }
  formatted-text.part, .queued-message formatted-text { text-align: start; unicode-bidi: plaintext; }
  .part { max-width: 100%; min-width: 0; box-sizing: border-box; overflow: visible; }
  .part + .part { margin-top: 10px; }
  /* canonical process block: left rail, one-line summary, collapsible detail */
  .process-block { box-sizing: border-box; padding: 2px 0 2px 14px; border-left: 2px solid var(--pi-border-muted); color: var(--pi-text-secondary); font-size: 13px; }
  .process-block > summary { display: flex; align-items: center; gap: 8px; min-width: 0; cursor: pointer; color: var(--pi-muted); list-style: none; }
  .process-block > summary::-webkit-details-marker { display: none; }
  .process-block .pb-icon { flex: 0 0 auto; color: var(--pi-muted); }
  .process-block .pb-name { flex: 0 0 auto; color: var(--pi-text); font-weight: 600; }
  .process-block .pb-summary { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pi-muted); font: 12px var(--pi-mono, ui-monospace, monospace); }
  .process-block .pb-status { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: var(--pi-muted); }
  .process-block .pb-status.success { background: var(--pi-success); }
  .process-block .pb-status.error { background: var(--pi-danger); }
  .process-block .pb-status.running { background: var(--pi-warning); animation: pulse 1s ease-in-out infinite; }
  .process-block .pb-body { margin-top: 6px; min-width: 0; }
  /* thinking: dashed rail, italic, lowest visual weight */
  .process-block.thinking { border-left-style: dashed; border-left-color: color-mix(in srgb, var(--pi-purple-border) 50%, var(--pi-border-muted)); }
  .process-block.thinking .pb-name { color: var(--pi-purple); }
  .process-block.thinking .pb-body { font-style: italic; color: var(--pi-muted); }
  /* skill accent */
  .process-block.skill .pb-name { color: var(--pi-purple); }
  /* inline tool-call line */
  .tool-line { display: flex; align-items: center; gap: 8px; padding: 2px 0 2px 14px; border-left: 2px solid var(--pi-border-muted); color: var(--pi-muted); font-size: 13px; }
  .tool-line .pb-name { color: var(--pi-text); font-weight: 600; }
  .tool-line .summary { color: var(--pi-muted); font: 12px var(--pi-mono, ui-monospace, monospace); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .part:is(details):not(.process-block) { border-top: 1px solid var(--pi-border); padding-top: 8px; }
  .part > formatted-text { display: block; max-width: 100%; min-width: 0; overflow: visible; }
  .skill-read { display: flex; align-items: center; gap: 8px; padding: 2px 0; color: var(--pi-text-secondary); font-size: 13px; }
  .skill-read .pb-icon { flex: 0 0 auto; color: var(--pi-purple); }
  .skill-read .pb-name { flex: 0 0 auto; color: var(--pi-purple); font-weight: 600; }
  .skill-read .pb-summary { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pi-muted); font: 12px var(--pi-mono, ui-monospace, monospace); }
  summary { cursor: pointer; color: var(--pi-muted); }
  pre { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; direction: ltr; text-align: left; unicode-bidi: isolate; }
  .shell-output { margin: 4px 0 0; color: var(--pi-text); font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; line-height: 1.45; direction: ltr; text-align: left; unicode-bidi: isolate; white-space: pre-wrap; overflow-wrap: anywhere; }
  @keyframes pulse { 0%, 100% { transform: scale(.75); opacity: .55; } 50% { transform: scale(1.2); opacity: 1; } }
`;

export const formattedTextStyles = css`
  :host { display: block; }
  .formatted { white-space: normal; overflow-wrap: anywhere; line-height: 1.45; text-align: start; unicode-bidi: plaintext; }
  p, ul, ol, pre, blockquote, .table-scroll, .code-block-wrapper { margin: 0 0 10px; }
  :is(p, ul, ol, pre, blockquote, .table-scroll, .code-block-wrapper):last-child { margin-bottom: 0; }
  ul, ol { padding-left: 22px; }
  li + li { margin-top: 3px; }
  code { border: 1px solid var(--pi-border); border-radius: 4px; background: var(--pi-bg); padding: 1px 4px; font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; direction: ltr; text-align: left; unicode-bidi: isolate; }
  .code-block-wrapper { position: relative; }
  .code-block-wrapper pre { margin: 0; padding-right: 40px; }
  pre { border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-bg); padding: 10px; overflow-x: auto; overflow-y: hidden; direction: ltr; text-align: left; unicode-bidi: isolate; }
  pre code { border: 0; padding: 0; background: transparent; }
  .code-copy-button { position: absolute; top: 6px; right: 6px; z-index: 1; display: inline-grid; place-items: center; width: 24px; height: 24px; border: 1px solid var(--pi-border); border-radius: 6px; background: var(--pi-surface); color: var(--pi-muted); padding: 0; font: 14px system-ui, sans-serif; line-height: 1; cursor: pointer; }
  .code-copy-button:hover, .code-copy-button:focus { color: var(--pi-text); border-color: var(--pi-accent); }
  blockquote { border-left: 3px solid var(--pi-border); padding-left: 10px; color: var(--pi-muted); }
  a { color: var(--pi-accent); }
  h1, h2, h3, h4 { margin: 14px 0 8px; line-height: 1.2; }
  h1:first-child, h2:first-child, h3:first-child, h4:first-child { margin-top: 0; }
  h1 { font-size: 20px; }
  h2 { font-size: 17px; }
  h3 { font-size: 15px; }
  h4 { font-size: 14px; }
  .table-scroll { max-width: 100%; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; }
  .table-scroll:focus-visible { outline: 1px solid var(--pi-accent); outline-offset: 2px; }
  table { border-collapse: collapse; width: max-content; min-width: 100%; max-width: none; }
  th, td { border: 1px solid var(--pi-border); padding: 4px 8px; max-width: 48ch; overflow-wrap: anywhere; }
  th { background: var(--pi-surface); }
`;

export const statusBarStyles = css`
  :host { display: block; color: var(--pi-muted); font: 12px system-ui, sans-serif; }
  .bar { display: flex; justify-content: flex-end; gap: 12px; align-items: center; min-width: 0; padding: 7px 12px; border-top: 1px solid var(--pi-border); background: var(--pi-bg); white-space: nowrap; overflow: hidden; }
  span { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .warning-toggle { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; margin-right: auto; border: 0; background: transparent; color: inherit; padding: 0; font: inherit; line-height: 1; white-space: nowrap; cursor: pointer; }
  .warning-toggle:focus-visible { outline: 1px solid currentColor; outline-offset: 2px; }
  .warning-toggle-icon { flex: 0 0 auto; width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .activity { display: inline-flex; align-items: center; gap: 6px; color: var(--pi-muted); }
  .activity.active { color: var(--pi-success); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; opacity: .45; flex: 0 0 auto; }
  .activity.active .dot { animation: pulse 1s ease-in-out infinite; opacity: 1; }
  .muted { color: var(--pi-dim); }
  @keyframes pulse { 0%, 100% { transform: scale(.75); opacity: .55; } 50% { transform: scale(1.2); opacity: 1; } }
`;

export const autocompleteStyles = css`
  :host { display: block; }
  .menu { position: absolute; left: 0; right: 0; bottom: calc(100% + 6px); z-index: 10; max-height: 260px; overflow: auto; border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); box-shadow: 0 10px 30px var(--pi-shadow); }
  button { display: grid; grid-template-columns: minmax(120px, 1fr) auto; gap: 4px 10px; width: 100%; border: 0; border-bottom: 1px solid var(--pi-border); border-radius: 0; background: transparent; color: var(--pi-text); padding: 8px 10px; text-align: left; cursor: pointer; }
  button:last-child { border-bottom: 0; }
  button.selected, button:hover { background: var(--pi-selection-bg); }
  span { color: var(--pi-muted); font-size: 12px; }
  small { grid-column: 1 / -1; color: var(--pi-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

export const commandPickerStyles = css`
  :host { position: fixed; inset: 0; z-index: 10; color: var(--pi-text); font: 14px system-ui, sans-serif; }
  .backdrop { display: grid; place-items: center; width: 100%; height: 100%; background: var(--pi-overlay); }
  section { width: min(720px, calc(100vw - 40px)); max-height: min(640px, calc(100vh - 40px)); display: flex; flex-direction: column; border: 1px solid var(--pi-border); border-radius: 12px; background: var(--pi-bg); box-shadow: 0 20px 60px var(--pi-shadow-strong); overflow: hidden; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 12px; border-bottom: 1px solid var(--pi-border); }
  .options { min-height: 0; overflow: auto; outline: none; }
  button { border: 0; background: transparent; color: var(--pi-text); cursor: pointer; }
  header button { font-size: 20px; color: var(--pi-muted); }
  input { margin: 10px 12px; border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-bg); color: var(--pi-text); font: var(--pi-control-font-size, 16px) var(--pi-control-font-family, system-ui, sans-serif); padding: 8px 10px; outline: none; }
  input:focus { border-color: var(--pi-accent); }
  .options button { display: block; width: 100%; padding: 10px 12px; border-bottom: 1px solid var(--pi-border-muted); text-align: left; }
  .options button.selected, .options button:hover { background: var(--pi-selection-bg); }
  small { display: block; margin-top: 4px; color: var(--pi-muted); }
  .empty { padding: 24px; color: var(--pi-muted); text-align: center; }
`;

export const actionPaletteStyles = css`
  :host { position: fixed; inset: 0; z-index: 20; color: var(--pi-text); font: 14px system-ui, sans-serif; }
  .backdrop { --palette-top: min(12dvh, 90px); --palette-bottom: max(20px, env(safe-area-inset-bottom)); display: grid; align-items: start; justify-items: center; width: 100%; height: 100dvh; background: var(--pi-overlay); padding: var(--palette-top) 20px var(--palette-bottom); box-sizing: border-box; overflow: hidden; }
  section { width: min(720px, 100%); max-height: min(640px, calc(100dvh - var(--palette-top) - var(--palette-bottom))); display: flex; flex-direction: column; border: 1px solid var(--pi-border); border-radius: 12px; background: var(--pi-bg); box-shadow: 0 20px 60px var(--pi-shadow-strong); overflow: hidden; }
  header { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 10px; border-bottom: 1px solid var(--pi-border); }
  input { min-width: 0; border: 0; outline: none; background: transparent; color: var(--pi-text); font: var(--pi-control-font-size, 16px) var(--pi-control-font-family, system-ui, sans-serif); padding: 8px; }
  input::placeholder { color: var(--pi-dim); }
  button { border: 0; background: transparent; color: var(--pi-text); cursor: pointer; }
  header button { color: var(--pi-muted); font-size: 22px; padding: 2px 8px; }
  .options { flex: 1 1 auto; min-height: 0; overflow: auto; }
  .options button { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 12px; width: 100%; padding: 10px 12px; border-bottom: 1px solid var(--pi-border-muted); text-align: left; }
  .options button.selected, .options button:hover:not(:disabled) { background: var(--pi-selection-bg); }
  .options button:disabled { cursor: not-allowed; opacity: .68; }
  .options button.disabled.selected { background: color-mix(in srgb, var(--pi-selection-bg) 55%, transparent); }
  .main { min-width: 0; }
  strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  small { display: block; color: var(--pi-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .disabled-reason { color: var(--pi-warning); }
  .group { grid-column: 1 / -1; font-size: 12px; }
  kbd { align-self: center; border: 1px solid var(--pi-border); border-radius: 6px; background: var(--pi-surface); color: var(--pi-muted); padding: 2px 6px; font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: nowrap; }
  .empty { padding: 24px; color: var(--pi-muted); text-align: center; }
`;

export const promptEditorStyles = css`
  :host { position: relative; z-index: 5; display: block; color: var(--pi-text); font: 14px system-ui, sans-serif; }
  footer { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; padding: 8px 12px 10px; }
  footer.shell-mode .composer-card { border-color: var(--pi-success); box-shadow: 0 0 0 1px var(--pi-success-ring); }
  /* One elevated card holds the editor and the controls row, Claude/Codex-style. */
  .composer-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0; border: 1px solid var(--pi-border); border-radius: 14px; background: var(--pi-surface); box-shadow: 0 2px 14px var(--pi-shadow-soft); overflow: visible; }
  footer.shell-mode .composer-card { background: var(--pi-success-bg); }
  .editor-wrap { position: relative; min-width: 0; padding: 0 4px; }
  /* Toolbar row above the editor: attachment and future composer tools. */
  .composer-tools { display: flex; align-items: center; gap: 4px; min-width: 0; padding: 6px 8px 0; }
  .composer-tools .tool-button { width: 28px; height: 28px; }
  .composer-tools .tool-button .prompt-action-icon { width: 16px; height: 16px; }
  .actions { display: flex; gap: 8px; align-items: center; justify-content: flex-end; flex-wrap: nowrap; white-space: nowrap; padding: 6px 8px 8px; }
  .compact-status { display: flex; min-width: 0; align-items: center; gap: 6px; color: var(--pi-muted); font-size: 12px; flex: 1 1 0; border-right: 1px solid var(--pi-border-muted); padding-right: 8px; }
  .compact-status > button { flex: 0 1 auto; min-width: 0; height: 30px; box-sizing: border-box; overflow: hidden; text-overflow: ellipsis; border: 0; background: transparent; color: var(--pi-muted); }
  .compact-status > button:hover, .compact-status > button:focus-visible { color: var(--pi-text); background: var(--pi-surface-hover); border-radius: 6px; }
  .select-model { max-width: min(42vw, 320px); }
  .plan-mode-toggle { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 4px 8px; font-size: 12px; line-height: 1; white-space: nowrap; }
  .plan-mode-toggle .prompt-plan-icon { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .plan-mode-toggle.active { color: var(--pi-accent, var(--pi-text)); border-color: var(--pi-accent, var(--pi-border)); background: var(--pi-selection-bg, var(--pi-surface)); }
  .icon-button { flex: 0 0 auto; display: inline-grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; background: transparent; }
  .icon-button .prompt-action-icon, .icon-button .prompt-thinking-gauge { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
  .icon-button .prompt-action-icon-filled { fill: currentColor; stroke: none; }
  .send-button:not(:disabled) { color: var(--pi-accent, var(--pi-text)); }
  .stop-button:not(:disabled) { color: var(--pi-danger); }
  .select-thinking .prompt-thinking-gauge .gauge-bar { fill: currentColor; stroke: none; opacity: .28; }
  .select-thinking .prompt-thinking-gauge .gauge-bar-active { opacity: 1; }
  .editor-attach { position: absolute; right: 8px; bottom: 8px; z-index: 2; width: 30px; height: 30px; }
  .editor-attach .prompt-action-icon { width: 16px; height: 16px; }  textarea, .markdown-editor .cm-editor { box-sizing: border-box; width: 100%; min-height: 54px; max-height: 220px; resize: none; overflow: hidden; border-radius: 10px; border: 1px solid transparent; background: transparent; color: var(--pi-text); font: var(--pi-control-font-size, 16px)/1.4 var(--pi-control-font-family, system-ui, sans-serif); }
  textarea { overflow-y: auto; padding: 8px; }
  .markdown-editor .cm-scroller { max-height: 220px; overflow-y: auto; font-family: var(--pi-control-font-family, system-ui, sans-serif); line-height: 1.4; }
  .markdown-editor .cm-content { min-height: 38px; padding: 8px 10px; caret-color: var(--pi-text); text-align: start; unicode-bidi: plaintext; }
  .markdown-editor .cm-line { padding: 0; unicode-bidi: plaintext; }
  .markdown-editor .cm-placeholder { color: var(--pi-dim); }
  .markdown-editor .cm-focused { outline: none; }
  .shell-mode textarea, .shell-mode .markdown-editor .cm-editor { border-color: var(--pi-success); }
  .mode-hint { position: absolute; right: 12px; bottom: 8px; max-width: calc(100% - 54px); border: 1px solid var(--pi-success-border); border-radius: 999px; background: var(--pi-success-surface); color: var(--pi-success); padding: 2px 8px; font-size: 12px; pointer-events: none; }
  .attachments { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; padding: 8px 8px 0; }
  .attachment-chip { position: relative; width: 56px; height: 56px; border: 1px solid var(--pi-border); border-radius: 8px; overflow: hidden; background: var(--pi-bg); }
  .attachment-chip img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .attachment-chip-file { display: grid; place-items: center; }
  .attachment-file-preview { display: grid; place-items: center; width: 34px; height: 26px; border: 1px solid var(--pi-border-muted); border-radius: 4px; background: var(--pi-surface); color: var(--pi-muted); font: 700 10px/1 system-ui, sans-serif; letter-spacing: .03em; }
  .attachment-file-name { position: absolute; right: 4px; bottom: 3px; left: 4px; overflow: hidden; color: var(--pi-muted); font-size: 10px; line-height: 1.2; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
  .attachment-remove { position: absolute; top: 1px; right: 1px; width: 18px; height: 18px; padding: 0; line-height: 16px; border-radius: 50%; border: 1px solid var(--pi-border); background: var(--pi-surface); color: var(--pi-text); font-size: 13px; cursor: pointer; }
  .attachment-delivery select { border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); color: var(--pi-text); padding: 5px 7px; font: var(--pi-control-font-size, 16px) var(--pi-control-font-family, system-ui, sans-serif); }
  .attachment-error { flex-basis: 100%; color: var(--pi-danger); font-size: 12px; }
  button { border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); color: var(--pi-text); padding: 7px 9px; cursor: pointer; }
  button:disabled, textarea:disabled, .markdown-editor-disabled .cm-editor { opacity: .5; cursor: not-allowed; }
  @media (max-width: 640px) {
    footer { gap: 8px; padding: 8px; }
    .actions { gap: 6px; }
    .compact-status { flex: 1 1 220px; gap: 4px; }
    .compact-status > button { height: 34px; }
    .select-model { max-width: min(58vw, 260px); }
    button { padding: 6px 8px; }
  }
  @media (max-width: 430px) {
    .compact-status { flex-basis: 170px; font-size: 11px; }
    .select-model { max-width: 48vw; }
    button { padding: 5px 7px; }
    .icon-button { width: 34px; height: 34px; }
  }
`;
