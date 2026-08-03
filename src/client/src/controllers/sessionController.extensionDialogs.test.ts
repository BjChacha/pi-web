import { describe, expect, it } from "vitest";
import { initialAppState } from "../appState";
import type { ExtensionDialogCloseResponse, ExtensionDialogKind, PendingExtensionDialog } from "../api";
import type { ChatLine } from "../components/shared";
import { SessionController } from "./sessionController";
import { defaultApi, EmitSocket, emptyPage, FakeSocket, oldSession, status, workspace, type AppState, type SessionStatus } from "./sessionController.testSupport";

type ExtensionDialogRecord = Extract<ChatLine["parts"][number], { type: "extensionDialogRecord" }>;

/** Closed extension-dialog outcomes are appended to the transcript as records. */
function closedDialogRecords(messages: ChatLine[]): { dialog: PendingExtensionDialog; reason: ExtensionDialogRecord["reason"]; answer?: ExtensionDialogRecord["answer"] }[] {
  return messages.flatMap((message) => message.parts.filter((part): part is ExtensionDialogRecord => part.type === "extensionDialogRecord").map((part) => ({
    dialog: part.dialog,
    reason: part.reason,
    ...(part.answer === undefined ? {} : { answer: part.answer }),
  })));
}

function dialog(dialogId: string, kind: ExtensionDialogKind = "confirm"): PendingExtensionDialog {
  return {
    dialogId,
    kind,
    title: `Dialog ${dialogId}`,
    ...(kind === "confirm" ? { message: "Are you sure?" } : {}),
    ...(kind === "select" ? { options: ["Postgres", "SQLite"] } : {}),
    ...(kind === "input" ? { placeholder: "type here" } : {}),
    askedAt: "2026-07-20T00:00:00.000Z",
    runScoped: true,
  };
}

function statusWithDialogs(sessionId: string, pendingDialogs: PendingExtensionDialog[]): SessionStatus {
  return { ...status(sessionId), pendingDialogs };
}

function closeResponse(sessionStatus: SessionStatus, dialogId = "dialog-1"): ExtensionDialogCloseResponse {
  return {
    result: "closed",
    outcome: {
      dialogId,
      reason: "answered",
      answer: true,
      askedAt: "2026-07-20T00:00:00.000Z",
      closedAt: "2026-07-20T00:01:00.000Z",
    },
    sessionStatus,
  };
}

function selectedState(patch: Partial<AppState> = {}): AppState {
  return {
    ...initialAppState(),
    selectedWorkspace: workspace,
    selectedSession: oldSession,
    sessions: [oldSession],
    ...patch,
  };
}

function selectableApi(sessionStatus: SessionStatus): typeof defaultApi {
  return {
    ...defaultApi,
    messages: () => Promise.resolve(emptyPage),
    status: () => Promise.resolve(sessionStatus),
    streamSnapshot: () => Promise.resolve({ seq: 0, partial: null }),
    thinkingLevels: () => Promise.resolve({ levels: [] }),
  };
}

interface LiveHarness {
  controller: SessionController;
  socket: EmitSocket;
  state: () => AppState;
}

async function liveSession(patch: Partial<AppState> = {}, sessionStatus = status(oldSession.id)): Promise<LiveHarness> {
  const socket = new EmitSocket();
  let state = selectedState({ selectedSession: undefined, ...patch });
  const controller = new SessionController(
    () => state,
    (statePatch) => { state = { ...state, ...statePatch }; },
    () => undefined,
    undefined,
    { api: selectableApi(sessionStatus), socket },
  );
  await controller.selectSession(oldSession, { updateUrl: false });
  return { controller, socket, state: () => state };
}

