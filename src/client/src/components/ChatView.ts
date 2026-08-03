import { LitElement, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { ChatDisclosureController } from "../chatDisclosure";
import {
	groupChatMessages,
	summarizeChatGroup,
	type ChatGroup,
} from "../chatGroups";
import { writeClipboardText } from "../clipboard";
import {
	capturePrependScrollAnchor,
	PREPEND_RESTORE_SETTLE_FRAMES,
	restorePrependScrollAnchor,
	type PrependScrollAnchor,
} from "../chatScrollAnchoring";
import { shouldRequestEarlierMessages } from "../chatHistoryLoading";
import {
	ChatScrollController,
	distanceFromScrollBottom,
	findFirstVisibleArticle,
	isNearScrollBottom,
	type ChatAnchorScrollPosition,
	type ChatScrollRestoreResult,
} from "../chatScrollPosition";
import type {
	AskUserSubmission,
	PendingAskUser,
	PendingExtensionDialog,
	QueuedSessionMessage,
	SessionActivity,
	SessionStatus,
	SessionWarningSeverity,
} from "../api";
import type { SessionNotificationSeverity } from "../../../shared/apiTypes";
import {
	notificationAnnouncementLabel,
	notificationDismissLabel,
	notificationSeverityLabel,
	notificationTargetKey,
	type SelectedSessionNotificationView,
	type SessionNotificationTarget,
} from "../sessionNotifications";
import type { ChatLine, ChatPart } from "./shared";
import { chatStyles, messageDisplayName, renderMessageAvatar, renderSessionWarningIcon } from "./shared";
import "./AskUserCard";
import "./ExtensionDialogCard";
import type {
	ExtensionDialogAnswerCallback,
	ExtensionDialogCancelCallback,
} from "./ExtensionDialogCard";
import "./ConversationMeter";
import "./FormattedText";
import "./ToolExecutionView";

const messageTimestampFormatter = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeStyle: "medium",
});

function renderNotificationCloseIcon() {
	return html`
    <svg class="notification-icon notification-close-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12"></path>
      <path d="M18 6 6 18"></path>
    </svg>
  `;
}

function isSessionNotificationTarget(
	value: unknown,
): value is SessionNotificationTarget {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof Reflect.get(value, "machineId") === "string" &&
		typeof Reflect.get(value, "cwd") === "string" &&
		typeof Reflect.get(value, "sessionId") === "string"
	);
}

function clampPercent(value: number): number {
	return clampNumber(value, 0, 100);
}

function clampNumber(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, value));
}

interface ActiveToast {
	key: string;
	notificationId: string;
	severity: SessionNotificationSeverity;
	message: string;
}

/** Auto-dismiss latency for non-error toasts. Error toasts stay until dismissed. */
const AUTO_DISMISS_TOAST_MS = 5000;

export interface QueuedMessageSection {
	source: "client" | "server";
	heading: string;
	detail: string;
	messages: QueuedSessionMessage[];
}

export function chatQueuedMessageSections(
	clientQueued: QueuedSessionMessage[],
	serverQueued: QueuedSessionMessage[],
): QueuedMessageSection[] {
	return [
		clientQueued.length === 0
			? undefined
			: {
					source: "client",
					heading: "Queued until session starts",
					detail: "Will send once the backend session is ready",
					messages: clientQueued,
				},
		serverQueued.length === 0
			? undefined
			: {
					source: "server",
					heading: "Queued messages",
					detail: `${String(serverQueued.length)} pending`,
					messages: serverQueued,
				},
	].filter((section): section is QueuedMessageSection => section !== undefined);
}

export type ChatImagePart = Extract<ChatPart, { type: "image" }>;

/** Derive the `<img>` source URL and alt text for a rendered image part. */
export function chatImagePartSource(part: ChatImagePart): {
	src: string;
	alt: string;
} {
	return {
		src: `data:${part.mimeType};base64,${part.data}`,
		alt: "attached image",
	};
}

/** The message-header label used when a tool message renders as an image output. */
export function chatToolOutputLabel(toolName?: string): string {
	return toolName === undefined || toolName === ""
		? "tool output"
		: `${toolName} output`;
}

/** The stable scroll-anchor/render key for a top-level message at `index`. */
export function chatMessageAnchorKey(index: number): string {
	return `m:${String(index)}`;
}

/** The stable scroll-anchor/render key for a collapsed event group starting at `startIndex`. */
export function chatGroupAnchorKey(startIndex: number): string {
	return `g:${String(startIndex)}`;
}

/** The stable scroll-anchor key for an event inside a group at `index`. */
export function chatEventAnchorKey(index: number): string {
	return `e:${String(index)}`;
}

/** The stable scroll-marker id emitted before an event group ending at `endIndex`. */
export function chatGroupScrollMarkerId(endIndex: number): string {
	return `g:${String(endIndex)}`;
}

/** The CSS class list for an event-group `<details>`, distinguishing the live tail. */
export function chatMessageGroupClassName(defaultOpen: boolean): string {
	return defaultOpen ? "msg event-group live" : "msg event-group";
}

/** The disclosure summary label for an event group, distinguishing the live tail. */
export function chatMessageGroupLabel(defaultOpen: boolean): string {
	return defaultOpen ? "live events" : "events";
}

/** Whether a queued-message section shows the server clear-queue action. */
export function chatQueuedSectionShowsClearAction(
	section: QueuedMessageSection,
	canClearServerQueue: boolean,
	hasClearHandler: boolean,
): boolean {
	return section.source === "server" && canClearServerQueue && hasClearHandler;
}

/** A rendered session-warning row derived from live status warnings. */
export interface ChatSessionWarningRow {
	severity: SessionWarningSeverity;
	severityClass: string;
	message: string;
	source?: string;
	path?: string;
	dismissId?: string;
}

/** Derive one severity-tagged warning row per live status warning, in order. */
export function chatSessionWarningRows(
	status: SessionStatus | undefined,
): ChatSessionWarningRow[] {
	return (status?.warnings ?? []).map((warning) => ({
		severity: warning.severity,
		severityClass: `session-warning ${warning.severity}`,
		message: warning.message,
		...(warning.source === undefined ? {} : { source: warning.source }),
		...(warning.path === undefined ? {} : { path: warning.path }),
		...(warning.dismiss === undefined ? {} : { dismissId: warning.dismiss.id }),
	}));
}

export function chatMessageMetadataLabel(message: ChatLine): string {
	const timestamp = message.meta?.timestamp;
	const time =
		timestamp === undefined ? undefined : formatMessageTimestamp(timestamp);
	const model = chatMessageModelLabel(message);
	const parts = [time, model, message.meta?.thinkingLevel].filter(
		(part): part is string => part !== undefined && part !== "",
	);
	return parts.length === 0
		? "No Pi message metadata available"
		: parts.join(" · ");
}

function formatMessageTimestamp(timestamp: string): string | undefined {
	const date = new Date(timestamp);
	if (!Number.isFinite(date.getTime())) return undefined;
	return messageTimestampFormatter.format(date);
}

function chatMessageModelLabel(message: ChatLine): string | undefined {
	const model = message.meta?.model;
	if (model === undefined) return undefined;
	const id = model.responseId ?? model.id;
	if (id === undefined || id === "") return model.provider;
	return model.provider !== undefined && model.provider !== ""
		? `${model.provider}/${id}`
		: id;
}

