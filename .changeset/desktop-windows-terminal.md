---
"@jmfederico/pi-web": patch
---

Spawn the terminal shell from the platform default on Windows (cmd.exe / PowerShell via COMSPEC) instead of failing on the missing /bin/bash, with a PI_WEB_SHELL override for custom shells.