describe("SessionController extension dialog state", () => {
  it("rehydrates open dialogs from the daemon-owned status on selection", async () => {
    const pending = [dialog("dialog-1"), dialog("dialog-2", "select")];

    const harness = await liveSession({}, statusWithDialogs(oldSession.id, pending));

    expect(harness.state().pendingDialogs).toEqual(pending);
    expect(closedDialogRecords(harness.state().messages)).toEqual([]);
  });

  it("opens and closes cards from live dialog events without superseding other dialogs", async () => {
    const harness = await liveSession();

    harness.socket.emit({ type: "dialog.opened", dialog: dialog("dialog-1") });
    harness.socket.emit({ type: "dialog.opened", dialog: dialog("dialog-2", "input") });
    expect(harness.state().pendingDialogs.map((pending) => pending.dialogId)).toEqual(["dialog-1", "dialog-2"]);

    harness.socket.emit({ type: "dialog.closed", dialogId: "dialog-1", reason: "answered", answer: true });
    expect(harness.state().pendingDialogs.map((pending) => pending.dialogId)).toEqual(["dialog-2"]);
  });

  it("appends the closed dialog's outcome to the transcript so the card can render what happened", async () => {
    const harness = await liveSession();

    harness.socket.emit({ type: "dialog.opened", dialog: dialog("dialog-1", "select") });
    harness.socket.emit({ type: "dialog.closed", dialogId: "dialog-1", reason: "answered", answer: "SQLite" });

    expect(closedDialogRecords(harness.state().messages)).toEqual([{ dialog: dialog("dialog-1", "select"), reason: "answered", answer: "SQLite" }]);
  });

  it("records a close without an answer for cancel-like reasons", async () => {
    const harness = await liveSession();

    harness.socket.emit({ type: "dialog.opened", dialog: dialog("dialog-1") });
    harness.socket.emit({ type: "dialog.closed", dialogId: "dialog-1", reason: "aborted" });

    expect(closedDialogRecords(harness.state().messages)).toEqual([{ dialog: dialog("dialog-1"), reason: "aborted" }]);
  });

  it("ignores a close for a dialog that is not on screen", async () => {
    const harness = await liveSession();

    harness.socket.emit({ type: "dialog.opened", dialog: dialog("dialog-2") });
    harness.socket.emit({ type: "dialog.closed", dialogId: "dialog-1", reason: "cancelled" });

    expect(harness.state().pendingDialogs.map((pending) => pending.dialogId)).toEqual(["dialog-2"]);
    expect(closedDialogRecords(harness.state().messages)).toEqual([]);
  });

  it("does not duplicate a card when the open frame is already reflected", async () => {
    const harness = await liveSession({}, statusWithDialogs(oldSession.id, [dialog("dialog-1")]));

    harness.socket.emit({ type: "dialog.opened", dialog: dialog("dialog-1") });

    expect(harness.state().pendingDialogs).toHaveLength(1);
  });

  it("does not duplicate a closed dialog's transcript record", async () => {
    const harness = await liveSession();

    harness.socket.emit({ type: "dialog.opened", dialog: dialog("dialog-1") });
    harness.socket.emit({ type: "dialog.closed", dialogId: "dialog-1", reason: "answered", answer: true });
    // The answering browser's own close lands first; the daemon's dialog.closed
    // event must not append the record a second time.
    harness.socket.emit({ type: "dialog.closed", dialogId: "dialog-1", reason: "answered", answer: true });

    expect(closedDialogRecords(harness.state().messages)).toHaveLength(1);
  });

  it("applies a status that no longer carries a dialog as the authoritative close", async () => {
    const harness = await liveSession({}, statusWithDialogs(oldSession.id, [dialog("dialog-1")]));
    expect(harness.state().pendingDialogs).toHaveLength(1);

    harness.controller.applySessionStatus(status(oldSession.id));

    expect(harness.state().pendingDialogs).toEqual([]);
  });

  it("does not adopt another session's open dialogs", async () => {
    const harness = await liveSession();

    harness.controller.applySessionStatus(statusWithDialogs("other-session", [dialog("dialog-1")]));

    expect(harness.state().pendingDialogs).toEqual([]);
  });

  it("clears dialog records from the transcript when the session is deselected", async () => {
    const harness = await liveSession({}, statusWithDialogs(oldSession.id, [dialog("dialog-1"), dialog("dialog-2")]));
    harness.socket.emit({ type: "dialog.closed", dialogId: "dialog-1", reason: "cancelled" });
    expect(closedDialogRecords(harness.state().messages)).toHaveLength(1);

    harness.controller.deselectSession({ updateUrl: false });

    expect(harness.state().pendingDialogs).toEqual([]);
    expect(closedDialogRecords(harness.state().messages)).toEqual([]);
  });

  it("preserves dialog records across a transcript refresh", async () => {
    const harness = await liveSession({}, statusWithDialogs(oldSession.id, [dialog("dialog-1")]));
    harness.socket.emit({ type: "dialog.closed", dialogId: "dialog-1", reason: "answered", answer: true });
    expect(closedDialogRecords(harness.state().messages)).toHaveLength(1);
    const beforeRefresh = harness.state().messages;

    await harness.controller.refreshSelectedSession(oldSession.id);

    // A refresh rebuilds the transcript from the daemon page; the local dialog
    // record must be re-applied so it is not lost mid-session.
    expect(closedDialogRecords(harness.state().messages)).toHaveLength(1);
    expect(harness.state().messages).not.toBe(beforeRefresh);
  });
});

