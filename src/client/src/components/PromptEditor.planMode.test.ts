import { describe, expect, it } from "vitest";
import type { SlashCommand } from "../api";
import { planModeCommandName } from "./PromptEditor";

function extension(name: string, description?: string): SlashCommand {
  return { name, source: "extension", ...(description === undefined ? {} : { description }) };
}

describe("planModeCommandName", () => {
  it("finds the canonical plan extension command", () => {
    expect(planModeCommandName([extension("plan")])).toBe("plan");
  });

  it("finds the plan-mode variant", () => {
    expect(planModeCommandName([extension("other"), extension("plan-mode")])).toBe("plan-mode");
  });

  it("ignores a builtin command named plan", () => {
    expect(planModeCommandName([{ name: "plan", source: "builtin" }])).toBeUndefined();
  });

  it("ignores non-plan extension commands", () => {
    expect(planModeCommandName([extension("tree"), extension("compact"), extension("plans")])).toBeUndefined();
  });

  it("returns undefined for an empty command list", () => {
    expect(planModeCommandName([])).toBeUndefined();
  });
});
