import type { PiWebPlugin } from "../types";
import { piWebDarkTokens, piWebLightTokens, classicTokens } from "./palettes";

export const themePackPlugin: PiWebPlugin = {
  apiVersion: 1,
  name: "PI WEB Themes",
  activate: () => ({
    contributions: {
      themes: [
        {
          id: "pi-web-dark",
          name: "PI WEB Dark",
          description: "Warm dark PI WEB palette.",
          order: 10,
          colorScheme: "dark",
          tokens: piWebDarkTokens,
        },
        {
          id: "pi-web-light",
          name: "PI WEB Light",
          description: "Warm light PI WEB palette.",
          order: 20,
          colorScheme: "light",
          tokens: piWebLightTokens,
        },
        {
          id: "classic",
          name: "PI WEB Classic",
          description: "The original PI WEB dark palette.",
          order: 30,
          colorScheme: "dark",
          tokens: classicTokens,
        },
      ],
      themePairs: [
        {
          id: "pi-web",
          name: "PI WEB",
          description: "Follow the system light/dark preference with PI WEB themes.",
          order: 10,
          light: "pi-web-light",
          dark: "pi-web-dark",
        },
      ],
    },
  }),
};
