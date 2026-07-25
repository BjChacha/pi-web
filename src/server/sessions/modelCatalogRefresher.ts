import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

/**
 * Matches pi's REMOTE_CATALOG_REFRESH_INTERVAL_MS: provider catalog entries in
 * models-store.json are treated as fresh for four hours.
 */
const DEFAULT_INTERVAL_MS = 4 * 60 * 60 * 1000;
/** Give the daemon a moment to finish startup before the first network refresh. */
const DEFAULT_INITIAL_DELAY_MS = 15_000;
/** Bound every catalog refresh so a stalled provider fetch can never block for minutes. */
const DEFAULT_TIMEOUT_MS = 15_000;

/** Minimal structured-logging seam for refresh lifecycle and non-fatal failures. */
export interface ModelCatalogRefresherLogger {
  info(details: Record<string, unknown>, message: string): void;
  warn(details: Record<string, unknown>, message: string): void;
  error(details: Record<string, unknown>, message: string): void;
}

export interface ModelCatalogRefresherOptions {
  runtime: Pick<ModelRuntime, "refresh">;
  logger?: ModelCatalogRefresherLogger;
  /**
   * When true the operator asked for offline behavior, so no network refresh is
   * ever attempted. Injected from the daemon environment instead of read from
   * `process.env` here, so the decision stays explicit and testable.
   */
  offline?: boolean;
  intervalMs?: number;
  initialDelayMs?: number;
  timeoutMs?: number;
}

const noopLogger: ModelCatalogRefresherLogger = {
  info() { /* no-op */ },
  warn() { /* no-op */ },
  error() { /* no-op */ },
};

/**
 * Refreshes provider model catalogs over the network on a background schedule.
 *
 * The shared ModelRuntime is constructed offline (see authService.ts), so its
 * own refreshes never touch the network and stay fast on request paths. This
 * refresher is the single place that deliberately performs network refreshes —
 * bounded by an abort timeout, serialized through one in-flight run, and off
 * any request path. `requestRefresh()` additionally asks for a prompt refresh
 * after events that change what should be listed, such as provider logins.
 *
 * When the operator asked for offline behavior (`PI_OFFLINE` / `PI_WEB_OFFLINE`),
 * the refresher performs no network I/O at all and the cached catalogs in
 * models-store.json are used as they are.
 */
export class ModelCatalogRefresher {
  private readonly runtime: Pick<ModelRuntime, "refresh">;
  private readonly logger: ModelCatalogRefresherLogger;
  private readonly offline: boolean;
  private readonly intervalMs: number;
  private readonly initialDelayMs: number;
  private readonly timeoutMs: number;
  private initialTimer?: NodeJS.Timeout;
  private intervalTimer?: NodeJS.Timeout;
  private inflight: Promise<void> | undefined;
  private queued = false;
  private disposed = false;

  constructor(options: ModelCatalogRefresherOptions) {
    this.runtime = options.runtime;
    this.logger = options.logger ?? noopLogger;
    this.offline = options.offline ?? false;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  start(): void {
    if (this.disposed) return;
    if (this.offline) {
      this.logger.info({}, "offline mode is enabled; skipping background model catalog refreshes");
      return;
    }
    this.initialTimer = setTimeout(() => { this.requestRefresh(); }, this.initialDelayMs);
    this.initialTimer.unref();
    this.intervalTimer = setInterval(() => { this.requestRefresh(); }, this.intervalMs);
    this.intervalTimer.unref();
  }

  /**
   * Ask for a refresh, coalescing concurrent and overlapping requests. A no-op
   * in offline mode, so auth changes never trigger network I/O either.
   */
  requestRefresh(): void {
    if (this.disposed || this.offline) return;
    if (this.inflight !== undefined) {
      this.queued = true;
      return;
    }
    const run = this.run();
    this.inflight = run;
    this.inflight.finally(() => {
      this.inflight = undefined;
      if (this.queued && !this.disposed) {
        this.queued = false;
        this.requestRefresh();
      }
    }).catch(() => { /* run() never rejects; finally() re-throws otherwise */ });
  }

  dispose(): void {
    this.disposed = true;
    if (this.initialTimer !== undefined) clearTimeout(this.initialTimer);
    if (this.intervalTimer !== undefined) clearInterval(this.intervalTimer);
  }

  private async run(): Promise<void> {
    try {
      const result = await this.runtime.refresh({ allowNetwork: true, signal: AbortSignal.timeout(this.timeoutMs) });
      if (result.aborted) {
        this.logger.warn({ timeoutMs: this.timeoutMs }, "model catalog refresh timed out; keeping cached catalogs");
      }
      if (result.errors.size > 0) {
        const providers = [...result.errors.entries()].map(([providerId, error]) => `${providerId}: ${error.message}`);
        this.logger.warn({ providers }, "model catalog refresh failed for some providers; keeping cached catalogs");
      }
    } catch (error: unknown) {
      this.logger.error({ err: error }, "model catalog refresh failed; keeping cached catalogs");
    }
  }
}
