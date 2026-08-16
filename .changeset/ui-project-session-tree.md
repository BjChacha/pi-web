---
"@jmfederico/pi-web": patch
---

Replace the stacked projects/workspaces/sessions side panel sections with a single project-session tree: single-workspace projects show their sessions directly under the project, and only multi-worktree projects keep the workspace level. Browsing a project or workspace in the tree loads its topology and session snapshot without switching the active session, and the panel strings follow the interface language setting.
