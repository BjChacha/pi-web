import type { Dictionary } from "./locale";

/**
 * Source-of-truth UI strings. Keys are flat dotted paths so `t()` stays fully
 * typed via `keyof typeof en`. Every user-visible string migrated here must
 * keep its English wording; other locales override a subset and fall back to
 * these values per key.
 */
export const en = {
  "settings.general.heading": "General configuration",
  "settings.general.description": "Gateway server fields edit this local gateway. File access and upload defaults edit {target}.",
  "settings.general.reload": "Reload",
  "settings.interface.heading": "Interface",
  "settings.interface.description": "Browser-local preferences. Changes apply immediately.",
  "settings.interface.language": "Language",
  "settings.interface.languageSystem": "Follow browser",
  "settings.interface.languageHint": "Choose the display language for the PI WEB interface.",
} satisfies Dictionary;

export type MessageKey = keyof typeof en;
