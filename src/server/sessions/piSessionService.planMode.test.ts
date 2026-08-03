import { describe, expect, it } from "vitest";
import { PiSessionService } from "./piSessionService.js";
import { CapturingSessionEventHub, fakeRuntime, fakeSessionManager, runtimeCreator, sessionGateway, sessionRecord, sessionRef, testModelRuntime } from "./piSessionService.testSupport.js";

const TEST_AGENT_DIR = "/tmp/pi-web-test-agent";

interface PlanModeOptions {
	activeToolNames?: readonly string[];
	planEntries?: readonly unknown[];
}

function planEntry(data: unknown): unknown {
	return { type: "custom", customType: "plan-mode", data };
}

describe("PiSessionService plan mode", () => {
	function planModeService(options: PlanModeOptions = {}) {
		const fake = fakeRuntime("session-1", {
			sessionFile: "/tmp/session-1.jsonl",
			sessionManager: fakeSessionManager("/workspace", options.planEntries === undefined ? {} : { getEntries: () => options.planEntries ?? [] }),
			getActiveToolNames: () => [...(options.activeToolNames ?? ["edit", "write"])],
		});
		const events = new CapturingSessionEventHub();
		const service = new PiSessionService(events, {
			agentDir: TEST_AGENT_DIR,
			modelRuntime: testModelRuntime,
			createAgentRuntime: runtimeCreator(fake.runtime),
			sessionManager: sessionGateway([sessionRecord("session-1")]),
			heartbeatIntervalMs: 60_000,
		});
		return { service };
	}

	async function planModeActive(service: PiSessionService): Promise<boolean | undefined> {
		return (await service.status(sessionRef("session-1"))).planModeActive;
	}

	// The persisted entry is the live source: pi-plan-mode writes it immediately
	// on toggle via appendEntry, while setActiveTools only runs on the next
	// before_agent_start. So the entry must win even when write tools are still
	// in the active set.
	it("reads the persisted plan-mode entry's active flag even while write tools are still active", async () => {
		const { service } = planModeService({
			activeToolNames: ["read", "bash", "edit", "write"],
			planEntries: [planEntry({ active: true, timestamp: "2026-01-01T00:00:00.000Z" })],
		});
		expect(await planModeActive(service)).toBe(true);
		await service.dispose();
	});

	it("reads active=false from the persisted entry", async () => {
		const { service } = planModeService({
			planEntries: [planEntry({ active: false, timestamp: "2026-01-01T00:00:00.000Z" })],
		});
		expect(await planModeActive(service)).toBe(false);
		await service.dispose();
	});

	it("supports the official plan-mode entry's enabled flag", async () => {
		const { service } = planModeService({
			planEntries: [planEntry({ enabled: true })],
		});
		expect(await planModeActive(service)).toBe(true);
		await service.dispose();
	});

	it("uses the latest plan-mode entry when several exist", async () => {
		const { service } = planModeService({
			planEntries: [
				planEntry({ active: true }),
				planEntry({ active: false }),
				planEntry({ active: true }),
			],
		});
		expect(await planModeActive(service)).toBe(true);
		await service.dispose();
	});

	it("falls back to the active tool set when no plan-mode entry is persisted", async () => {
		const { service } = planModeService({
			activeToolNames: ["read", "bash", "grep", "find", "ls"],
		});
		expect(await planModeActive(service)).toBe(true);
		await service.dispose();
	});

	it("falls back to the tool set when the entry has no usable flag", async () => {
		const { service } = planModeService({
			activeToolNames: ["read", "bash"],
			planEntries: [planEntry({})],
		});
		expect(await planModeActive(service)).toBe(true);
		await service.dispose();
	});

	it("reports inactive when write tools are active and there is no entry", async () => {
		const { service } = planModeService({
			activeToolNames: ["read", "bash", "edit", "write"],
		});
		expect(await planModeActive(service)).toBe(false);
		await service.dispose();
	});

	it("omits the flag when neither the entry nor the tool set can determine it", async () => {
		const { service } = planModeService({
			activeToolNames: [],
		});
		expect(await planModeActive(service)).toBeUndefined();
		await service.dispose();
	});
});
