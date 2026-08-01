// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionStatus, SlashCommand } from "../api";
import { api } from "../api";
import { PromptEditor } from "./PromptEditor";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  localStorage.clear();
});

function extension(name: string): SlashCommand {
  return { name, source: "extension" };
}

function status(): SessionStatus {
  return {
    sessionId: "session-1",
    isStreaming: false,
    isCompacting: false,
    isBashRunning: false,
    pendingMessageCount: 0,
    queuedMessages: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    cost: 0,
    model: { provider: "anthropic", id: "claude-sonnet-4-5" },
    thinkingLevel: "off",
  };
}

function mountedEditor(): PromptEditor {
  const editor = new PromptEditor();
  document.body.appendChild(editor);
  editor.sessionId = "session-1";
  editor.cwd = "/repo";
  editor.machineId = "remote-a";
  editor.status = status();
  return editor;
}

describe("PromptEditor plan-mode toggle", () => {
  it("renders the toggle next to model/thinking when a plan extension command is installed and runs it on click", async () => {
    vi.spyOn(api, "commands").mockResolvedValue([extension("plan")]);
    const onTogglePlan = vi.fn<(command: string) => void>();
    const editor = mountedEditor();
    editor.onTogglePlan = onTogglePlan;
    await editor.updateComplete;

    await vi.waitFor(() => {
      expect(editor.renderRoot.querySelector(".plan-mode-toggle")).not.toBeNull();
    });
    const button = editor.renderRoot.querySelector<HTMLButtonElement>(".plan-mode-toggle");
    expect(button?.getAttribute("aria-label")).toBe("Toggle plan mode");
    button?.click();

    expect(onTogglePlan).toHaveBeenCalledWith("plan");
    expect(api.commands).toHaveBeenCalledWith({ id: "session-1", cwd: "/repo" }, "remote-a");
  });

  it("runs the detected command name when it differs from the canonical plan", async () => {
    vi.spyOn(api, "commands").mockResolvedValue([extension("plan-mode")]);
    const onTogglePlan = vi.fn<(command: string) => void>();
    const editor = mountedEditor();
    editor.onTogglePlan = onTogglePlan;
    await editor.updateComplete;

    await vi.waitFor(() => {
      expect(editor.renderRoot.querySelector(".plan-mode-toggle")).not.toBeNull();
    });
    editor.renderRoot.querySelector<HTMLButtonElement>(".plan-mode-toggle")?.click();

    expect(onTogglePlan).toHaveBeenCalledWith("plan-mode");
  });

  it("hides the toggle when no plan extension command is installed", async () => {
    vi.spyOn(api, "commands").mockResolvedValue([
      { name: "plan", source: "builtin" },
      extension("tree"),
      extension("compact"),
    ]);
    const editor = mountedEditor();
    await editor.updateComplete;
    await vi.waitFor(() => {
      expect(api.commands).toHaveBeenCalled();
    });

    expect(editor.renderRoot.querySelector(".plan-mode-toggle")).toBeNull();
  });

  it("hides the toggle when the command fetch fails", async () => {
    vi.spyOn(api, "commands").mockRejectedValue(new Error("commands unavailable"));
    const editor = mountedEditor();
    await editor.updateComplete;
    await vi.waitFor(() => {
      expect(api.commands).toHaveBeenCalled();
    });

    expect(editor.renderRoot.querySelector(".plan-mode-toggle")).toBeNull();
  });

  it("re-checks for a plan command when the session changes", async () => {
    const commands = vi.spyOn(api, "commands").mockResolvedValue([extension("plan")]);
    const editor = mountedEditor();
    await editor.updateComplete;
    await vi.waitFor(() => {
      expect(editor.renderRoot.querySelector(".plan-mode-toggle")).not.toBeNull();
    });

    commands.mockResolvedValue([]);
    editor.sessionId = "session-2";
    await editor.updateComplete;
    await vi.waitFor(() => {
      expect(editor.renderRoot.querySelector(".plan-mode-toggle")).toBeNull();
    });
  });
});
