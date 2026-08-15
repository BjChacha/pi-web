// @vitest-environment happy-dom
// Guards the custom-element registration chain: AppNavigationPanel must import
// ProjectSessionTree for its side effect (customElements.define). A plain value
// import whose only usages are type positions is stripped by the TS transform,
// leaving <project-session-tree> unregistered and the tree silently blank in
// the real browser — while direct-import tests keep passing. This file must
// not import ProjectSessionTree itself.
import { describe, expect, it } from "vitest";
import "./AppNavigationPanel";

describe("navigation panel element registration", () => {
  it("registers project-session-tree through AppNavigationPanel's module graph", () => {
    expect(typeof customElements.get("project-session-tree")).toBe("function");
    expect(typeof customElements.get("app-navigation-panel")).toBe("function");
  });
});
