import { describe, expect, it } from "vitest";
import { initialAppState } from "../appState";
import { SessionController } from "./sessionController";
import { FakeSocket, oldSession, type AppState, type SessionInfo } from "./sessionController.testSupport";

describe("SessionController session rename", () => {
  it("notifies onSessionInfoChanged with the renamed session", () => {
    const changed: SessionInfo[] = [];
    let state: AppState = { ...initialAppState(), selectedSession: oldSession, sessions: [oldSession] };
    const controller = new SessionController(
      () => state,
      (patch) => { state = { ...state, ...patch }; },
      () => undefined,
      undefined,
      { socket: new FakeSocket(), onSessionInfoChanged: (session) => { changed.push(session); } },
    );

    controller.applyGlobalEvent({ type: "session.name", sessionId: oldSession.id, name: "Renamed" });

    expect(changed).toHaveLength(1);
    expect(changed[0]?.id).toBe(oldSession.id);
    expect(changed[0]?.name).toBe("Renamed");
  });

  it("clears the name when the rename event carries undefined", () => {
    const changed: SessionInfo[] = [];
    const named: SessionInfo = { ...oldSession, name: "Old Name" };
    let state: AppState = { ...initialAppState(), selectedSession: named, sessions: [named] };
    const controller = new SessionController(
      () => state,
      (patch) => { state = { ...state, ...patch }; },
      () => undefined,
      undefined,
      { socket: new FakeSocket(), onSessionInfoChanged: (session) => { changed.push(session); } },
    );

    controller.applyGlobalEvent({ type: "session.name", sessionId: named.id });

    expect(changed).toHaveLength(1);
    expect(changed[0]?.name).toBeUndefined();
  });

  it("does not notify when the renamed session is not in the current listing", () => {
    const changed: SessionInfo[] = [];
    let state: AppState = { ...initialAppState(), sessions: [oldSession] };
    const controller = new SessionController(
      () => state,
      (patch) => { state = { ...state, ...patch }; },
      () => undefined,
      undefined,
      { socket: new FakeSocket(), onSessionInfoChanged: (session) => { changed.push(session); } },
    );

    controller.applyGlobalEvent({ type: "session.name", sessionId: "elsewhere-session", name: "Renamed" });

    expect(changed).toHaveLength(0);
  });
});