@customElement("chat-view")
export class ChatView extends LitElement {
	@property({ attribute: false }) messages: ChatLine[] = [];
	@property() sessionId = "";
	@property({ type: Number }) messageStart = 0;
	@property({ type: Number }) messageEnd = 0;
	@property({ type: Number }) messageTotal = 0;
	@property({ type: Boolean }) hasMore = false;
	@property({ type: Boolean }) loadingMore = false;
	@property({ type: Boolean }) isSendingPrompt = false;
	@property({ type: Boolean }) isCompacting = false;
	@property({ type: Number }) pendingMessageCount = 0;
	@property({ attribute: false }) clientQueuedMessages: QueuedSessionMessage[] =
		[];
	@property({ attribute: false }) status?: SessionStatus;
	@property({ attribute: false }) activity?: SessionActivity;
	@property({ attribute: false }) pendingAsk?: PendingAskUser;
	@property({ attribute: false }) askDraftSessionId = "";
	@property({ attribute: false }) onSubmitAsk?: (
		askId: string,
		submission: AskUserSubmission,
	) => void | Promise<void>;
	@property({ attribute: false }) pendingDialogs: PendingExtensionDialog[] = [];
	@property({ attribute: false })
	onAnswerDialog?: ExtensionDialogAnswerCallback;
	@property({ attribute: false })
	onCancelDialog?: ExtensionDialogCancelCallback;
	@property({ attribute: false })
	notificationInbox?: SelectedSessionNotificationView;
	@property({ type: Boolean }) canClearServerQueue = false;
	@property({ attribute: false }) onClearServerQueue?: () => void;
	@property({ attribute: false }) onDismissWarning?: (
		dismissId: string,
	) => void;
	@property({ attribute: false }) onDismissNotification?: (
		notificationId: string,
	) => void;
	@property({ attribute: false }) onDismissAllNotifications?: () => void;
	@property({ type: Boolean }) warningsVisible = true;
	@property({ attribute: false }) onToggleWarnings?: () => void;
	@property({ attribute: false }) onLoadMore?: () => void;
	@query(".chat") private chat?: HTMLDivElement;
	@query("dialog.image-zoom") private imageZoomDialog?: HTMLDialogElement;
	@state() private pinnedToBottom = true;
	@state() private zoomedImage: { src: string; alt: string } | undefined =
		undefined;
	@state() private expandedMetaKey: string | undefined;
	@state() private copiedMessageKey: string | undefined;
	@state() private currentConversationIndex: number | undefined;
	@state() private activeToasts: ActiveToast[] = [];
	private readonly shownAnnouncementIds = new Set<string>();
	private readonly toastTimers = new Map<
		string,
		ReturnType<typeof setTimeout>
	>();
	private readonly disclosures = new ChatDisclosureController();
	private readonly scrollController = new ChatScrollController();
	private suppressScrollSave = false;
	private suppressLoadMoreRequests = false;
	private loadMoreCheckFrame: number | undefined;
	private scrollToBottomFrame: number | undefined;
	private scrollToOpenAskFrame: number | undefined;
	private scrollToOpenDialogFrame: number | undefined;
	private conversationRailFrame: number | undefined;
	private groupedMessagesInput?: ChatLine[];
	private groupedMessagesStart = 0;
	private groupedMessagesCache: ChatGroup[] = [];
	private readonly messageMetaCache = new WeakMap<ChatLine, string>();
	private readonly messageCopyTextCache = new WeakMap<ChatLine, string>();
	private lastScrollTop = 0;
	private lastClientHeight = 0;
	private touchStartY: number | undefined;
	private pendingScrollRestoreSessionId: string | undefined;
	private pendingScrollRestorePosition: ChatAnchorScrollPosition | undefined;
	private restoreScrollFrame: number | undefined;
	private prependRestoreToken = 0;
	@state() private loadMoreRequested = false;
	private readonly onViewportResize = () => {
		if (this.pinnedToBottom) this.scrollToBottom();
		else this.lastClientHeight = this.chat?.clientHeight ?? 0;
	};
	private readonly onImageLoad = (): void => {
		if (this.pinnedToBottom) this.scrollToBottom();
	};
	private readonly openImageZoom = (src: string, alt: string): void => {
		this.zoomedImage = { src, alt };
	};
	private readonly closeImageZoom = (): void => {
		if (this.zoomedImage !== undefined) this.zoomedImage = undefined;
	};
	private readonly onImageZoomDialogClick = (event: MouseEvent): void => {
		if (event.target === this.imageZoomDialog) this.closeImageZoom();
	};
	private readonly onPageHide = () => {
		this.saveScrollPosition();
	};
	private readonly handleClearServerQueue = (): void => {
		this.onClearServerQueue?.();
	};
	private readonly handleToggleWarnings = (): void => {
		this.onToggleWarnings?.();
	};

	override connectedCallback(): void {
		super.connectedCallback();
		window.addEventListener("resize", this.onViewportResize);
		window.addEventListener("pagehide", this.onPageHide);
		window.visualViewport?.addEventListener("resize", this.onViewportResize);
	}

	protected override firstUpdated(): void {
		this.lastClientHeight = this.chat?.clientHeight ?? 0;
	}

	override disconnectedCallback(): void {
		this.saveScrollPosition();
		this.clearToastTimers();
		this.scrollController.dispose();
		this.prependRestoreToken += 1;
		if (this.restoreScrollFrame !== undefined)
			cancelAnimationFrame(this.restoreScrollFrame);
		if (this.loadMoreCheckFrame !== undefined)
			cancelAnimationFrame(this.loadMoreCheckFrame);
		if (this.scrollToBottomFrame !== undefined)
			cancelAnimationFrame(this.scrollToBottomFrame);
		if (this.scrollToOpenAskFrame !== undefined) {
			cancelAnimationFrame(this.scrollToOpenAskFrame);
			this.scrollToOpenAskFrame = undefined;
		}
		if (this.scrollToOpenDialogFrame !== undefined) {
			cancelAnimationFrame(this.scrollToOpenDialogFrame);
			this.scrollToOpenDialogFrame = undefined;
		}
		if (this.conversationRailFrame !== undefined)
			cancelAnimationFrame(this.conversationRailFrame);
		window.removeEventListener("resize", this.onViewportResize);
		window.removeEventListener("pagehide", this.onPageHide);
		window.visualViewport?.removeEventListener("resize", this.onViewportResize);
		super.disconnectedCallback();
	}

	private savePreviousSessionScrollPosition(previousSessionId: unknown): void {
		if (
			typeof previousSessionId !== "string" ||
			previousSessionId === "" ||
			previousSessionId === this.sessionId
		)
			return;
		this.saveScrollPosition(previousSessionId);
	}

	private prepareSessionUiState(): void {
		this.disclosures.syncSession(this.sessionId);
		this.clearToasts();
		this.scrollController.clearScheduledSave();
		this.suppressScrollSave = false;
		this.suppressLoadMoreRequests = false;
		this.pendingScrollRestoreSessionId = undefined;
		this.pendingScrollRestorePosition = undefined;
		this.prependRestoreToken += 1;
		if (this.restoreScrollFrame !== undefined) {
			cancelAnimationFrame(this.restoreScrollFrame);
			this.restoreScrollFrame = undefined;
		}
		if (this.scrollToOpenAskFrame !== undefined) {
			cancelAnimationFrame(this.scrollToOpenAskFrame);
			this.scrollToOpenAskFrame = undefined;
		}
		if (this.scrollToOpenDialogFrame !== undefined) {
			cancelAnimationFrame(this.scrollToOpenDialogFrame);
			this.scrollToOpenDialogFrame = undefined;
		}
	}

