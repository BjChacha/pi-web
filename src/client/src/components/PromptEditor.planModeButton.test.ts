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
	it("renders the toggle after model/thinking when a plan extension command is installed, and reflects the off state", async () => {
		vi.spyOn(api, "commands").mockResolvedValue([extension("plan")]);
		const onTogglePlan = vi.fn<(command: string) => void>();
		const editor = mountedEditor();
		editor.onTogglePlan = onTogglePlan;
		await editor.updateComplete;

		await vi.waitFor(() => {
			expect(
				editor.renderRoot.querySelector(".plan-mode-toggle"),
			).not.toBeNull();
		});
		const button =
			editor.renderRoot.querySelector<HTMLButtonElement>(".plan-mode-toggle");
		// Placed after model and thinking — the last button in the compact status.
		const buttons = editor.renderRoot.querySelectorAll(
			".compact-status > button",
		);
		expect(buttons[buttons.length - 1]).toBe(button);
		expect(button?.getAttribute("aria-label")).toBe(
			"Toggle plan mode, currently off",
		);
		expect(button?.getAttribute("aria-pressed")).toBe("false");
		expect(button?.classList.contains("active")).toBe(false);
		expect(api.commands).toHaveBeenCalledWith(
			{ id: "session-1", cwd: "/repo" },
			"remote-a",
		);
	});

	it("runs the detected command and flips to the active (on) state on click", async () => {
		vi.spyOn(api, "commands").mockResolvedValue([extension("plan")]);
		const onTogglePlan = vi.fn<(command: string) => void>();
		const editor = mountedEditor();
		editor.onTogglePlan = onTogglePlan;
		await editor.updateComplete;
		await vi.waitFor(() => {
			expect(
				editor.renderRoot.querySelector(".plan-mode-toggle"),
			).not.toBeNull();
		});

		editor.renderRoot
			.querySelector<HTMLButtonElement>(".plan-mode-toggle")
			?.click();
		await editor.updateComplete;

		const toggled =
			editor.renderRoot.querySelector<HTMLButtonElement>(".plan-mode-toggle");
		expect(onTogglePlan).toHaveBeenCalledWith("plan");
		expect(toggled?.classList.contains("active")).toBe(true);
		expect(toggled?.getAttribute("aria-pressed")).toBe("true");
		expect(toggled?.getAttribute("aria-label")).toBe(
			"Toggle plan mode, currently on",
		);
	});

	it("persists the active state and restores it when the session is re-selected", async () => {
		vi.spyOn(api, "commands").mockResolvedValue([extension("plan")]);
		const first = mountedEditor();
		await first.updateComplete;
		await vi.waitFor(() => {
			expect(
				first.renderRoot.querySelector(".plan-mode-toggle"),
			).not.toBeNull();
		});
		first.renderRoot
			.querySelector<HTMLButtonElement>(".plan-mode-toggle")
			?.click();
		await first.updateComplete;
		expect(localStorage.getItem("pi-web:plan-mode:remote-a:session-1")).toBe(
			"true",
		);

		const restored = mountedEditor();
		await restored.updateComplete;
		await vi.waitFor(() => {
			expect(
				restored.renderRoot.querySelector(".plan-mode-toggle.active"),
			).not.toBeNull();
		});
	});

	it("reflects the daemon's authoritative plan-mode state over the local view", async () => {
		vi.spyOn(api, "commands").mockResolvedValue([extension("plan")]);
		const editor = mountedEditor();
		await editor.updateComplete;
		await vi.waitFor(() => {
			expect(
				editor.renderRoot.querySelector(".plan-mode-toggle"),
			).not.toBeNull();
		});
		// Local view is off; the daemon reports on — the button follows the daemon.
		editor.status = { ...status(), planModeActive: true };
		await editor.updateComplete;

		const button =
			editor.renderRoot.querySelector<HTMLButtonElement>(".plan-mode-toggle");
		expect(button?.classList.contains("active")).toBe(true);
		expect(button?.getAttribute("aria-pressed")).toBe("true");
	});

	it("runs the detected command name when it differs from the canonical plan", async () => {
		vi.spyOn(api, "commands").mockResolvedValue([extension("plan-mode")]);
		const onTogglePlan = vi.fn<(command: string) => void>();
		const editor = mountedEditor();
		editor.onTogglePlan = onTogglePlan;
		await editor.updateComplete;

		await vi.waitFor(() => {
			expect(
				editor.renderRoot.querySelector(".plan-mode-toggle"),
			).not.toBeNull();
		});
		editor.renderRoot
			.querySelector<HTMLButtonElement>(".plan-mode-toggle")
			?.click();

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
		vi.spyOn(api, "commands").mockRejectedValue(
			new Error("commands unavailable"),
		);
		const editor = mountedEditor();
		await editor.updateComplete;
		await vi.waitFor(() => {
			expect(api.commands).toHaveBeenCalled();
		});

		expect(editor.renderRoot.querySelector(".plan-mode-toggle")).toBeNull();
	});

	it("re-checks for a plan command when the session changes", async () => {
		const commands = vi
			.spyOn(api, "commands")
			.mockResolvedValue([extension("plan")]);
		const editor = mountedEditor();
		await editor.updateComplete;
		await vi.waitFor(() => {
			expect(
				editor.renderRoot.querySelector(".plan-mode-toggle"),
			).not.toBeNull();
		});

		commands.mockResolvedValue([]);
		editor.sessionId = "session-2";
		await editor.updateComplete;
		await vi.waitFor(() => {
			expect(editor.renderRoot.querySelector(".plan-mode-toggle")).toBeNull();
		});
	});
});
