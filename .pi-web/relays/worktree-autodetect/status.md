# Status — relay "worktree-autodetect"

## 🏁 FINISHED — the relay reached its finish line

All three legs are complete and committed on `feat/worktree-autodetect`. `npm run verify` is
green. No further leg was spawned; leg 3 was the last one by design.

Remaining human action: review the branch and merge it. Nothing is blocked.

## Post-relay review fix

A human review question after leg 3 ("do we have pragmatic reasonable and stable code?")
found one real gap, fixed in `79577e4`: `applyProjectWorkspaces` replaced the list but left
`selectedWorkspace` pointing at the old object, so a branch switched inside a worktree
outside PI WEB showed the new name in the list and the old one in the collapsed Workspaces
header and mobile context bar. Now re-pointed by id, and skipped entirely when metadata is
unchanged so a normal resume does not churn identity. Two tests added (9 total in
`workspaceController.test.ts`), each mutation-checked in both directions. `npm run verify`
green: 1842 passed, 2 skipped.

Reviewed and deliberately left alone: `locked` is parsed but unconsumed (it documents the
kept-worktree policy and is pinned by a `workspaceService` test), and the two refresh entry
points are not deduped across each other (idempotent, stale-guarded, ~2ms).

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
  `84545fb` (wiring + docs + changeset), `79577e4` (selected-workspace freshness fix),
  plus the `docs(relay)` packet commits.
- Second invariant, added by `79577e4`: re-pointing `selectedWorkspace` is safe **only**
  while it is keyed by `id` and skipped on unchanged metadata. Keying it by anything that can
  differ between two lists would change the selection on a background refresh; dropping the
  unchanged-metadata guard would push a new object into state on every browser focus.
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