	protected override willUpdate(changed: Map<string, unknown>): void {
		if (changed.has("sessionId")) {
			this.savePreviousSessionScrollPosition(changed.get("sessionId"));
			this.prepareSessionUiState();
		} else if (
			changed.has("notificationInbox") &&
			this.notificationTargetChanged(changed.get("notificationInbox"))
		) {
			this.clearToasts();
		}
		if (
			changed.has("messages") ||
			changed.has("pendingAsk") ||
			changed.has("pendingDialogs")
		)
			this.pinnedToBottom =
				this.pinnedToBottom &&
				(this.didChatHeightChange() || this.isNearBottom());
	}

	protected override update(changed: Map<string, unknown>): void {
		const prependAnchor = this.isPrependingMessages(changed)
			? this.capturePrependScrollAnchor()
			: undefined;
		super.update(changed);
		if (prependAnchor !== undefined)
			this.restorePrependScrollAnchor(prependAnchor);
	}

	protected override updated(changed: Map<string, unknown>): void {
		if (changed.has("loadingMore") && !this.loadingMore)
			this.loadMoreRequested = false;
		if (changed.has("hasMore") && !this.hasMore) this.loadMoreRequested = false;
		if (changed.has("sessionId")) this.restoreScrollPosition();
		const openedAsk =
			changed.has("pendingAsk") &&
			this.isNewPendingAsk(changed.get("pendingAsk"));
		const openedDialog =
			changed.has("pendingDialogs") &&
			this.isNewOpenDialog(changed.get("pendingDialogs"));
		// The form uses the transcript scroller. Start a new long form at question
		// one rather than applying the usual live-tail scroll and landing at its end.
		if (!changed.has("sessionId") && openedAsk && this.pinnedToBottom)
			this.scrollToOpenAsk();
		else if (!changed.has("sessionId") && openedDialog && this.pinnedToBottom)
			this.scrollToOpenDialog();
		else if (
			!changed.has("sessionId") &&
			(changed.has("messages") ||
				changed.has("pendingAsk") ||
				changed.has("pendingDialogs")) &&
			this.pinnedToBottom
		)
			this.scrollToBottom();
		if (
			changed.has("messages") ||
			changed.has("messageStart") ||
			changed.has("messageTotal") ||
			changed.has("hasMore") ||
			changed.has("loadingMore")
		)
			this.scheduleConversationRailUpdate();
		if (
			changed.has("messages") ||
			changed.has("messageStart") ||
			changed.has("hasMore") ||
			changed.has("loadingMore") ||
			changed.has("pendingAsk") ||
			changed.has("pendingDialogs")
		)
			this.continuePendingScrollRestore();
		if (
			changed.has("messages") ||
			changed.has("hasMore") ||
			changed.has("loadingMore")
		)
			this.requestLoadMoreIfNeeded();
		if (changed.has("notificationInbox")) this.syncNotificationToasts();
		if (changed.has("zoomedImage")) this.syncImageZoomDialog();
	}

	private syncImageZoomDialog(): void {
		const dialog = this.imageZoomDialog;
		if (dialog === undefined) return;
		if (this.zoomedImage !== undefined && !dialog.open) dialog.showModal();
		else if (this.zoomedImage === undefined && dialog.open) dialog.close();
	}

	private notificationTargetChanged(previous: unknown): boolean {
		const currentInbox = this.notificationInbox;
		if (!isSessionNotificationTarget(previous) || currentInbox === undefined)
			return previous !== currentInbox;
		return (
			notificationTargetKey(previous) !== notificationTargetKey(currentInbox)
		);
	}

	override render() {
		const groups = this.groupedMessages();
		return html`
      ${this.renderTopNotices()}
      ${this.renderNotificationLiveRegions()}
      <div class="chat-wrap">
        ${this.renderConversationRail()}
        <div class="chat" @scroll=${() => {
					this.onScroll();
				}} @wheel=${(event: WheelEvent) => {
					this.onWheel(event);
				}} @touchstart=${(event: TouchEvent) => {
					this.onTouchStart(event);
				}} @touchmove=${(event: TouchEvent) => {
					this.onTouchMove(event);
				}}>
          ${this.renderHistoryBoundary()}
          ${repeat(
						groups,
						(group) =>
							group.kind === "group"
								? this.groupRenderKey(group.startIndex)
								: this.messageAnchorKey(group.index),
						(group, index) => {
							if (group.kind === "group")
								return this.renderMessageGroup(
									group.messages,
									group.startIndex,
									group.endIndex,
									this.isLiveTailGroup(groups, index),
								);
							if (group.kind === "tool-image")
								return this.renderToolImageOutput(
									group.message,
									group.index,
									group.toolName,
								);
							return this.renderMessage(group.message, group.index);
						},
					)}
          ${this.renderQueuedMessages()}
          ${this.renderSessionActivity()}
          ${this.renderOpenAsk()}
          ${this.renderExtensionDialogs()}
        </div>
        ${this.renderNotificationToasts()}
        ${this.renderActivityDock()}
      </div>
      ${this.renderImageZoom()}
    `;
	}

	private renderTopNotices() {
		const warnings = this.renderWarnings();
		if (warnings === null) return null;
		return html`<div class="top-notices">${warnings}</div>`;
	}

	private renderNotificationToasts() {
		if (this.activeToasts.length === 0) return null;
		const canDismissAll =
			this.onDismissAllNotifications !== undefined &&
			this.activeToasts.length > 1;
		return html`
      <div class="notification-toasts" role="region" aria-label="Session notifications">
        ${this.activeToasts.map((toast) => this.renderToast(toast))}
        ${
					canDismissAll
						? html`
          <button type="button" class="toast-dismiss-all" @click=${() => {
						this.dismissAllToasts();
					}}>Dismiss all</button>
        `
						: null
				}
      </div>
    `;
	}

	private renderToast(toast: ActiveToast) {
		const label = notificationSeverityLabel(toast.severity);
		const role = toast.severity === "error" ? "alert" : "status";
		// Only auto-dismissing severities get the countdown progress bar; errors stay
		// until dismissed, so a shrinking bar would be misleading.
		const timed = toast.severity !== "error";
		return html`
      <div
        class=${`toast ${toast.severity}${timed ? " timed" : ""}`}
        role=${role}
        data-toast-key=${toast.key}
        style=${timed ? `--pi-toast-duration: ${String(AUTO_DISMISS_TOAST_MS)}ms` : nothing}
      >
        <strong class="toast-severity">${label}</strong>
        <p class="toast-message" dir="auto">${toast.message}</p>
        <button
          type="button"
          class="toast-dismiss"
          aria-label=${notificationDismissLabel(toast)}
          title="Dismiss notification"
          ?disabled=${this.onDismissNotification === undefined}
          @click=${() => {
						this.dismissToast(toast.key);
					}}
        >${renderNotificationCloseIcon()}</button>
      </div>
    `;
	}

	// Announcements are append-only deltas emitted only on live "added" events,
	// so snapshot loads never replay history as toasts. Dedupe by announcement id
	// so a re-render never schedules the same toast twice.
	private syncNotificationToasts(): void {
		const inbox = this.notificationInbox;
		if (inbox?.sessionId !== this.sessionId) return;
		const fresh = inbox.announcements.filter(
			(announcement) => !this.shownAnnouncementIds.has(announcement.id),
		);
		if (fresh.length === 0) return;
		for (const announcement of fresh) {
			this.shownAnnouncementIds.add(announcement.id);
			const toast: ActiveToast = {
				key: announcement.id,
				notificationId: announcement.notificationId,
				severity: announcement.severity,
				message: announcement.message,
			};
			this.activeToasts = [...this.activeToasts, toast];
			this.scheduleToastExpiry(toast);
		}
	}

