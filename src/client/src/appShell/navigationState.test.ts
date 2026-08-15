import { describe, expect, it } from "vitest";
import { defaultNavigationSection, expandedNavigationSection, isNavigationSectionCollapsed, toggleCollapsedNavigationSection, toggleNavigationSection } from "./navigationState";

describe("navigationState", () => {
  it("defaults to the project-session tree", () => {
    expect(defaultNavigationSection()).toBe("tree");
  });

  it("expands the default section until the user explicitly toggles a section", () => {
    expect(expandedNavigationSection(undefined)).toBe("tree");
    expect(expandedNavigationSection("machines")).toBe("machines");
    expect(expandedNavigationSection("none")).toBeUndefined();
  });

  it("uses the mobile accordion state on mobile layouts", () => {
    expect(isNavigationSectionCollapsed("tree", { isMobileLayout: true, expanded: "machines" })).toBe(true);
    expect(isNavigationSectionCollapsed("tree", { isMobileLayout: true, expanded: "tree" })).toBe(false);
  });

  it("uses independent collapsed sections on desktop layouts", () => {
    expect(isNavigationSectionCollapsed("tree", { isMobileLayout: false, expanded: "machines" })).toBe(false);
    expect(isNavigationSectionCollapsed("tree", { isMobileLayout: false, expanded: "machines", collapsedSections: ["tree"] })).toBe(true);
    expect(isNavigationSectionCollapsed("machines", { isMobileLayout: false, expanded: "machines", collapsedSections: ["tree"] })).toBe(false);
  });

  it("toggles the effective mobile section, including the implicit default section", () => {
    expect(toggleNavigationSection(undefined, "tree", { isMobileLayout: true })).toBe("none");
    expect(toggleNavigationSection("none", "tree", { isMobileLayout: true })).toBe("tree");
    expect(toggleNavigationSection("machines", "tree", { isMobileLayout: true })).toBe("tree");
  });

  it("does not mutate expanded section on desktop layouts", () => {
    expect(toggleNavigationSection("machines", "machines", { isMobileLayout: false })).toBe("machines");
  });

  it("toggles desktop sections independently", () => {
    expect(toggleCollapsedNavigationSection([], "tree")).toEqual(["tree"]);
    expect(toggleCollapsedNavigationSection(["machines", "tree"], "tree")).toEqual(["machines"]);
    expect(toggleCollapsedNavigationSection(["machines"], "tree")).toEqual(["machines", "tree"]);
  });
});
