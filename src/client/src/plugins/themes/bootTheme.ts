// Pre-paint boot theming. The Vite boot plugin serializes resolveBootScheme()
// into an inline <head> script (via Function.prototype.toString), so this
// function must stay self-contained: no imports, no closure variables, no
// TypeScript syntax that survives only via types. It mirrors
// resolveThemePreference() in ../../theme.ts for the shipped theme set:
//
// - auto + paired pi-web theme  -> pair member chosen by the system scheme
// - manual (auto off)           -> the selected theme itself
// - auto + classic/unknown      -> the fallback classic theme, which is dark

export function resolveBootScheme(themeId: string | undefined, auto: boolean, prefersLight: boolean): "dark" | "light" {
  if (themeId === "themes:pi-web-dark" || themeId === "themes:pi-web-light") {
    if (!auto) return themeId === "themes:pi-web-light" ? "light" : "dark";
    return prefersLight ? "light" : "dark";
  }
  return "dark";
}