	private scheduleToastExpiry(toast: ActiveToast): void {
		if (toast.severity === "error") return;
		const timer = setTimeout(() => {
			this.expireToast(toast.key);
		}, AUTO_DISMISS_TOAST_MS);
		this.toastTimers.set(toast.key, timer);
	}

	private expireToast(key: string): void {
		this.dismissToast(key);
	}

	private dismissToast(key: string): void {
		const toast = this.activeToasts.find((candidate) => candidate.key === key);
		if (toast === undefined) return;
		const timer = this.toastTimers.get(key);
		if (timer !== undefined) {
			clearTimeout(timer);
			this.toastTimers.delete(key);
		}
		this.activeToasts = this.activeToasts.filter(
			(candidate) => candidate.key !== key,
		);
		this.onDismissNotification?.(toast.notificationId);
	}

	private dismissAllToasts(): void {
		this.clearToastTimers();
		this.activeToasts = [];
		this.onDismissAllNotifications?.();
	}

	private clearToasts(): void {
		this.clearToastTimers();
		this.activeToasts = [];
		this.shownAnnouncementIds.clear();
	}

	private clearToastTimers(): void {
		for (const timer of this.toastTimers.values()) clearTimeout(timer);
		this.toastTimers.clear();
	}

	private renderNotificationLiveRegions() {
		const announcements =
			this.notificationInbox?.sessionId === this.sessionId
				? this.notificationInbox.announcements
				: [];
		const polite = announcements.filter(
			(announcement) => announcement.severity !== "error",
		);
		const assertive = announcements.filter(
			(announcement) => announcement.severity === "error",
		);
		return html`
      <div class="visually-hidden notification-live" aria-live="polite" aria-atomic="false">${repeat(
				polite,
				(announcement) => announcement.id,
				(announcement) =>
					html`<span data-announcement-id=${announcement.id}>${notificationAnnouncementLabel(announcement)}</span>`,
			)}</div>
      <div class="visually-hidden notification-live" aria-live="assertive" aria-atomic="false">${repeat(
				assertive,
				(announcement) => announcement.id,
				(announcement) =>
					html`<span data-announcement-id=${announcement.id}>${notificationAnnouncementLabel(announcement)}</span>`,
			)}</div>
    `;
	}

	private renderWarnings() {
		const rows = chatSessionWarningRows(this.status);
		if (!this.warningsVisible || rows.length === 0) return null;
		return html`
      <aside class="session-warnings" role="alert" aria-live="polite">
        ${
					this.onToggleWarnings === undefined
						? null
						: html`
          <div class="session-warnings-controls">
            <button
              type="button"
              class="session-warnings-collapse"
              title="Minimise warnings"
              aria-label="Minimise warnings"
              @click=${this.handleToggleWarnings}
            >
              <svg class="session-warnings-collapse-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="m18 15-6-6-6 6"></path>
              </svg>
              <span>Minimise</span>
            </button>
          </div>
        `
				}
        ${rows.map((row) => {
					const dismissId = row.dismissId;
					return html`
          <div class=${row.severityClass}>
            <div class="session-warning-head">
              ${renderSessionWarningIcon(row.severity, "session-warning-icon")}
              ${row.source === undefined ? null : html`<span class="session-warning-source">${row.source}</span>`}
            </div>
            <div class="session-warning-body">
              <p class="session-warning-message">${row.message}</p>
              ${row.path === undefined ? null : html`<p class="session-warning-path">${row.path}</p>`}
            </div>
            ${
							dismissId === undefined
								? null
								: html`
              <button
                type="button"
                class="session-warning-dismiss"
                title="Don't show this warning again"
                aria-label="Dismiss warning"
                @click=${() => {
									this.onDismissWarning?.(dismissId);
								}}
              >×</button>
            `
						}
          </div>
        `;
				})}
      </aside>
    `;
	}

	private renderImageZoom() {
		return html`
      <dialog class="image-zoom" @click=${this.onImageZoomDialogClick} @close=${this.closeImageZoom} @cancel=${this.closeImageZoom}>
        ${
					this.zoomedImage === undefined
						? null
						: html`
          <button type="button" class="image-zoom-close" aria-label="Close image" @click=${this.closeImageZoom}>×</button>
          <img class="image-zoom-full" src=${this.zoomedImage.src} alt=${this.zoomedImage.alt} />
        `
				}
      </dialog>
    `;
	}

	private groupedMessages(): ChatGroup[] {
		if (
			this.groupedMessagesInput === this.messages &&
			this.groupedMessagesStart === this.messageStart
		)
			return this.groupedMessagesCache;
		this.groupedMessagesInput = this.messages;
		this.groupedMessagesStart = this.messageStart;
		this.groupedMessagesCache = groupChatMessages(
			this.messages,
			this.messageStart,
		);
		return this.groupedMessagesCache;
	}

	private isLiveTailGroup(groups: ChatGroup[], index: number): boolean {
		return index === groups.length - 1 && this.isSessionLive();
	}

	private isSessionLive(): boolean {
		return (
			this.isSendingPrompt ||
			this.status?.isStreaming === true ||
			this.status?.isCompacting === true ||
			this.status?.isBashRunning === true ||
			this.activity?.phase === "active"
		);
	}

	private renderActivityDock() {
		if (this.isSendingPrompt) {
			return html`
        <div class="activity-dock active" aria-live="polite">
          <span class="dot"></span>
          <span class="activity-text">Sending your message…</span>
        </div>
      `;
		}
		const state = this.activityState();
		if (state === undefined) return null;
		const active = state !== "idle" || this.activity?.phase === "active";
		return html`
      <div class=${active ? "activity-dock active" : "activity-dock"} aria-live="polite">
        <span class="dot"></span>
        <span class="activity-text">${this.activityText(state)}</span>
      </div>
    `;
	}

	private renderQueuedMessages() {
		const serverQueued = this.status?.queuedMessages ?? [];
		return html`${chatQueuedMessageSections(this.clientQueuedMessages, serverQueued).map((section) => this.renderQueuedMessageList(section))}`;
	}

	private renderQueuedMessageList(section: QueuedMessageSection) {
		const canClear = chatQueuedSectionShowsClearAction(
			section,
			this.canClearServerQueue,
			this.onClearServerQueue !== undefined,
		);
		return html`
      <aside class="queued-messages" aria-live="polite">
        <div class="queued-header">
          <div class="queued-heading">
            <strong>${section.heading}</strong>
            <small>${section.detail}</small>
          </div>
          ${
						canClear
							? html`
            <button type="button" class="queued-clear-button" title="Clear queued messages without stopping active work" @click=${this.handleClearServerQueue}>Clear queue</button>
          `
							: null
					}
        </div>
        ${section.messages.map(
					(message, index) => html`
          <div class="queued-message">
            <span class="queued-kind">${message.kind === "steer" ? "Steer" : "Follow-up"} ${String(index + 1)}</span>
            <formatted-text .text=${message.text}></formatted-text>
          </div>
        `,
				)}
      </aside>
    `;
	}

	private renderOpenAsk() {
		if (this.pendingAsk === undefined) return null;
		return html`
      <ask-user-card
        data-scroll-anchor-id=${`ask:${this.pendingAsk.askId}`}
        .ask=${this.pendingAsk}
        .draftSessionId=${this.askDraftSessionId}
        .onSubmit=${this.onSubmitAsk}
      ></ask-user-card>
    `;
	}