describe("SessionController extension dialog answers", () => {
  it("answers a dialog, records the outcome in the transcript, and applies the returned status", async () => {
    const answerCalls: { dialogId: string; value: unknown; machineId: string }[] = [];
    const closedStatus = status(oldSession.id);
    let state = selectedState({ status: statusWithDialogs(oldSession.id, [dialog("dialog-1")]), pendingDialogs: [dialog("dialog-1")] });
    const api: typeof defaultApi = {
      ...defaultApi,
      answerDialog: (_session, dialogId, value, machineId) => {
        answerCalls.push({ dialogId, value, machineId: machineId ?? "local" });
        return Promise.resolve(closeResponse(closedStatus));
      },
    };
    const controller = new SessionController(
      () => state,
      (patch) => { state = { ...state, ...patch }; },
      () => undefined,
      undefined,
      { api, socket: new FakeSocket() },
    );

    await controller.answerDialog("dialog-1", true);

    expect(answerCalls).toEqual([{ dialogId: "dialog-1", value: true, machineId: "local" }]);
    expect(closedDialogRecords(state.messages)).toEqual([{ dialog: dialog("dialog-1"), reason: "answered", answer: true }]);
    expect(state.pendingDialogs).toEqual([]);
    expect(state.status).toEqual(closedStatus);
  });

  it("cancels a dialog through its own route", async () => {
    const cancelCalls: string[] = [];
    let state = selectedState({ pendingDialogs: [dialog("dialog-1")] });
    const api: typeof defaultApi = {
      ...defaultApi,
      cancelDialog: (_session, dialogId) => {
        cancelCalls.push(dialogId);
        return Promise.resolve({
          result: "closed" as const,
          outcome: { dialogId, reason: "cancelled" as const, askedAt: "2026-07-20T00:00:00.000Z", closedAt: "2026-07-20T00:01:00.000Z" },
          sessionStatus: status(oldSession.id),
        });
      },
    };
    const controller = new SessionController(
      () => state,
      (patch) => { state = { ...state, ...patch }; },
      () => undefined,
      undefined,
      { api, socket: new FakeSocket() },
    );

    await controller.cancelDialog("dialog-1");

    expect(cancelCalls).toEqual(["dialog-1"]);
    expect(closedDialogRecords(state.messages)).toEqual([{ dialog: dialog("dialog-1"), reason: "cancelled" }]);
    expect(state.pendingDialogs).toEqual([]);
  });

  it("trusts the status of a stale close without an error or an outcome record", async () => {
    let state = selectedState({ pendingDialogs: [dialog("dialog-1")] });
    const api: typeof defaultApi = {
      ...defaultApi,
      answerDialog: () => Promise.resolve({ result: "stale", sessionStatus: statusWithDialogs(oldSession.id, [dialog("dialog-2")]) }),
    };
    const controller = new SessionController(
      () => state,
      (patch) => { state = { ...state, ...patch }; },
      () => undefined,
      undefined,
      { api, socket: new FakeSocket() },
    );

    await controller.answerDialog("dialog-1", true);

    expect(state.error).toBe("");
    expect(closedDialogRecords(state.messages)).toEqual([]);
    expect(state.pendingDialogs.map((pending) => pending.dialogId)).toEqual(["dialog-2"]);
  });

  it("keeps the dialog open and reports the failure when the answer request fails", async () => {
    let state = selectedState({ pendingDialogs: [dialog("dialog-1")] });
    const api: typeof defaultApi = { ...defaultApi, answerDialog: () => Promise.reject(new Error("answer failed")) };
    const controller = new SessionController(
      () => state,
      (patch) => { state = { ...state, ...patch }; },
      () => undefined,
      undefined,
      { api, socket: new FakeSocket() },
    );

    await controller.answerDialog("dialog-1", true);

    expect(state.error).toBe("Error: answer failed");
    expect(state.pendingDialogs.map((pending) => pending.dialogId)).toEqual(["dialog-1"]);
    expect(closedDialogRecords(state.messages)).toEqual([]);
  });

  it("does not answer for an archived session", async () => {
    const archived = { ...oldSession, archived: true as const };
    let state = selectedState({ selectedSession: archived, sessions: [archived] });
    let answered = false;
    const api: typeof defaultApi = {
      ...defaultApi,
      answerDialog: () => {
        answered = true;
        return Promise.resolve(closeResponse(status(oldSession.id)));
      },
    };
    const controller = new SessionController(
      () => state,
      (patch) => { state = { ...state, ...patch }; },
      () => undefined,
      undefined,
      { api, socket: new FakeSocket() },
    );

    await controller.answerDialog("dialog-1", true);

    expect(answered).toBe(false);
  });
});
