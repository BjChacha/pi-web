// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import type { Machine, Project, Workspace } from "../../api";
import type { UnreadPresence } from "../../unreadPresence";
import { MachineList } from "../MachineList";
import { MachineSwitcher } from "../MachineSwitcher";
import { ProjectSessionTree } from "./ProjectSessionTree";
import { AppNavigationPanel, shouldShowMachinesSection } from "./AppNavigationPanel";

afterEach(() => {
  document.body.replaceChildren();
});

describe("shouldShowMachinesSection", () => {
  it("hides machine navigation when there is no machine choice", () => {
    expect(shouldShowMachinesSection([])).toBe(false);
    expect(shouldShowMachinesSection([machine("local")])).toBe(false);
  });

  it("shows machine navigation when there are multiple machines", () => {
    expect(shouldShowMachinesSection([machine("local"), machine("remote-a")])).toBe(true);
  });
});

describe("unread presence wiring", () => {
  it("feeds each unread presence slice to the matching navigation component", async () => {
    const unreadPresence: UnreadPresence = {
      machines: new Set(["remote-a"]),
      projects: new Set(["project-1"]),
      workspaces: new Set(["ws-1"]),
    };
    const panel = new AppNavigationPanel();
    panel.compact = true;
    panel.machines = [machine("local"), machine("remote-a")];
    panel.selectedMachine = machine("local");
    panel.projects = [project("project-1")];
    panel.workspacesByProjectId = { "project-1": [workspace("ws-1", "project-1")] };
    panel.unreadPresence = unreadPresence;
    document.body.append(panel);
    await panel.updateComplete;

    const switcher = panel.shadowRoot?.querySelector("machine-switcher");
    const machineList = panel.shadowRoot?.querySelector("machine-list");
    const tree = panel.shadowRoot?.querySelector("project-session-tree");
    if (!(switcher instanceof MachineSwitcher)) throw new Error("Expected machine-switcher section");
    if (!(machineList instanceof MachineList)) throw new Error("Expected machine-list section");
    if (!(tree instanceof ProjectSessionTree)) throw new Error("Expected project-session-tree section");

    expect(switcher.unreadMachineIds).toBe(unreadPresence.machines);
    expect(machineList.unreadMachineIds).toBe(unreadPresence.machines);
    expect(tree.unreadProjectIds).toBe(unreadPresence.projects);
  });
});

function machine(id: string): Machine {
  return {
    id,
    name: id,
    kind: id === "local" ? "local" : "remote",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
  };
}

function project(id: string): Project {
  return { id, name: id, path: `/repo/${id}`, createdAt: "2026-06-04T00:00:00.000Z" };
}

function workspace(id: string, projectId: string): Workspace {
  return { id, projectId, path: `/repo/${id}`, label: id, isMain: true, isGitRepo: true, isGitWorktree: false };
}