	private renderExtensionDialogs() {
		const open = this.pendingDialogs[0];
		if (open === undefined) return null;
		const queuedCount = this.pendingDialogs.length - 1;
		return html`
      <extension-dialog-card
        class="open-dialog-card"
        data-scroll-anchor-id=${`dialog:${open.dialogId}`}
        .dialog=${open}
        .onAnswer=${this.onAnswerDialog}
        .onCancel=${this.onCancelDialog}
      ></extension-dialog-card>
      ${
				queuedCount > 0
					? html`<p class="queued-dialogs" role="status">${String(queuedCount)} more extension ${queuedCount === 1 ? "dialog" : "dialogs"} queued</p>`
					: null
			}
    `;
	}

	private renderSessionActivity() {
		if (!this.isCompacting) return null;
		return html`
      <aside class="session-activity compacting" aria-live="polite">
        <strong>Compacting history…</strong>
        <span>The agent is summarizing earlier context. New prompts will be queued until compaction finishes.</span>
        ${this.pendingMessageCount > 0 ? html`<small>${this.pendingMessageCount} queued ${this.pendingMessageCount === 1 ? "message" : "messages"}</small>` : null}
      </aside>
    `;
	}

	private activityState(): string | undefined {
		const status = this.status;
		if (status === undefined) return this.activity?.label;
		if (status.isCompacting) return "compacting";
		if (status.isBashRunning) return "bash";
		if (status.isStreaming) return "running";
		if (status.pendingMessageCount > 0) return "queued";
		return "idle";
	}

	private activityText(state: string): string {
		const activity = this.activity;
		if (activity === undefined) return state;
		if (state !== "idle" && activity.phase === "idle") return state;
		return activity.detail !== undefined && activity.detail !== ""
			? `${activity.label}: ${activity.detail}`
			: activity.label;
	}

	private renderConversationRail() {
		if (!this.messages.length || this.messageTotal <= 0) return null;
		const total = this.conversationDisplayTotal();
		const position = this.conversationPositionPercent(total);
		const loadedPercent = this.hasMore
			? clampPercent((this.messages.length / total) * 100)
			: 100;
		return html`<conversation-meter .positionPercent=${position} .loadedPercent=${loadedPercent}></conversation-meter>`;
	}

	private conversationDisplayTotal(): number {
		if (!this.hasMore && this.messageStart === 0)
			return Math.max(1, this.messages.length);
		return Math.max(
			1,
			this.messageTotal,
			this.messageStart + this.messages.length,
		);
	}

	private conversationPositionPercent(
		total = this.conversationDisplayTotal(),
	): number {
		if (total <= 1) return 100;
		const fallbackIndex = this.pinnedToBottom
			? this.messageStart + this.messages.length - 1
			: this.messageStart;
		const index = clampNumber(
			this.currentConversationIndex ?? fallbackIndex,
			0,
			total - 1,
		);
		return clampPercent((index / (total - 1)) * 100);
	}

	private renderHistoryBoundary() {
		const range = this.historyRangeLabel();
		if (this.loadingMore)
			return html`<div class="history-boundary"><span>Loading earlier messages…</span>${range}</div>`;
		if (this.hasMore)
			return html`
      <div class="history-boundary">
        <button type="button" class="history-load-button" ?disabled=${this.loadMoreRequested} @click=${() => {
					this.requestLoadMore();
				}}>Load earlier messages</button>
        <span>Scroll up to load earlier messages</span>
        ${range}
      </div>
    `;
		if (this.messages.length)
			return html`<div class="history-boundary"><span>Beginning of session</span>${range}</div>`;
		return null;
	}

	private historyRangeLabel() {
		if (!this.messages.length || this.messageTotal <= 0) return null;
		const from = this.messageStart + 1;
		const to = this.loadedRawMessageEnd();
		const total = Math.max(this.messageTotal, to);
		return html`<small>Showing messages ${from}–${to} of ${total}</small>`;
	}

	private loadedRawMessageEnd(): number {
		return Math.max(this.messageEnd, this.messageStart + this.messages.length);
	}

	private renderMessage(message: ChatLine, index: number) {
		const toolOnly = this.isToolExecutionOnlyMessage(message);
		const askUserRecordOnly = this.isAskUserRecordOnlyMessage(message);
		const dialogRecordOnly = this.isExtensionDialogRecordOnlyMessage(message);
		const isShell = toolOnly || askUserRecordOnly || dialogRecordOnly;
		const isProcess = !isShell && this.isProcessRole(message.role);
		const hideIdentity = isShell || isProcess || message.role === "skill";
		const shellClass =
			toolOnly || dialogRecordOnly
				? "msg tool-execution-shell"
				: "msg ask-user-record-shell";
		const className = isShell ? shellClass : `msg ${message.role}`;
		return html`
      ${this.renderScrollMarker(this.messageScrollMarkerId(index))}
      <article class=${className} data-index=${index} data-scroll-anchor-id=${this.messageAnchorKey(index)}>
        ${this.renderMessageLead(message, isShell || isProcess)}
        <div class="msg-body">
          ${hideIdentity ? null : this.renderMessageIdentity(message, String(index))}
          ${message.parts.map((part) => this.renderPart(part, message))}
        </div>
      </article>
    `;
	}

	/** The 28px lead column: an avatar for conversational roles, a quiet rail for process output. */
	private renderMessageLead(message: ChatLine, useRail: boolean) {
		if (useRail) return html`<div class="process-rail" aria-hidden="true"></div>`;
		return html`<div class="avatar">${renderMessageAvatar(message.role)}</div>`;
	}

	private isProcessRole(role: ChatLine["role"]): boolean {
		return role === "tool" || role === "bash" || role === "system";
	}

	private renderToolImageOutput(
		message: ChatLine,
		index: number,
		toolName?: string,
	) {
		const label = chatToolOutputLabel(toolName);
		return html`
      ${this.renderScrollMarker(this.messageScrollMarkerId(index))}
      <article class="msg tool-image-output" data-index=${index} data-scroll-anchor-id=${this.messageAnchorKey(index)}>
        <div class="avatar">${renderMessageAvatar("assistant")}</div>
        <div class="msg-body">
          ${this.renderMessageIdentity(message, String(index), label)}
          ${message.parts.map((part) => this.renderPart(part, message))}
        </div>
      </article>
    `;
	}

	private isToolExecutionOnlyMessage(message: ChatLine): boolean {
		return (
			message.role === "tool" &&
			message.parts.length > 0 &&
			message.parts.every((part) => part.type === "toolExecution")
		);
	}

	private isAskUserRecordOnlyMessage(message: ChatLine): boolean {
		return (
			message.parts.length > 0 &&
			message.parts.every((part) => part.type === "askUserRecord")
		);
	}

	private isExtensionDialogRecordOnlyMessage(message: ChatLine): boolean {
		return (
			message.parts.length > 0 &&
			message.parts.every((part) => part.type === "extensionDialogRecord")
		);
	}

	private renderMessageGroup(
		messages: ChatLine[],
		startIndex: number,
		endIndex: number,
		defaultOpen: boolean,
	) {
		const disclosureKey = this.groupDisclosureKey(
			startIndex,
			endIndex,
			defaultOpen,
		);
		const open = this.disclosures.isOpen(disclosureKey, defaultOpen);
		return html`
      ${this.renderScrollMarker(this.groupScrollMarkerId(endIndex))}
      <details class=${chatMessageGroupClassName(defaultOpen)} data-index=${startIndex} data-scroll-anchor-id=${this.groupAnchorKey(startIndex)} ?open=${open} @toggle=${(
				event: Event,
			) => {
				this.onGroupToggle(disclosureKey, event, defaultOpen);
			}}>
        <summary>
          <b class="label">${chatMessageGroupLabel(defaultOpen)}</b>
          <span>${summarizeChatGroup(messages)}</span>
        </summary>
        ${open ? this.renderMessageGroupBody(messages, startIndex) : null}
      </details>
    `;
	}

