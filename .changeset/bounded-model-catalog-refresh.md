---
"@jmfederico/pi-web": patch
---

Fix multi-minute stalls when opening the model selector, starting sessions, or using the auth dialogs. Provider catalog refreshes no longer run unbounded network fetches on request paths: the shared model runtime now operates offline and pi-web refreshes provider catalogs itself on a bounded, background schedule and after provider logins.
