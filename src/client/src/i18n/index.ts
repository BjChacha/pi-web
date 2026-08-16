import { en, type MessageKey } from "./en";
import { zhCN } from "./zh-CN";
import { isLocalePreference, resolveLocale, type Dictionary, type Locale, type LocalePreference } from "./locale";

export { isLocalePreference, resolveLocale } from "./locale";
export type { Locale, LocalePreference } from "./locale";
export type { MessageKey } from "./en";

export const LOCALE_STORAGE_KEY = "pi-web-app-locale";

const dictionaries: Record<Locale, Partial<Record<MessageKey, string>>> = { en, "zh-CN": zhCN };

// Widen the literal en dictionary so lookups through stringly keys (future
// plugin dictionaries) stay type-honest without assertions.
const enDictionary: Dictionary = en;

const localeListeners = new Set<() => void>();

// English until initLocale() reads the stored/system preference; initLocale()
// runs in main.ts before the first render, so users never see the default
// leak into the UI.
let activeLocale: Locale = "en";

export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * Look up a message from a locale dictionary, falling back per key to English
 * and to the key itself for unknown keys. The loose index signature makes this
 * the boundary future plugin dictionaries can call through without assertions.
 */
export function resolveMessageFrom(source: Readonly<Record<string, string | undefined>>, key: string): string {
  return source[key] ?? enDictionary[key] ?? key;
}

/** Look up a message for a locale, falling back per key to English. */
export function resolveMessage(locale: Locale, key: MessageKey): string {
  return resolveMessageFrom(dictionaries[locale], key);
}

/** Translate a key with optional `{name}` placeholder interpolation. */
export function t(key: MessageKey, params?: MessageParams): string {
  const template = resolveMessage(activeLocale, key);
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/gu, (placeholder, name: string) =>
    params[name] === undefined ? placeholder : String(params[name]),
  );
}

export function currentLocale(): Locale {
  return activeLocale;
}

/** The stored preference, or "system" when nothing valid is stored. */
export function localePreference(): LocalePreference {
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return value !== null && isLocalePreference(value) ? value : "system";
  } catch {
    return "system";
  }
}

/**
 * Apply a preference: persist it, update the document language, and notify
 * subscribed hosts. "system" clears the stored override.
 */
export function setLocale(preference: LocalePreference): Locale {
  try {
    if (preference === "system") window.localStorage.removeItem(LOCALE_STORAGE_KEY);
    else window.localStorage.setItem(LOCALE_STORAGE_KEY, preference);
  } catch {
    // Ignore storage failures; the change still applies for this tab.
  }
  return applyLocale(preference);
}

/** Resolve and apply the stored or system preference at app startup. */
export function initLocale(): Locale {
  return applyLocale(localePreference());
}

function applyLocale(preference: LocalePreference): Locale {
  const locale = resolveLocale(preference, navigator.language);
  activeLocale = locale;
  document.documentElement.lang = locale;
  for (const listener of localeListeners) listener();
  return locale;
}

export function onLocaleChange(listener: () => void): void {
  localeListeners.add(listener);
}

/** Whether a string is a known dictionary key (used to resolve plugin titles). */
export function isMessageKey(value: string): value is MessageKey {
  return value in en;
}

export function offLocaleChange(listener: () => void): void {
  localeListeners.delete(listener);
}