	private renderMessageGroupBody(messages: ChatLine[], startIndex: number) {
		return html`
			<div class="group-body">
				${messages.map((message, offset) => {
					const toolOnly = this.isToolExecutionOnlyMessage(message);
					return html`
						<section class=${toolOnly ? "group-msg tool-execution-shell" : `group-msg ${message.role}`} data-index=${startIndex + offset} data-scroll-anchor-id=${this.eventAnchorKey(startIndex + offset)}>
							${toolOnly ? null : this.renderMessageIdentity(message, `${String(startIndex)}:${String(offset)}`)}
							${message.parts.map((part) => this.renderPart(part, message))}
						</section>
					`;
				})}
			</div>
		`;
	}

	private renderScrollMarker(markerId: string) {
		return html`<span class="scroll-marker" data-marker-id=${markerId} aria-hidden="true"></span>`;
	}

	private renderMessageIdentity(
		message: ChatLine,
		key: string,
		label?: string,
	) {
		const meta = this.messageMetaLabel(message);
		const expanded = this.expandedMetaKey === key;
		const name = label ?? messageDisplayName(message.role);
		return html`
      <div class="msg-identity">
        <span class="msg-name">${name}</span>
        <div class="msg-identity-trailing">
          ${this.renderMessageActions(message, key)}
          <span class=${expanded ? "msg-meta expanded" : "msg-meta"} role="button" tabindex="0" title=${meta} aria-label=${meta} aria-expanded=${String(expanded)} @click=${() => {
						this.expandedMetaKey = expanded ? undefined : key;
					}} @keydown=${(event: KeyboardEvent) => {
						this.onMetaKeydown(event, key, expanded);
					}}>${meta}</span>
        </div>
      </div>
    `;
	}

	private renderMessageActions(message: ChatLine, key: string) {
		if (!this.isCopyableMessage(message)) return null;
		const copied = this.copiedMessageKey === key;
		return html`
      <div class="msg-actions" aria-label="Message actions">
        <button type="button" class="msg-action" title=${copied ? "Copied" : "Copy message"} aria-label=${`${copied ? "Copied" : "Copy"} ${message.role} message`} @click=${(
					event: MouseEvent,
				) => {
					void this.copyMessage(message, key, event);
				}}>
          <span aria-hidden="true">${copied ? "✓" : "⧉"}</span>
        </button>
      </div>
    `;
	}

	private onMetaKeydown(event: KeyboardEvent, key: string, expanded: boolean) {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		this.expandedMetaKey = expanded ? undefined : key;
	}

	private isCopyableMessage(message: ChatLine): boolean {
		return (
			(message.role === "user" || message.role === "assistant") &&
			this.messageCopyText(message) !== ""
		);
	}

	private messageCopyText(message: ChatLine): string {
		const cached = this.messageCopyTextCache.get(message);
		if (cached !== undefined) return cached;
		const text = message.parts
			.filter(
				(part): part is Extract<ChatPart, { type: "text" }> =>
					part.type === "text",
			)
			.map((part) => part.text.trim())
			.filter((partText) => partText !== "")
			.join("\n\n");
		this.messageCopyTextCache.set(message, text);
		return text;
	}

	private async copyMessage(
		message: ChatLine,
		key: string,
		event: MouseEvent,
	): Promise<void> {
		event.stopPropagation();
		const copied = await writeClipboardText(this.messageCopyText(message));
		if (!copied) return;
		this.copiedMessageKey = key;
		window.setTimeout(() => {
			if (this.copiedMessageKey === key) this.copiedMessageKey = undefined;
		}, 1200);
	}

	private messageMetaLabel(message: ChatLine): string {
		const cached = this.messageMetaCache.get(message);
		if (cached !== undefined) return cached;
		const label = chatMessageMetadataLabel(message);
		this.messageMetaCache.set(message, label);
		return label;
	}

	private renderPart(part: ChatPart, message?: ChatLine) {
		if (part.type === "text" && message?.role === "bash")
			return html`<pre class="part shell-output">${part.text}</pre>`;
		if (part.type === "text")
			return html`<formatted-text class="part" .text=${part.text}></formatted-text>`;
		if (part.type === "thinking")
			return html`
      <details class="part process-block thinking">
        <summary><span class="pb-icon" aria-hidden="true">✻</span><span class="pb-name">Thought</span></summary>
        <div class="pb-body"><formatted-text .text=${part.text}></formatted-text></div>
      </details>
    `;
		if (part.type === "skillInvocation")
			return html`
      <details class="part process-block skill">
        <summary><span class="pb-icon" aria-hidden="true">✦</span><span class="pb-name">${part.name}</span><span class="pb-summary">${part.location}</span></summary>
        <div class="pb-body"><formatted-text .text=${part.content}></formatted-text></div>
      </details>
    `;
		if (part.type === "skillRead")
			return html`
      <div class="part skill-read">
        <span class="pb-icon" aria-hidden="true">✦</span><span class="pb-name">Loaded ${part.name}</span><span class="pb-summary">${part.path}</span>
      </div>
    `;
		if (part.type === "askUserRecord")
			return html`
      <ask-user-card
        class="part"
        .outcome=${part.outcome}
        .draftSessionId=${this.askDraftSessionId}
      ></ask-user-card>
    `;
		if (part.type === "extensionDialogRecord")
			return html`
      <extension-dialog-card
        class="part"
        .outcome=${{ dialog: part.dialog, reason: part.reason, ...(part.answer === undefined ? {} : { answer: part.answer }) }}
      ></extension-dialog-card>
    `;
		if (part.type === "image") {
			const { src, alt } = chatImagePartSource(part);
			return html`<img class="part chat-image" src=${src} alt=${alt} loading="lazy" role="button" tabindex="0" title="Click to enlarge" @load=${this.onImageLoad} @click=${() => {
				this.openImageZoom(src, alt);
			}} @keydown=${(event: KeyboardEvent) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					this.openImageZoom(src, alt);
				}
			}} />`;
		}
		if (part.type === "toolCall")
			return html`
      <div class="part tool-line">
        <span class="pb-icon" aria-hidden="true">▶</span><span class="pb-name">${part.toolName}</span><span class="summary">${part.summary}</span>
      </div>
    `;
		if (part.type === "toolExecution")
			return html`<tool-execution-view class="part" .execution=${part}></tool-execution-view>`;
		if (part.type === "toolResult")
			return html`
      <details class="part process-block" ?open=${part.isError}>
        <summary>
          <span class="pb-icon" aria-hidden="true">${part.isError ? "✖" : "✓"}</span>
          <span class="pb-name">${part.toolName}</span>
          <span class="pb-summary">result</span>
          <span class="pb-status ${part.isError ? "error" : "success"}" aria-hidden="true"></span>
        </summary>
        <div class="pb-body"><formatted-text .text=${part.text}></formatted-text></div>
      </details>
    `;
		return null;
	}

	private onGroupToggle(key: string, event: Event, defaultOpen: boolean) {
		const details = event.currentTarget;
		if (!(details instanceof HTMLDetailsElement)) return;
		if (this.disclosures.applyToggle(key, details.open, defaultOpen))
			this.requestUpdate();
	}

