import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PiSessionService } from "./piSessionService.js";
import { CapturingSessionEventHub, fakeRuntime, fakeSessionManager, runtimeCreator, sessionGateway, sessionRecord, sessionRef, testModelRuntime } from "./piSessionService.testSupport.js";

const TEST_AGENT_DIR = "/tmp/pi-web-test-agent";
const T0 = new Date("2026-01-01T00:00:00.000Z");

function assistantMessageStart(): unknown {
  return { type: "message_start", message: { role: "assistant", content: [] } };
}

function textDelta(delta: string, outputTokens: number): unknown {
  return {
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", delta },
    message: { role: "assistant", content: [], usage: { output: outputTokens, input: 0, cacheRead: 0, cacheWrite: 0, totalTokens: outputTokens, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } },
  };
}

function assistantMessageEnd(outputTokens: number): unknown {
  return {
    type: "message_end",
    message: { role: "assistant", content: [], usage: { output: outputTokens, input: 0, cacheRead: 0, cacheWrite: 0, totalTokens: outputTokens, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } },
  };
}

describe("PiSessionService token rate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function tokenRateService(patch: Parameters<typeof fakeRuntime>[1] = {}) {
    const fake = fakeRuntime("session-1", {
      sessionFile: "/tmp/session-1.jsonl",
      sessionManager: fakeSessionManager("/workspace"),
      ...patch,
    });
    const events = new CapturingSessionEventHub();
    const service = new PiSessionService(events, {
      agentDir: TEST_AGENT_DIR,
      modelRuntime: testModelRuntime,
      createAgentRuntime: runtimeCreator(fake.runtime),
      sessionManager: sessionGateway([sessionRecord("session-1")]),
      heartbeatIntervalMs: 60_000,
    });
    return { fake, service };
  }

  async function status(service: PiSessionService): Promise<number | undefined> {
    return (await service.status(sessionRef("session-1"))).tokenRate;
  }

  it("omits the rate until the first measured message", async () => {
    const { fake, service } = tokenRateService();
    await service.status(sessionRef("session-1")); // bring the session online

    fake.emit({ type: "agent_start" });
    expect(await status(service)).toBeUndefined();

    await service.dispose();
  });

  it("reports the live rate from real cumulative usage while streaming", async () => {
    const { fake, service } = tokenRateService();
    await service.status(sessionRef("session-1"));

    fake.emit(assistantMessageStart());
    fake.emit(textDelta("Hello", 5));
    vi.setSystemTime(T0.getTime() + 1000);
    fake.emit(textDelta(" world", 10));

    expect(await status(service)).toBeCloseTo(10, 5);

    await service.dispose();
  });

  it("hides the live rate inside the startup jitter window", async () => {
    const { fake, service } = tokenRateService();
    await service.status(sessionRef("session-1"));

    fake.emit(assistantMessageStart());
    fake.emit(textDelta("Hello", 5));
    vi.setSystemTime(T0.getTime() + 100);

    expect(await status(service)).toBeUndefined();

    await service.dispose();
  });

  it("falls back to a chars/4 estimate when the provider omits live usage", async () => {
    const { fake, service } = tokenRateService();
    await service.status(sessionRef("session-1"));

    fake.emit(assistantMessageStart());
    fake.emit(textDelta("x".repeat(40), 0)); // no usage reported
    vi.setSystemTime(T0.getTime() + 1000);

    expect(await status(service)).toBeCloseTo(10, 5);

    await service.dispose();
  });

  it("keeps the last completed message's real average rate when idle", async () => {
    const { fake, service } = tokenRateService();
    await service.status(sessionRef("session-1"));

    fake.emit(assistantMessageStart());
    fake.emit(textDelta("first half", 60));
    vi.setSystemTime(T0.getTime() + 2000);
    fake.emit(textDelta("second half", 120));
    fake.emit(assistantMessageEnd(120));
    vi.setSystemTime(T0.getTime() + 5000); // idle; elapsed no longer grows the rate

    expect(await status(service)).toBeCloseTo(60, 5);

    await service.dispose();
  });

  it("resets the streaming window per assistant message", async () => {
    const { fake, service } = tokenRateService();
    await service.status(sessionRef("session-1"));

    fake.emit(assistantMessageStart());
    fake.emit(textDelta("first", 20));
    vi.setSystemTime(T0.getTime() + 1000);
    fake.emit(assistantMessageEnd(20));
    fake.emit(assistantMessageStart());
    fake.emit(textDelta("second", 5));
    vi.setSystemTime(T0.getTime() + 1500);

    // The new message's window restarts at its first delta, not at the old one's.
    expect(await status(service)).toBeCloseTo(10, 5);

    await service.dispose();
  });

  it("ignores non-assistant message boundaries", async () => {
    const { fake, service } = tokenRateService();
    await service.status(sessionRef("session-1"));

    fake.emit({ type: "message_start", message: { role: "user", content: [{ type: "text", text: "hi" }] } });
    fake.emit({ type: "message_end", message: { role: "user", content: [{ type: "text", text: "hi" }] } });

    expect(await status(service)).toBeUndefined();

    await service.dispose();
  });
});
