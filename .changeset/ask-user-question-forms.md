---
"@jmfederico/pi-web": patch
---

Add an `ask_user` session tool that lets agents post structured question sets as one browser form. Agents end their run while the form waits; users can submit full or partial answers, unanswered questions are reported explicitly, pending forms survive browser and web/API reconnects, and closed forms remain readable in the transcript. Disable the tool with `askUser: false` or `PI_WEB_ASK_USER=false`.
