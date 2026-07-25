---
"@jmfederico/pi-web": patch
---

Fix multi-minute stalls when opening the model selector, starting sessions, or using the auth dialogs. Provider model catalogs are no longer fetched on request paths: the session daemon now refreshes them in the background on a bounded schedule — shortly after startup and hourly, plus immediately after a provider login or logout — with a per-run timeout and a single retry, keeping the stored catalogs when a provider fails. Setting `PI_WEB_OFFLINE` or `PI_OFFLINE` disables these background refreshes entirely. See the configuration reference for details.
