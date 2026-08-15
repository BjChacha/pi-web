import { describe, expect, it } from "vitest";
import { initialAppState } from "../appState";
import { SessionController } from "./sessionController";
import { InMemorySessionSelectionMemory } from "./sessionSelection";
import { defaultApi, FakeSocket, oldSession, workspace, type AppState } from "./sessionController.testSupport";

describe("SessionController session removal notifications", () => {
  it("notifies onSessionRemoved with the archived session id", async () => {
    const removed: { sessionIds: string[]; machineId: string }[] = [];
    const api: typeof defaultApi = {
      ...defaultApi,
      archive: () => Promise.resolve({ archived: true }),
    };
    let state: AppState = { ...initialAppState(), selectedWorkspace: workspace, selectedSession: oldSession, sessions: [oldSession] };
    const controller = new SessionController(
      () => state,
      (patch) => { state = { ...state, ...patch }; },
      () => undefined,
      new InMemorySessionSelectionMemory(),
      { api, socket: new FakeSocket(), onSessionRemoved: (sessionIds, machineId) => { removed.push({ sessionIds, machineId }); } },
    );

    await controller.archiveSession(oldSession);

    expect(removed).toEqual([{ sessionIds: [oldSession.id], machineId: "local" }]);
  });

  it("notifies onSessionRemoved with deleted archived session ids", async () => {
    const removed: { sessionIds: string[]; machineId: string }[] = [];
    const archived = { ...oldSession, archived: true, archivedAt: "2026-01-01T00:00:00.000Z" };
    const api: typeof defaultApi = {
      ...defaultApi,
      deleteArchived: () => Promise.resolve({ deleted: true }),
    };
    let state: AppState = { ...initialAppState(), selectedWorkspace: workspace, sessions: [archived] };
    const controller = new SessionController(
      () => state,
      (patch) => { state = { ...state, ...patch }; },
      () => undefined,
      new InMemorySessionSelectionMemory(),
      { api, socket: new FakeSocket(), onSessionRemoved: (sessionIds, machineId) => { removed.push({ sessionIds, machineId }); } },
    );

    await controller.deleteArchivedSessions([archived]);

    expect(removed).toEqual([{ sessionIds: [oldSession.id], machineId: "local" }]);
  });
});
