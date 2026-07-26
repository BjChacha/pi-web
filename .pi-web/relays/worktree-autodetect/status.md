# Status — relay "worktree-autodetect"

## 🏁 FINISHED — the relay reached its finish line

All three legs are complete and committed on `feat/worktree-autodetect`. `npm run verify` is
green. No further leg was spawned; leg 3 was the last one by design.

Remaining human action: review the branch and merge it. Nothing is blocked.

## Current position

Every charter finish-line condition is satisfied:

1. ✅ **Prunable worktrees hidden** — `266f941`. `discoverGitWorktrees` parses `prunable`;
   `WorkspaceService` filters those worktrees out, while always keeping the project's own
   worktree so a project is never empty.
2. ✅ **Non-disruptive client refresh** — `d0f8f9f`.
   `WorkspaceController.refreshSelectedProjectTopology()` applies results through
   `applyProjectWorkspaces` only, never `selectWorkspace`, so selection, session, file tree,
   git status, and terminal selection survive. A vanished selected workspace is left alone
   for the existing deletion path to handle.
3. ✅ **Wired to the existing resume path** — `84545fb`. Called from
   `PiWebApp.refreshAfterBrowserResume` and `refreshAppData`. No new timer, watcher,
   process, endpoint, or push channel. Remote machines work through the existing
   `machinePrefix` + `FEDERATED_HTTP_ROUTES` plumbing.
4. ✅ **Tests** — prunable parsing/filtering (`gitWorktreeDiscovery.test.ts`,
   `workspaceService.test.ts`), refresh-preserves-selection and
   refresh-when-selected-workspace-disappeared (`workspaceController.test.ts`, 7 tests),
   resume + app-data wiring (`PiWebApp.workspaceTopology.test.ts`, 3 tests).
5. ✅ **`npm run verify` green** (228 files / 1840 passed, 2 skipped) and
   `.changeset/worktree-autodetect.md` exists.

Nothing in this work touched `src/server/sessiond.ts`, session runtime ownership, or the
daemon protocol. **No manual session daemon restart is required.**

## Leg tracking

- **Last completed leg:** 3 (final — wiring, docs, changeset, full verify)
- **Next leg to run:** none. Relay complete; do not spawn another runner.

## Shipped behavior, as a user sees it

A worktree created or deleted outside PI WEB shows up in (or disappears from) the workspace
list the next time the browser tab regains focus or becomes visible. Detection is
resume-scoped, not instant, by explicit human decision. A worktree whose checkout directory
was `rm -rf`ed no longer appears as a selectable workspace. Documented in `docs/faq.html`
under `#worktree-list-out-of-date`.

## Relevant context if anyone picks this branch up

- Commits: `266f941` (server filter), `d0f8f9f` (client refresh method),
  `84545fb` (wiring + docs + changeset), plus three `docs(relay)` packet commits.
- The invariant to protect on any future edit: **never route a background topology refresh
  through `selectWorkspace`.** It calls `clearActiveSession()` and
  `resetWorkspaceScopedState()` with no already-selected guard, which would close the session
  socket and blank the chat on every browser resume. `workspaceController.test.ts` was
  mutation-checked against exactly that regression in leg 2.
- The relay packet lives under `.pi-web/`, which is gitignored; packet commits used
  `git add -f`.

## Blockers

None. No intervention signal fired in any leg. The one serious known risk — visible UI churn
on refresh — did not materialize and needed no workaround.
