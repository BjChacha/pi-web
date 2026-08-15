// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import type { SessionStatus } from "../api";
import { StatusBar } from "./StatusBar";

afterEach(() => {
  document.body.replaceChildren();
});

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
  };
}

describe("StatusBar token rate", () => {
  it("renders the token rate when the status carries one", async () => {
    const statusBar = new StatusBar();
    statusBar.status = { ...status(), tokenRate: 18.4 };
    document.body.appendChild(statusBar);
    await statusBar.updateComplete;

    const rate = statusBar.shadowRoot?.querySelector(".rate");
    expect(rate?.textContent).toBe("18.4/s");
    expect(rate?.getAttribute("title")).toContain("Tokens per second");
  });

  it("renders large rates in compact k/s form", async () => {
    const statusBar = new StatusBar();
    statusBar.status = { ...status(), tokenRate: 1234 };
    document.body.appendChild(statusBar);
    await statusBar.updateComplete;

    expect(statusBar.shadowRoot?.querySelector(".rate")?.textContent).toBe("1.2k/s");
  });

  it("omits the rate span when the status has no rate", async () => {
    const statusBar = new StatusBar();
    statusBar.status = status();
    document.body.appendChild(statusBar);
    await statusBar.updateComplete;

    expect(statusBar.shadowRoot?.querySelector(".rate")).toBeNull();
  });
});
