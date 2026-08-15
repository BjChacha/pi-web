// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LOCALE_STORAGE_KEY, currentLocale, setLocale } from "../../i18n";
import { SettingsGeneralPanel } from "./SettingsGeneralPanel";

describe("settings-general-panel language switching", () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, "language", { value: "en-US", configurable: true });
  });

  afterEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
    setLocale("system");
  });

  it("renders the interface language card and switches copy to Chinese", async () => {
    const panel = new SettingsGeneralPanel();
    document.body.append(panel);
    await panel.updateComplete;

    const select = languageSelect(panel);
    expect(select.value).toBe("system");

    select.value = "zh-CN";
    select.dispatchEvent(new Event("change"));
    await panel.updateComplete;

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("zh-CN");
    expect(currentLocale()).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(frameHeading(panel)).toBe("通用配置");
    expect(interfaceCardText(panel)).toContain("语言");
  });

  it("clears the stored override when following the browser again", async () => {
    setLocale("zh-CN");
    const panel = new SettingsGeneralPanel();
    document.body.append(panel);
    await panel.updateComplete;

    expect(frameHeading(panel)).toBe("通用配置");

    const select = languageSelect(panel);
    select.value = "system";
    select.dispatchEvent(new Event("change"));
    await panel.updateComplete;

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
    expect(currentLocale()).toBe("en");
    expect(frameHeading(panel)).toBe("General configuration");
  });
});

function languageSelect(panel: SettingsGeneralPanel): HTMLSelectElement {
  const select = panel.shadowRoot?.querySelector("select");
  if (!(select instanceof HTMLSelectElement)) throw new Error("language select not found");
  return select;
}

function frameHeading(panel: SettingsGeneralPanel): string {
  const frame = panel.shadowRoot?.querySelector("settings-panel-frame");
  const heading = frame?.shadowRoot?.querySelector("h2");
  if (heading === null || heading === undefined) throw new Error("frame heading not found");
  return heading.textContent;
}

function interfaceCardText(panel: SettingsGeneralPanel): string {
  const card = panel.shadowRoot?.querySelector("section[aria-label='界面']");
  if (card === null || card === undefined) throw new Error("interface card not found");
  return card.textContent;
}
