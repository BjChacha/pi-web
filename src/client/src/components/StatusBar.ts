import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { SessionStatus } from "../api";
import { formatCost, formatTokenCount, formatTokenRate } from "../utils/format";
import { t } from "../i18n";
import { LocaleController } from "../i18n/controller";
import { renderSessionWarningIcon, statusBarStyles } from "./shared";

export interface StatusBarWarningControlContent {
  countText: string;
  accessibleLabel: string;
}

export function statusBarWarningControlContent(count: number, expanded: boolean): StatusBarWarningControlContent | undefined {
  if (!Number.isInteger(count) || count <= 0) return undefined;
  const warningText = `${String(count)} ${count === 1 ? "warning" : "warnings"}`;
  return {
    countText: String(count),
    accessibleLabel: expanded ? `Minimise ${warningText}` : `Show ${warningText} in the warning area`,
  };
}

@customElement("status-bar")
export class StatusBar extends LitElement {
  private readonly locale = new LocaleController(this);
  @property({ attribute: false }) status?: SessionStatus;
  @property({ type: Number }) warningCount = 0;
  @property({ type: Boolean }) warningsExpanded = false;
  @property({ attribute: false }) onToggleWarnings?: () => void;

  private readonly handleToggleWarnings = (): void => {
    this.onToggleWarnings?.();
  };

  override render() {
    const status = this.status;
    if (status === undefined) return html`<div class="bar muted">${t("status.none")}</div>`;
    const context = status.contextUsage;
    const contextText = context
      ? context.percent == null
        ? t("status.contextWindow", { size: formatTokenCount(context.contextWindow) })
        : `${context.percent.toFixed(1)}%/${formatTokenCount(context.contextWindow)}`
      : t("status.contextUnknown");
    const tokens = status.tokens;
    const warningControl = statusBarWarningControlContent(this.warningCount, this.warningsExpanded);
    return html`
      <div class="bar">
        ${warningControl === undefined || this.onToggleWarnings === undefined ? null : html`
          <button
            type="button"
            class="warning-toggle"
            title=${warningControl.accessibleLabel}
            aria-label=${warningControl.accessibleLabel}
            aria-expanded=${String(this.warningsExpanded)}
            @click=${this.handleToggleWarnings}
          >
            ${renderSessionWarningIcon("warning", "warning-toggle-icon")}
            <span>${warningControl.countText}</span>
          </button>
        `}
        <span title=${t("status.tokensTitle", { direction: "in" })}>↑${formatTokenCount(tokens.input)}</span>
        <span title=${t("status.tokensTitle", { direction: "out" })}>↓${formatTokenCount(tokens.output)}</span>
        ${status.tokenRate === undefined ? null : html`<span class="rate" title=${t("status.rateTitle")}>${formatTokenRate(status.tokenRate)}</span>`}
        <span class="context" title=${contextText}>${contextText}</span>
        <span title=${t("status.costTitle")}>${formatCost(status.cost)}</span>
        ${status.pendingMessageCount > 0 ? html`<span>${t("status.queued", { count: status.pendingMessageCount })}</span>` : null}
      </div>
    `;
  }

  static override styles = statusBarStyles;
}
