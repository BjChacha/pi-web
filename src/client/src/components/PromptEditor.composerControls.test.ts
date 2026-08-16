// @vitest-environment happy-dom
// Covers the merged send/stop control and the toolbar-row attach button in the
// card composer: render the real component and interact with its buttons.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionStatus } from "../api";
import { PromptEditor } from "./PromptEditor";

afterEach(() => {
  document.body.replaceChildren();
});

describe("prompt-editor composer controls", () => {
  it("shows the attach button in the toolbar row above the editor", async () => {
    const editor = await mountedEditor();
    const tools = editor.shadowRoot?.querySelector(".composer-tools");
    if (!(tools instanceof HTMLElement)) throw new Error("expected a composer tools row");

    const attach = tools.querySelector(".attach-button");
    if (!(attach instanceof HTMLButtonElement)) throw new Error("expected an attach button in the tools row");
    const input = editor.shadowRoot?.querySelector(".attachment-input");
    if (!(input instanceof HTMLInputElement)) throw new Error("expected the hidden attachment input");
    const openPicker = vi.spyOn(input, "click");
    attach.click();
    expect(openPicker).toHaveBeenCalledTimes(1);
    expect(editor.shadowRoot?.querySelector(".editor-wrap .attach-button")).toBeNull();
  });

  it("renders the send button when idle and swaps to a single stop button while work is running", async () => {
    const editor = await mountedEditor();
    await expectButtons(editor, { send: true, stop: false });

    editor.canStop = true;
    await editor.updateComplete;
    await expectButtons(editor, { send: false, stop: true });

    editor.canStop = false;
    editor.isCompacting = true;
    editor.canSteer = true;
    await editor.updateComplete;
    await expectButtons(editor, { send: true, stop: false });
  });

  it("forwards send and stop through the merged button", async () => {
    const editor = await mountedEditor();
    const onSend = vi.fn();
    const onStop = vi.fn();
    editor.onSend = onSend;
    editor.onStop = onStop;
    editor.replaceText("hello");

    editor.shadowRoot?.querySelector<HTMLButtonElement>(".send-button")?.click();
    expect(onSend).toHaveBeenCalledTimes(1);

    editor.canStop = true;
    await editor.updateComplete;
    editor.shadowRoot?.querySelector<HTMLButtonElement>(".stop-button")?.click();
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});

async function mountedEditor(): Promise<PromptEditor> {
  const editor = new PromptEditor();
  editor.sessionId = "s1";
  editor.status = sessionStatus();
  document.body.append(editor);
  await editor.updateComplete;
  return editor;
}

async function expectButtons(editor: PromptEditor, expected: { send: boolean; stop: boolean }): Promise<void> {
  await editor.updateComplete;
  const send = editor.shadowRoot?.querySelector(".send-button") ?? null;
  const stop = editor.shadowRoot?.querySelector(".stop-button") ?? null;
  expect(send !== null).toBe(expected.send);
  expect(stop !== null).toBe(expected.stop);
}

function sessionStatus(): SessionStatus {
  return {
    sessionId: "s1",
    isStreaming: false,
    isCompacting: false,
    isBashRunning: false,
    pendingMessageCount: 0,
    queuedMessages: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    cost: 0,
  };
}
