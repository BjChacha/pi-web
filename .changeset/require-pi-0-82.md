---
"@jmfederico/pi-web": patch
---

Require Pi Coding Agent `>=0.82.1 <0.83`. PI WEB no longer supports Pi 0.81 and earlier, so update Pi before updating PI WEB. On Pi 0.82 provider model catalogs revalidate with the server instead of downloading in full when nothing changed, and newly published catalog updates are no longer suppressed for a while after a fresh install.
