/** UI display languages PI WEB ships dictionaries for. */
export type Locale = "en" | "zh-CN";

/** A stored language preference; "system" follows the browser language. */
export type LocalePreference = Locale | "system";

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "zh-CN"];

/** Flat message dictionary keyed by dotted paths (source of truth: en). */
export type Dictionary = Record<string, string>;

export function isLocalePreference(value: string): value is LocalePreference {
  return value === "system" || SUPPORTED_LOCALES.some((locale) => locale === value);
}

/**
 * Resolve a preference to a concrete locale. The browser language is only
 * consulted for the "system" preference; zh* browsers get zh-CN, everything
 * else falls back to English.
 */
export function resolveLocale(preference: LocalePreference, navigatorLanguage: string): Locale {
  if (preference !== "system") return preference;
  return navigatorLanguage.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}
