import { describe, expect, it } from "vitest";
import { resolveMessage, resolveMessageFrom, t } from "./index";
import { en } from "./en";
import { resolveLocale } from "./locale";

describe("resolveLocale", () => {
  it("follows the browser language for the system preference", () => {
    expect(resolveLocale("system", "zh-CN")).toBe("zh-CN");
    expect(resolveLocale("system", "zh-TW")).toBe("zh-CN");
    expect(resolveLocale("system", "en-US")).toBe("en");
    expect(resolveLocale("system", "de-DE")).toBe("en");
  });

  it("keeps an explicit preference regardless of the browser language", () => {
    expect(resolveLocale("zh-CN", "en-US")).toBe("zh-CN");
    expect(resolveLocale("en", "zh-CN")).toBe("en");
  });
});

describe("resolveMessage", () => {
  it("returns the English source for the en locale", () => {
    expect(resolveMessage("en", "settings.interface.heading")).toBe("Interface");
  });

  it("returns the Chinese override for the zh-CN locale", () => {
    expect(resolveMessage("zh-CN", "settings.interface.heading")).toBe("界面");
  });

  it("returns the key itself for unknown keys", () => {
    expect(resolveMessageFrom({}, "settings.missing.key")).toBe("settings.missing.key");
  });
});

describe("resolveMessageFrom", () => {
  it("falls back per key to English when a locale dictionary has no override", () => {
    expect(resolveMessageFrom({}, "settings.interface.heading")).toBe(en["settings.interface.heading"]);
  });
});

describe("t", () => {
  it("translates without params in the default en locale", () => {
    expect(t("settings.general.heading")).toBe("General configuration");
  });

  it("interpolates params into placeholders", () => {
    expect(t("settings.general.description", { target: "Lab Mac" })).toBe(
      "Gateway server fields edit this local gateway. File access and upload defaults edit Lab Mac.",
    );
  });

  it("keeps the placeholder when a param is missing", () => {
    expect(t("settings.general.description", {})).toContain("{target}");
  });
});
