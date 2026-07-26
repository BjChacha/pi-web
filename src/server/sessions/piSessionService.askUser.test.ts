import { describe, expect, it, vi } from "vitest";
import { createPiWebCustomToolDefinitions, PiSessionService } from "./piSessionService.js";
import { PendingAskStore, PendingAskValidationError } from "./pendingAskStore.js";
import { CapturingSessionEventHub, emptyArchiveStore, sessionGateway, testModelRuntime } from "./piSessionService.testSupport.js";

const TEST_AGENT_DIR = "/tmp/pi-web-test-agent";

const questions = [{ id: "db", question: "Which database?", options: [{ value: "pg", label: "Postgres" }] }];

function askService() {
  const store = new PendingAskStore({
    now: () => new Date("2026-02-01T10:00:00.000Z"),
    createAskId: (() => {
      let next = 0;
      return () => { next += 1; return `ask-${next.toString()}`; };
    })(),
  });
  const service = new PiSessionService(new CapturingSessionEventHub(), {
    agentDir: TEST_AGENT_DIR,
    modelRuntime: testModelRuntime,
    sessionManager: sessionGateway([]),
    archiveStore: emptyArchiveStore(),
    pendingAskStore: store,
    askUserEnabled: true,
    heartbeatIntervalMs: 60_000,
  });
  return { service, store };
}

describe("ask_user registration", () => {
  it("offers ask_user whenever the capability is configured, including to restricted tracked children", () => {
    const askUser = { open: vi.fn() };

    const unrestricted = createPiWebCustomToolDefinitions("/workspace", true, undefined, undefined, askUser);
    const restricted = createPiWebCustomToolDefinitions("/workspace", false, undefined, undefined, askUser);

    expect(unrestricted.map((definition) => definition.name)).toEqual(["edit", "ask_user"]);
    expect(restricted.map((definition) => definition.name)).toEqual(["edit", "ask_user"]);
  });

  it("omits ask_user when the capability is disabled", () => {
    const definitions = createPiWebCustomToolDefinitions("/workspace", true);

    expect(definitions.map((definition) => definition.name)).toEqual(["edit"]);
  });
});

describe("PiSessionService.openAsk", () => {
  it("registers the question set as the session's open ask", async () => {
    const { service, store } = askService();

    const result = await service.openAsk({ sessionId: "session-1", questions });

    expect(result.ask).toMatchObject({ askId: "ask-1", askedAt: "2026-02-01T10:00:00.000Z" });
    expect(result).not.toHaveProperty("superseded");
    expect(store.pendingAsk("session-1")).toMatchObject({ askId: "ask-1" });
    await service.dispose();
  });

  it("supersedes the session's earlier unanswered ask and reports its outcome", async () => {
    const { service, store } = askService();
    await service.openAsk({ sessionId: "session-1", questions });

    const result = await service.openAsk({ sessionId: "session-1", questions: [{ id: "again", question: "Still?", options: [], allowOther: true }] });

    expect(result.ask.askId).toBe("ask-2");
    expect(result.superseded).toMatchObject({ askId: "ask-1", reason: "superseded", answeredCount: 0, unansweredIds: ["db"] });
    expect(store.pendingAsk("session-1")).toMatchObject({ askId: "ask-2" });
    await service.dispose();
  });

  it("keeps asks of different sessions independent", async () => {
    const { service, store } = askService();

    await service.openAsk({ sessionId: "session-1", questions });
    const other = await service.openAsk({ sessionId: "session-2", questions });

    expect(other).not.toHaveProperty("superseded");
    expect(store.pendingAsk("session-1")).toMatchObject({ askId: "ask-1" });
    expect(store.pendingAsk("session-2")).toMatchObject({ askId: "ask-2" });
    await service.dispose();
  });

  it("rejects an unanswerable question set without opening it", async () => {
    const { service, store } = askService();

    await expect(service.openAsk({ sessionId: "session-1", questions: [{ id: "empty", question: "No way to answer?", options: [] }] }))
      .rejects.toThrow(PendingAskValidationError);
    expect(store.pendingAsk("session-1")).toBeUndefined();
    await service.dispose();
  });
});
