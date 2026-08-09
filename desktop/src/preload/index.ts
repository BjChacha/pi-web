import { contextBridge } from "electron";

/**
 * Minimal bridge into the desktop shell. The renderer is the unchanged Lit SPA
 * and never touches Node; this surface only lets it detect that it runs inside
 * PI WEB Desktop (to hide web-only affordances later) without leaking any
 * privileged capability.
 */
contextBridge.exposeInMainWorld("piWebDesktop", {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