	private onScroll() {
		this.requestLoadMoreIfNeeded();
		this.updatePinnedToBottomFromScroll();
		this.scheduleConversationRailUpdate();
		if (!this.suppressScrollSave) this.scheduleScrollPositionSave();
	}

	private onWheel(event: WheelEvent) {
		if (event.deltaY < 0 && this.canScrollUp()) this.pinnedToBottom = false;
	}

	private onTouchStart(event: TouchEvent) {
		this.touchStartY = event.touches[0]?.clientY;
	}

	private onTouchMove(event: TouchEvent) {
		const y = event.touches[0]?.clientY;
		if (
			this.touchStartY !== undefined &&
			y !== undefined &&
			y > this.touchStartY &&
			this.canScrollUp()
		)
			this.pinnedToBottom = false;
	}

	private updatePinnedToBottomFromScroll() {
		const chat = this.chat;
		if (!chat) return;
		const heightChanged = this.didChatHeightChange();
		const wasPinnedToBottom = this.pinnedToBottom;
		const scrollingUp = chat.scrollTop < this.lastScrollTop;
		if (heightChanged && wasPinnedToBottom) {
			this.lastClientHeight = chat.clientHeight;
			this.scrollToBottom();
			return;
		}
		if (this.isAtBottom()) this.pinnedToBottom = true;
		else if (scrollingUp) this.pinnedToBottom = false;
		else this.pinnedToBottom = this.isNearBottom();
		this.lastScrollTop = chat.scrollTop;
		this.lastClientHeight = chat.clientHeight;
	}

	private didChatHeightChange(): boolean {
		const chat = this.chat;
		return (
			chat !== undefined &&
			this.lastClientHeight !== 0 &&
			chat.clientHeight !== this.lastClientHeight
		);
	}

	private isPrependingMessages(changed: Map<string, unknown>): boolean {
		const oldMessageStart = changed.get("messageStart");
		return (
			typeof oldMessageStart === "number" && this.messageStart < oldMessageStart
		);
	}

	private requestLoadMoreIfNeeded(): void {
		if (this.loadMoreCheckFrame !== undefined) return;
		this.loadMoreCheckFrame = requestAnimationFrame(() => {
			this.loadMoreCheckFrame = undefined;
			if (this.suppressLoadMoreRequests) return;
			const chat = this.chat;
			if (!chat) return;
			if (
				shouldRequestEarlierMessages({
					hasMore: this.hasMore,
					loadingMore: this.loadingMore || this.loadMoreRequested,
					canRequest: this.onLoadMore !== undefined,
					scrollTop: chat.scrollTop,
					scrollHeight: chat.scrollHeight,
					clientHeight: chat.clientHeight,
				})
			)
				this.requestLoadMore();
		});
	}

	private requestLoadMore(): void {
		if (this.loadMoreRequested) return;
		if (!this.hasMore || this.loadingMore || this.onLoadMore === undefined)
			return;
		this.loadMoreRequested = true;
		this.onLoadMore();
	}

	private isNearBottom(): boolean {
		const chat = this.chat;
		if (!chat) return true;
		return isNearScrollBottom(chat);
	}

	private isAtBottom(): boolean {
		const chat = this.chat;
		if (!chat) return true;
		return distanceFromScrollBottom(chat) < 2;
	}

	private canScrollUp(): boolean {
		const chat = this.chat;
		return chat !== undefined && chat.scrollTop > 0;
	}

	private scrollToBottom() {
		if (this.scrollToBottomFrame !== undefined) return;
		this.scrollToBottomFrame = requestAnimationFrame(() => {
			this.scrollToBottomFrame = undefined;
			const chat = this.chat;
			if (!chat) return;
			this.withSuppressedScrollSave(() => {
				chat.scrollTop = chat.scrollHeight;
				this.lastScrollTop = chat.scrollTop;
				this.lastClientHeight = chat.clientHeight;
			});
		});
	}

	private isNewPendingAsk(previous: unknown): boolean {
		return (
			this.pendingAsk !== undefined &&
			(typeof previous !== "object" ||
				previous === null ||
				Reflect.get(previous, "askId") !== this.pendingAsk.askId)
		);
	}

	private isNewOpenDialog(previous: unknown): boolean {
		const oldest = this.pendingDialogs[0];
		if (oldest === undefined) return false;
		if (!Array.isArray(previous)) return true;
		const previousOldest: unknown = previous[0];
		return (
			typeof previousOldest !== "object" ||
			previousOldest === null ||
			Reflect.get(previousOldest, "dialogId") !== oldest.dialogId
		);
	}

	private scrollToOpenAsk(): void {
		if (this.scrollToOpenAskFrame !== undefined) return;
		if (this.scrollToBottomFrame !== undefined) {
			cancelAnimationFrame(this.scrollToBottomFrame);
			this.scrollToBottomFrame = undefined;
		}
		this.scrollToOpenAskFrame = requestAnimationFrame(() => {
			this.scrollToOpenAskFrame = undefined;
			this.withSuppressedScrollSave(() => {
				this.alignOpenAskToTop();
			});
		});
	}

	private alignOpenAskToTop(): boolean {
		const chat = this.chat;
		const card = this.renderRoot.querySelector<HTMLElement>(
			".chat > ask-user-card",
		);
		if (chat === undefined || card === null) return false;
		chat.scrollTop +=
			card.getBoundingClientRect().top - chat.getBoundingClientRect().top;
		this.syncScrollMetrics();
		this.pinnedToBottom = this.isNearBottom();
		return true;
	}

	private scrollToOpenDialog(): void {
		if (this.scrollToOpenDialogFrame !== undefined) return;
		if (this.scrollToBottomFrame !== undefined) {
			cancelAnimationFrame(this.scrollToBottomFrame);
			this.scrollToBottomFrame = undefined;
		}
		this.scrollToOpenDialogFrame = requestAnimationFrame(() => {
			this.scrollToOpenDialogFrame = undefined;
			this.withSuppressedScrollSave(() => {
				this.alignOpenDialogToTop();
			});
		});
	}

	private alignOpenDialogToTop(): boolean {
		const chat = this.chat;
		const card = this.renderRoot.querySelector<HTMLElement>(
			".chat > extension-dialog-card.open-dialog-card",
		);
		if (chat === undefined || card === null) return false;
		chat.scrollTop +=
			card.getBoundingClientRect().top - chat.getBoundingClientRect().top;
		this.syncScrollMetrics();
		this.pinnedToBottom = this.isNearBottom();
		return true;
	}

	restoreScrollPosition() {
		const sessionId = this.sessionId;
		if (this.restoreScrollFrame !== undefined)
			cancelAnimationFrame(this.restoreScrollFrame);
		this.restoreScrollFrame = requestAnimationFrame(() => {
			this.restoreScrollFrame = undefined;
			if (this.sessionId !== sessionId) return;
			this.withSuppressedScrollSave(() => {
				if (
					this.pendingAsk !== undefined &&
					this.scrollController.readPosition(sessionId) === undefined &&
					this.alignOpenAskToTop()
				)
					return;
				if (
					this.pendingDialogs.length > 0 &&
					this.scrollController.readPosition(sessionId) === undefined &&
					this.alignOpenDialogToTop()
				)
					return;
				const result = this.scrollController.restorePosition(
					sessionId,
					this.chat,
					this.scrollAnchorElements(),
					{ fallbackToBottom: this.shouldFallbackToBottomForMissingAnchor() },
				);
				this.handleScrollRestoreResult(sessionId, result);
			});
		});
	}

