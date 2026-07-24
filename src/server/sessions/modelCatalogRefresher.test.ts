import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelCatalogRefresher } from "./modelCatalogRefresher.js";

interface RefreshCall {
  allowNetwork?: boolean;
  signal?: AbortSignal;
}

interface RefreshResult {
  aborted: boolean;
  errors: Map<string, Error>;
}

const okResult = (): RefreshResult => ({ aborted: false, errors: new Map<string, Error>() });

function deferred<T>() {
  let resolveValue: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolveValue = resolve;
  });
  return { promise, resolve: resolveValue };
}

function createRuntime() {
  const calls: RefreshCall[] = [];
  const refresh = vi.fn((options?: RefreshCall) => {
    calls.push(options ?? {});
    return Promise.resolve(okResult());
  });
  return { refresh, calls };
}

function createLogger() {
  const warn = vi.fn();
  const error = vi.fn();
  return { logger: { warn, error }, warn, error };
}

/** Let a started refresh run to completion, including the finally-queue bookkeeping. */
async function flushMicrotasks(rounds = 5): Promise<void> {
  for (let index = 0; index < rounds; index++) await Promise.resolve();
}

describe("ModelCatalogRefresher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a bounded network refresh when one is requested", async () => {
    const runtime = createRuntime();
    const refresher = new ModelCatalogRefresher({ runtime });

    refresher.requestRefresh();
    await flushMicrotasks();

    expect(runtime.refresh).toHaveBeenCalledOnce();
    const call = runtime.calls.at(0);
    expect(call?.allowNetwork).toBe(true);
    expect(call?.signal).toBeInstanceOf(AbortSignal);
    refresher.dispose();
  });

  it("coalesces overlapping requests into a single follow-up run", async () => {
    const gate = deferred<RefreshResult>();
    const refresh = vi.fn()
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValue(okResult());
    const refresher = new ModelCatalogRefresher({ runtime: { refresh } });

    refresher.requestRefresh();
    refresher.requestRefresh();
    refresher.requestRefresh();
    expect(refresh).toHaveBeenCalledOnce();

    gate.resolve(okResult());
    await flushMicrotasks();

    expect(refresh).toHaveBeenCalledTimes(2);
    refresher.dispose();
  });

  it("refreshes after the initial delay and then on the interval", async () => {
    const runtime = createRuntime();
    const refresher = new ModelCatalogRefresher({ runtime, initialDelayMs: 1_000, intervalMs: 60_000 });
    refresher.start();

    await vi.advanceTimersByTimeAsync(999);
    expect(runtime.refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(runtime.refresh).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(runtime.refresh).toHaveBeenCalledTimes(2);
    refresher.dispose();
  });

  it("stops scheduling refreshes after dispose", async () => {
    const runtime = createRuntime();
    const refresher = new ModelCatalogRefresher({ runtime, initialDelayMs: 1_000, intervalMs: 60_000 });
    refresher.start();
    refresher.dispose();

    await vi.advanceTimersByTimeAsync(120_000);
    expect(runtime.refresh).not.toHaveBeenCalled();
  });

  it("does not run a queued follow-up after dispose", async () => {
    const gate = deferred<RefreshResult>();
    const refresh = vi.fn().mockImplementation(() => gate.promise);
    const refresher = new ModelCatalogRefresher({ runtime: { refresh } });

    refresher.requestRefresh();
    refresher.requestRefresh();
    refresher.dispose();
    gate.resolve(okResult());
    await flushMicrotasks();

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("warns and keeps going when a refresh is aborted by its timeout", async () => {
    const { logger, warn, error } = createLogger();
    const refresh = vi.fn(() => Promise.resolve({ aborted: true, errors: new Map<string, Error>() }));
    const refresher = new ModelCatalogRefresher({ runtime: { refresh }, logger });

    refresher.requestRefresh();
    await flushMicrotasks();

    expect(warn).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    refresher.dispose();
  });

  it("warns with provider details when a refresh reports provider errors", async () => {
    const { logger, warn } = createLogger();
    const errors = new Map<string, Error>([["openrouter", new Error("boom")]]);
    const refresh = vi.fn(() => Promise.resolve({ aborted: false, errors }));
    const refresher = new ModelCatalogRefresher({ runtime: { refresh }, logger });

    refresher.requestRefresh();
    await flushMicrotasks();

    expect(warn).toHaveBeenCalledWith(
      { providers: ["openrouter: boom"] },
      "model catalog refresh failed for some providers; keeping cached catalogs",
    );
    refresher.dispose();
  });

  it("logs and swallows a rejecting refresh so timers stay alive", async () => {
    const { logger, error } = createLogger();
    const failure = new Error("refresh exploded");
    const refresh = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(okResult());
    const refresher = new ModelCatalogRefresher({ runtime: { refresh }, logger, initialDelayMs: 1_000, intervalMs: 60_000 });

    refresher.requestRefresh();
    await flushMicrotasks();

    expect(error).toHaveBeenCalledWith({ err: failure }, "model catalog refresh failed; keeping cached catalogs");

    refresher.start();
    await vi.advanceTimersByTimeAsync(61_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    refresher.dispose();
  });
});
