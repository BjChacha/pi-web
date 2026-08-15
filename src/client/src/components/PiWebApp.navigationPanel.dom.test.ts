// @vitest-environment happy-dom
// Lit raises duplicate-attribute-binding errors only when a TemplateResult is
// actually rendered, so the navigation panel template is rendered into a
// detached container. This guards against accidental duplicate bindings that
// blank the whole app after a panel rewrite.
import { render, type TemplateResult } from "lit";
import { describe, expect, it } from "vitest";
import { PiWebApp } from "./PiWebApp";

type RenderNavigationPanel = (this: PiWebApp) => TemplateResult;

describe("PiWebApp navigation panel template", () => {
  it("renders without duplicate attribute bindings", () => {
    const app = new PiWebApp();
    const method: unknown = Reflect.get(app, "renderNavigationPanel");
    if (!isRenderNavigationPanel(method)) throw new Error("PiWebApp.renderNavigationPanel was unavailable");

    const container = document.createElement("div");
    expect(() => {
      render(method.call(app), container);
    }).not.toThrow();
  });
});

function isRenderNavigationPanel(value: unknown): value is RenderNavigationPanel {
  return typeof value === "function";
}