	private continuePendingScrollRestore(): void {
		const sessionId = this.pendingScrollRestoreSessionId;
		const position = this.pendingScrollRestorePosition;
		if (
			sessionId === undefined ||
			position === undefined ||
			sessionId !== this.sessionId ||
			this.restoreScrollFrame !== undefined
		)
			return;
		this.restoreScrollFrame = requestAnimationFrame(() => {
			this.restoreScrollFrame = undefined;
			if (this.sessionId !== sessionId) return;
			this.withSuppressedScrollSave(() => {
				const result = this.scrollController.restoreExplicitPosition(
					position,
					this.chat,
					this.scrollAnchorElements(),
					{ fallbackToBottom: this.shouldFallbackToBottomForMissingAnchor() },
				);
				this.handleScrollRestoreResult(sessionId, result);
			});
		});
	}

	private handleScrollRestoreResult(
		sessionId: string,
		result: ChatScrollRestoreResult,
	): void {
		this.syncScrollMetrics();
		if (result.status !== "missing") {
			this.updatePinnedToBottomAfterRestore(result.status);
			if (result.status === "restored" || result.status === "bottom")
				this.cancelPrependRestore();
			this.pendingScrollRestoreSessionId = undefined;
			this.pendingScrollRestorePosition = undefined;
			return;
		}

		this.pinnedToBottom = false;
		this.pendingScrollRestoreSessionId = sessionId;
		this.pendingScrollRestorePosition = result.position;
		const chat = this.chat;
		if (chat === undefined || !this.hasMore || this.loadingMore) return;
		chat.scrollTop = 0;
		this.syncScrollMetrics();
		this.requestLoadMore();
	}

	private shouldFallbackToBottomForMissingAnchor(): boolean {
		// Only fall back to the bottom once the full history is loaded; while earlier
		// pages can still load, a missing scroll anchor should keep retrying rather
		// than jump the user to the bottom.
		return !this.hasMore;
	}

	private updatePinnedToBottomAfterRestore(
		status: Exclude<ChatScrollRestoreResult["status"], "missing">,
	): void {
		if (status === "bottom") this.pinnedToBottom = true;
		else if (status === "restored") this.pinnedToBottom = this.isNearBottom();
	}

	private syncScrollMetrics(): void {
		const chat = this.chat;
		if (chat === undefined) return;
		this.lastScrollTop = chat.scrollTop;
		this.lastClientHeight = chat.clientHeight;
	}

	private cancelPrependRestore(): void {
		this.prependRestoreToken += 1;
		this.suppressLoadMoreRequests = false;
	}

	capturePrependScrollAnchor(): PrependScrollAnchor | undefined {
		const chat = this.chat;
		if (!chat) return undefined;
		return capturePrependScrollAnchor(chat, this.scrollMarkers());
	}

	restorePrependScrollAnchor(anchor: PrependScrollAnchor | undefined): void {
		if (!this.chat || !anchor) return;
		this.suppressLoadMoreRequests = true;
		this.suppressScrollSave = true;
		const token = this.prependRestoreToken + 1;
		this.prependRestoreToken = token;
		let frames = 0;
		const settle = () => {
			const chat = this.chat;
			if (!chat || token !== this.prependRestoreToken) return;
			restorePrependScrollAnchor(
				chat,
				anchor,
				anchor.markerId === undefined
					? undefined
					: this.scrollMarkerAt(anchor.markerId),
			);
			this.lastScrollTop = chat.scrollTop;
			frames += 1;
			// Formatted markdown/code layout can settle after Lit's first render. Re-apply
			// the marker anchor briefly so late height changes above the viewport do not
			// move the user's reading position.
			if (frames < PREPEND_RESTORE_SETTLE_FRAMES) {
				requestAnimationFrame(settle);
				return;
			}
			requestAnimationFrame(() => {
				if (token !== this.prependRestoreToken) return;
				this.suppressScrollSave = false;
				this.suppressLoadMoreRequests = false;
			});
		};
		settle();
	}

	saveScrollPosition(sessionId = this.sessionId) {
		if (!sessionId) return;
		this.scrollController.savePosition(
			sessionId,
			this.chat,
			this.scrollAnchorElements(),
		);
	}

	private scheduleScrollPositionSave() {
		const sessionId = this.sessionId;
		this.scrollController.scheduleSave(sessionId, (scheduledSessionId) => {
			if (this.sessionId === scheduledSessionId)
				this.saveScrollPosition(scheduledSessionId);
		});
	}

	private scheduleConversationRailUpdate(): void {
		if (this.conversationRailFrame !== undefined) return;
		this.conversationRailFrame = requestAnimationFrame(() => {
			this.conversationRailFrame = undefined;
			this.updateConversationRailPosition();
		});
	}

	private updateConversationRailPosition(): void {
		if (!this.messages.length || this.messageTotal <= 0) {
			this.currentConversationIndex = undefined;
			return;
		}
		const total = this.conversationDisplayTotal();
		const article = this.firstVisibleArticle();
		const index = Number(article?.dataset["index"]);
		if (Number.isFinite(index)) {
			this.currentConversationIndex = clampNumber(
				index,
				0,
				Math.max(0, total - 1),
			);
			return;
		}
		this.currentConversationIndex = clampNumber(
			this.pinnedToBottom
				? this.messageStart + this.messages.length - 1
				: this.messageStart,
			0,
			Math.max(0, total - 1),
		);
	}

	private scrollMarkers(): HTMLElement[] {
		return Array.from(
			this.renderRoot.querySelectorAll<HTMLElement>(".scroll-marker"),
		);
	}

	private scrollMarkerAt(markerId: string): HTMLElement | undefined {
		return this.scrollMarkers().find(
			(marker) => marker.dataset["markerId"] === markerId,
		);
	}

	private firstVisibleArticle(): HTMLElement | undefined {
		const chat = this.chat;
		if (chat === undefined) return undefined;
		const primaryArticles = Array.from(
			this.renderRoot.querySelectorAll<HTMLElement>("article.msg"),
		);
		return (
			findFirstVisibleArticle(chat, primaryArticles) ??
			findFirstVisibleArticle(chat, this.articles())
		);
	}

	private articles(): HTMLElement[] {
		return Array.from(
			this.renderRoot.querySelectorAll<HTMLElement>("article.msg, details.msg"),
		);
	}

	private scrollAnchorElements(): HTMLElement[] {
		return Array.from(
			this.renderRoot.querySelectorAll<HTMLElement>("[data-scroll-anchor-id]"),
		);
	}

	private withSuppressedScrollSave(callback: () => void) {
		this.suppressScrollSave = true;
		callback();
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				this.suppressScrollSave = false;
			});
		});
	}

	private groupDisclosureKey(
		startIndex: number,
		endIndex: number,
		defaultOpen: boolean,
	): string {
		return defaultOpen
			? `${this.sessionId}:live:${String(startIndex)}`
			: `${this.sessionId}:${String(endIndex)}`;
	}

	private messageAnchorKey(index: number): string {
		return chatMessageAnchorKey(index);
	}

	private groupRenderKey(startIndex: number): string {
		return chatGroupAnchorKey(startIndex);
	}

	private groupAnchorKey(startIndex: number): string {
		return chatGroupAnchorKey(startIndex);
	}

	private eventAnchorKey(index: number): string {
		return chatEventAnchorKey(index);
	}

	private messageScrollMarkerId(index: number): string {
		return chatMessageAnchorKey(index);
	}

	private groupScrollMarkerId(endIndex: number): string {
		return chatGroupScrollMarkerId(endIndex);
	}

	static override styles = chatStyles;
}
