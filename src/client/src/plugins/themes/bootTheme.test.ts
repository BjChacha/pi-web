import { describe, expect, it } from "vitest";
import { resolveBootScheme } from "./bootTheme";

describe("resolveBootScheme", () => {
  it("resolves the auto dark-theme preference by the system scheme", () => {
    expect(resolveBootScheme("themes:pi-web-dark", true, false)).toBe("dark");
    expect(resolveBootScheme("themes:pi-web-dark", true, true)).toBe("light");
  });

  it("resolves the auto light-theme preference by the system scheme", () => {
    expect(resolveBootScheme("themes:pi-web-light", true, false)).toBe("dark");
    expect(resolveBootScheme("themes:pi-web-light", true, true)).toBe("light");
  });

  it("keeps a manually selected theme on its own scheme", () => {
    expect(resolveBootScheme("themes:pi-web-light", false, false)).toBe("light");
    expect(resolveBootScheme("themes:pi-web-dark", false, true)).toBe("dark");
  });

  it("boots dark for classic and unknown themes regardless of auto", () => {
    expect(resolveBootScheme("themes:classic", true, true)).toBe("dark");
    expect(resolveBootScheme("themes:classic", false, true)).toBe("dark");
    expect(resolveBootScheme("themes:missing", false, true)).toBe("dark");
    expect(resolveBootScheme(undefined, true, true)).toBe("dark");
  });
});
