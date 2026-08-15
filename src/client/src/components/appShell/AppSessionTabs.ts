import { LitElement, css, html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { tabKey, type SessionTab, type SessionTabStatusKind } from "../../sessionTabs";

type DropTarget = { beforeKey: string } | { atEnd: true };

@customElement("app-session-tabs")
export class AppSessionTabs extends LitElement {
  @property({ attribute: false }) tabs: SessionTab[] = [];
  @property({ attribute: false }) activeKey: string | undefined;
  /** Work-state dot per tab key, resolved by the host from live status/activity. */
  @property({ attribute: false }) statusByTab?: ReadonlyMap<string, SessionTabStatusKind>;
  @property({ attribute: false }) onActivate?: (tab: SessionTab) => void;
  @property({ attribute: false }) onClose?: (key: string) => void;
  @property({ attribute: false }) onTogglePin?: (key: string) => void;
  @property({ attribute: false }) onReorder?: (fromKey: string, targetKey?: string) => void;
  @query(".session-tabs") private sessionTabs?: HTMLElement | null;
  @state() private canScrollLeft = false;
  @state() private canScrollRight = false;
  @state() private draggedTab: SessionTab | undefined;
  @state() private dropTarget: DropTarget | undefined;
  private observedScroller: HTMLElement | undefined;
  private scrollerResizeObserver: ResizeObserver | undefined;

  override disconnectedCallback(): void {
    this.scrollerResizeObserver?.disconnect();
    this.scrollerResizeObserver = undefined;
    this.observedScroller = undefined;
    super.disconnectedCallback();
  }

  override firstUpdated(): void {
    this.observeScroller();
    this.updateScrollState();
  }

  override updated(): void {
    this.observeScroller();
    this.updateScrollState();
  }

  override render() {
    if (this.tabs.length === 0) return null;
    return html`
      <nav class=${this.frameClass()} aria-label="Visited sessions">
        <div
          class="session-tabs"
          @scroll=${this.onScroll}
          @dragover=${(event: DragEvent) => { this.onContainerDragOver(event); }}
          @drop=${(event: DragEvent) => { this.onContainerDrop(event); }}
        >
          ${this.tabs.map((tab) => this.renderTab(tab))}
        </div>
      </nav>
    `;
  }

  private renderTab(tab: SessionTab) {
    const key = tabKey(tab);
    const active = key === this.activeKey;
    const dragging = this.draggedTab !== undefined && tabKey(this.draggedTab) === key;
    const target = this.dropTarget;
    const dropBefore = target !== undefined && "beforeKey" in target && target.beforeKey === key;
    const dropAfter = target !== undefined && "atEnd" in target && key === this.lastSameSectionKey();
    const statusKind = this.statusByTab?.get(key);
    return html`
      <div
        class=${this.tabClass(tab, active, dragging, dropBefore, dropAfter)}
        draggable="true"
        data-tab-key=${key}
        data-pinned=${String(tab.pinned)}
        @dragstart=${(event: DragEvent) => { this.onDragStart(event, tab); }}
        @dragend=${() => { this.clearDrag(); }}
      >
        <button
          type="button"
          class="tab-pin"
          title=${tab.pinned ? "Unpin session tab" : "Pin session tab"}
          aria-label=${tab.pinned ? `Unpin ${tab.title}` : `Pin ${tab.title}`}
          aria-pressed=${String(tab.pinned)}
          @click=${(event: MouseEvent) => { event.stopPropagation(); this.onTogglePin?.(key); }}
        >${this.renderPinIcon(tab.pinned)}</button>
        <button
          type="button"
          class="tab-main"
          role="tab"
          aria-selected=${String(active)}
          aria-label=${this.tabAriaLabel(tab)}
          @click=${() => { this.onActivate?.(tab); }}
        >
          <span class="tab-title-line">
            ${this.renderStatusDot(statusKind)}
            <span class="tab-title">${tab.title}</span>
          </span>
          <span class="tab-project">${tab.projectLabel}</span>
        </button>
        <button
          type="button"
          class="tab-close"
          title="Close tab"
          aria-label=${`Close ${tab.title}`}
          @click=${(event: MouseEvent) => { event.stopPropagation(); this.onClose?.(key); }}
        >${this.renderCloseIcon()}</button>
      </div>
    `;
  }

  private renderStatusDot(kind: SessionTabStatusKind | undefined) {
    if (kind === undefined) return null;
    const label = kind === "active" ? "Session active" : kind === "waiting" ? "Waiting for response" : "Work complete";
    return html`<span class="tab-status-dot ${kind}" role="img" aria-label=${label} title=${label}></span>`;
  }

  private renderPinIcon(pinned: boolean) {
    return html`
      <svg class="pin-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-pinned=${String(pinned)}>
        <path d="M9 4h6l-1 5 3 3v2h-4v5l-1 1-1-1v-5H6v-2l3-3-1-5Z"></path>
      </svg>
    `;
  }

  private renderCloseIcon() {
    return html`
      <svg class="close-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 6l12 12M18 6 6 18"></path>
      </svg>
    `;
  }

  private tabClass(tab: SessionTab, active: boolean, dragging: boolean, dropBefore: boolean, dropAfter: boolean): string {
    return [
      "session-tab",
      active ? "active" : "",
      tab.pinned ? "pinned" : "",
      dragging ? "dragging" : "",
      dropBefore ? "drop-before" : "",
      dropAfter ? "drop-after" : "",
    ].filter((value) => value !== "").join(" ");
  }

  private tabAriaLabel(tab: SessionTab): string {
    return `${tab.title}, ${tab.projectLabel}`;
  }

  /** Key of the last tab in the dragged tab's own section, for the trailing-gap indicator. */
  private lastSameSectionKey(): string | undefined {
    const dragged = this.draggedTab;
    if (dragged === undefined) return undefined;
    const last = [...this.tabs].reverse().find((tab) => tab.pinned === dragged.pinned);
    return last === undefined ? undefined : tabKey(last);
  }

  private frameClass(): string {
    return `session-tabs-frame${this.canScrollLeft ? " can-scroll-left" : ""}${this.canScrollRight ? " can-scroll-right" : ""}`;
  }

  private onDragStart(event: DragEvent, tab: SessionTab): void {
    this.draggedTab = tab;
    this.dropTarget = undefined;
    if (event.dataTransfer !== null) {
      event.dataTransfer.effectAllowed = "move";
      // Firefox only fires a visible drag ghost after data is set on the transfer.
      event.dataTransfer.setData("text/plain", tabKey(tab));
    }
  }

  private onContainerDragOver(event: DragEvent): void {
    if (this.draggedTab === undefined) return;
    event.preventDefault();
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
    this.dropTarget = this.computeDropTarget(event.clientX);
  }

  private onContainerDrop(event: DragEvent): void {
    if (this.draggedTab === undefined) return;
    event.preventDefault();
    const target = this.computeDropTarget(event.clientX);
    const draggedKey = tabKey(this.draggedTab);
    this.clearDrag();
    const targetKey = target !== undefined && "beforeKey" in target ? target.beforeKey : undefined;
    this.onReorder?.(draggedKey, targetKey);
  }

  private clearDrag(): void {
    this.draggedTab = undefined;
    this.dropTarget = undefined;
  }

  /**
   * Resolve the drop slot from the pointer position: the first same-section tab
   * whose midpoint is to the right of the pointer gives a "before" target; past
   * every same-section tab the drop lands in the section's trailing gap. Tabs in
   * the other pinned section are ignored, so a drop can never cross the boundary.
   */
  private computeDropTarget(clientX: number): DropTarget | undefined {
    const tabs = this.sameSectionTabElements();
    if (tabs.length === 0) return undefined;
    for (const { key, el } of tabs) {
      const rect = el.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) {
        return { beforeKey: key };
      }
    }
    return { atEnd: true };
  }

  private sameSectionTabElements(): { key: string; el: HTMLElement }[] {
    const dragged = this.draggedTab;
    if (dragged === undefined) return [];
    const draggedKey = tabKey(dragged);
    const result: { key: string; el: HTMLElement }[] = [];
    for (const el of this.shadowRoot?.querySelectorAll<HTMLElement>(".session-tab") ?? []) {
      if (!(el instanceof HTMLElement)) continue;
      const key = el.dataset["tabKey"];
      if (key === undefined || key === draggedKey) continue;
      if (el.dataset["pinned"] === String(dragged.pinned)) result.push({ key, el });
    }
    return result;
  }

  private observeScroller(): void {
    const scroller = this.scrollerElement();
    if (this.observedScroller === scroller) return;
    this.scrollerResizeObserver?.disconnect();
    this.observedScroller = scroller;
    this.scrollerResizeObserver = undefined;
    if (scroller === undefined || typeof ResizeObserver === "undefined") return;
    this.scrollerResizeObserver = new ResizeObserver(() => { this.updateScrollState(); });
    this.scrollerResizeObserver.observe(scroller);
  }

  private updateScrollState(): void {
    const scroller = this.scrollerElement();
    const maxScrollLeft = scroller === undefined ? 0 : Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const canScrollLeft = scroller !== undefined && scroller.scrollLeft > 1;
    const canScrollRight = scroller !== undefined && maxScrollLeft - scroller.scrollLeft > 1;
    if (this.canScrollLeft !== canScrollLeft) this.canScrollLeft = canScrollLeft;
    if (this.canScrollRight !== canScrollRight) this.canScrollRight = canScrollRight;
  }

  private scrollerElement(): HTMLElement | undefined {
    const scroller = this.sessionTabs;
    return scroller instanceof HTMLElement ? scroller : undefined;
  }

  private readonly onScroll = () => {
    this.updateScrollState();
  };

  static override styles = css`
    :host { flex: 0 0 auto; min-width: 0; position: relative; z-index: 10; }
    .session-tabs-frame { position: relative; display: flex; flex: 0 0 auto; min-width: 0; border-bottom: 1px solid var(--pi-border-muted); background: var(--pi-bg); }
    .session-tabs-frame::before, .session-tabs-frame::after { content: ""; position: absolute; top: 0; bottom: 0; z-index: 2; width: 20px; opacity: 0; pointer-events: none; transition: opacity .15s ease; }
    .session-tabs-frame::before { left: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--pi-shadow-strong) 55%, transparent) 0%, transparent 100%); }
    .session-tabs-frame::after { right: 0; background: linear-gradient(270deg, color-mix(in srgb, var(--pi-shadow-strong) 55%, transparent) 0%, transparent 100%); }
    .session-tabs-frame.can-scroll-left::before, .session-tabs-frame.can-scroll-right::after { opacity: 1; }
    .session-tabs { flex: 1 1 auto; min-width: 0; display: flex; align-items: stretch; gap: 4px; padding: 6px 8px; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scroll-padding-inline: 8px; scrollbar-width: thin; }
    .session-tab { flex: 0 0 auto; min-width: 0; display: flex; align-items: stretch; border: 1px solid var(--pi-border-muted); border-radius: 8px; background: var(--pi-surface); cursor: grab; }
    .session-tab:active { cursor: grabbing; }
    .session-tab.active { border-color: var(--pi-accent); background: var(--pi-selection-bg); }
    .session-tab:focus-within { outline: 2px solid var(--pi-accent); outline-offset: -2px; }
    .session-tab.dragging { opacity: .4; }
    .session-tab.drop-before { box-shadow: inset 3px 0 0 var(--pi-accent); }
    .session-tab.drop-after { box-shadow: inset -3px 0 0 var(--pi-accent); }
    .tab-pin, .tab-close { flex: 0 0 auto; display: grid; place-items: center; border: 0; background: transparent; color: var(--pi-muted); padding: 0 6px; cursor: pointer; }
    .tab-pin { border-right: 1px solid var(--pi-border-muted); }
    .tab-close { border-left: 1px solid var(--pi-border-muted); }
    .tab-pin:hover, .tab-close:hover { background: var(--pi-surface-hover); color: var(--pi-text); }
    .pin-icon { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; opacity: .6; pointer-events: none; }
    .pin-icon[data-pinned="true"] { fill: currentColor; opacity: 1; color: var(--pi-accent); }
    .close-icon { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; pointer-events: none; }
    .tab-main { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 0; border: 0; background: transparent; color: var(--pi-text); padding: 4px 8px; font: inherit; text-align: left; cursor: pointer; }
    .tab-main:hover { background: var(--pi-surface-hover); }
    .tab-title-line { min-width: 0; display: flex; align-items: center; gap: 4px; }
    .tab-status-dot { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; }
    .tab-status-dot.active { background: var(--pi-success); animation: pulse 1s ease-in-out infinite; }
    .tab-status-dot.waiting { background: var(--pi-warning); }
    .tab-status-dot.complete { background: var(--pi-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--pi-accent) 20%, transparent); }
    .tab-title { min-width: 0; max-width: 18em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    @keyframes pulse { 0%, 100% { transform: scale(.75); opacity: .55; } 50% { transform: scale(1.2); opacity: 1; } }
    .tab-project { min-width: 0; max-width: 18em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pi-muted); font-size: .8em; line-height: 1.2; }
    .session-tab.active .tab-title { color: var(--pi-accent); }
  `;
}
