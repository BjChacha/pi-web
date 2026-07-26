# Status — relay "worktree-autodetect"

## ✅ APPROVED — relay is live

The human approved the reduced scope in leg 0 and answered every open question. There are
no outstanding decisions. Run leg 3 — the final leg.

## Current position

Legs 1 and 2 are complete and committed (`266f941`, `d0f8f9f`). The server hides prunable
worktrees, and the client now has a proven-inert refresh method. **Nothing calls it yet**,
so newly created worktrees still only appear on a full page load. Leg 3 wires the trigger
and is the last leg.

The design remains reduced scope: detection piggybacked on browser resume. No watchers,
no timers, no new processes, no new push channel. Breakdown is in `plan.md`.

## Leg tracking

- **Last completed leg:** 2 (client: non-disruptive topology refresh method)
- **Next leg to run:** 3 (final)

## Next task — leg 3

Wire the refresh to the existing resume path, document it, add the changeset.

See `plan.md` → "Leg 3". Summary: call `this.workspaces.refreshSelectedProjectTopology()`
from `PiWebApp.refreshAfterBrowserResume` (~line 432) and `refreshAppData` (~line 485) —
touch only those two methods in that 2300-line file. Optionally also on
`connectRealtime`'s `onReconnect`, only if it costs nothing. Then one short honest doc
paragraph under `docs/` (detection is resume-scoped, not instant; do not grow `README.md`),
and the `.changeset/*.md` fragment — **still missing, and leg 3 owns it**.

Finish with `npm run verify` (charter requires green) — this is the final leg.

Signature detail leg 3 needs: `refreshSelectedProjectTopology()` takes no arguments,
returns `Promise<void>`, never rejects (failures go to the injected background error sink,
defaulting to `console.warn`), and no-ops when no project is selected. So it can be dropped
directly into the existing `Promise.all` without a `.catch`.

## Relevant context for the next runner

Facts established in leg 0 — trust these, they were verified against the running code and
real git; do not re-derive them:

- **Worktrees are already derived, never registered.** `WorkspaceService.list()` shells out
  to `git worktree list --porcelain` on **every** `GET /projects/:projectId/workspaces`
  request. There is no server-side cache and no invalidation to design. A worktree created
  outside PI WEB is *already* discovered — the gap is purely that the browser never re-asks.
- **`projects.json` holds projects only, not workspaces.** So "auto-adoption" is a
  non-problem: nothing needs to be written to a registry, and there is no adopt-vs-visible
  distinction to design. This collapsed most of the feature's apparent complexity.
- **Cost of discovery is ~2ms** (measured: 20 sequential `git worktree list --porcelain`
  runs in 42ms on this repo).
- **`prunable` is real and load-bearing.** After `rm -rf`ing a worktree directory without
  `git worktree remove`, `git worktree list --porcelain` still lists it, with an added
  `prunable gitdir file points to non-existent location` line. PI WEB currently shows this
  as a normal selectable workspace. `locked` appears as a bare valueless line.
- **The resume path already exists and is already debounced.**
  `src/client/src/appShell/browserResumeController.ts` listens to window `focus` and
  document `visibilitychange`, batches per animation frame, and collapses concurrent
  requests via `TrailingRefreshCoordinator`. It calls
  `PiWebApp.refreshAfterBrowserResume()` (~line 432), which already refreshes the selected
  session, machine activities, and workspace-deletion runs. Workspace topology is the one
  thing missing from that list.
- **Remote machines come for free.** `workspacesApi.workspaces(projectId, machineId)`
  routes through `machinePrefix`, and `GET /projects/:projectId/workspaces` is already in
  `FEDERATED_HTTP_ROUTES` in `src/shared/federatedRoutes.ts`. No transport work needed.
- **Leg 2's method is inert by construction and covered.** `refreshSelectedProjectTopology()`
  applies results via `applyProjectWorkspaces` only, so it writes at most `workspaces` and
  `workspacesByProjectId`. Seven tests in
  `src/client/src/controllers/workspaceController.test.ts` cover: new worktree appears,
  selection + session + file tree + terminal state preserved and `clearActiveSession` not
  called, selected workspace disappeared (selection deliberately left alone), stale project
  response discarded, stale machine response discarded, rejection reported to the error sink
  without touching `state.error`, and no-project no-op. Leg 2 mutation-tested this: injecting
  the plausible `selectPreferredWorkspace` + `selectWorkspace` version made 2 tests fail, so
  the guard is real and not vacuous. Leg 3 must not weaken these tests to fit its wiring.
- **`WorkspaceControllerDependencies` gained `onBackgroundError`** (optional, defaults to
  `console.warn`). `PiWebApp` constructs `WorkspaceController`; leg 3 may pass a message-
  prefixing sink to match sibling controllers, but the default is already correct — this is
  not required work.
- **Leg 1 shipped a seam leg 2 does not need but should know about.** `WorkspaceService`
  now takes an optional `WorkspaceGitPort` (`{ isGitRepository, discoverGitWorktrees }`)
  in its constructor, defaulting to the real git implementation, so workspace policy is
  testable without a repo. `parseGitWorktreeList(stdout)` is exported from
  `gitWorktreeDiscovery.ts` for pure parser tests. Server-side `Workspace` shape is
  unchanged — `prunable`/`locked` live on `GitWorktreeInfo` only and never reach the API,
  so the client needs no type changes.
- **The danger is `selectWorkspace`.** It calls `clearActiveSession()` and
  `resetWorkspaceScopedState()`. A refresh must apply the new list via
  `applyProjectWorkspaces` **only**, and must not route through `selectWorkspace` when the
  selection is still valid. `ProjectActivityOwnershipCoordinator` is the existing precedent
  for background topology hydration that does not disturb selection — read it if leg 2
  needs a model.
- **No session daemon involvement.** Nothing in this design touches `src/server/sessiond.ts`,
  session runtime ownership, or the daemon protocol. **No manual sessiond restart needed.**

## Progress documentation expected of each runner

- Commit the slice (Conventional Commit message).
- Update this file: current position, leg tracking, next task, blockers.
- Append to `log.md`: what, why, artifacts, exact checks run and results.
- Add the `.changeset/*.md` fragment no later than leg 3.

## Decisions settled by the human (do not re-open)

1. **Latency: resume-scoped is acceptable.** Detection on tab refocus/visibility is the
   agreed behavior. Do not add a timer or a watcher to shorten it.
2. **Removed worktrees: hide them.** Filtering `prunable` worktrees out of the workspace
   list is wanted and approved.
3. **Sibling overlap: assume the other session does nothing.** This relay owns the
   workspace-topology refresh seam outright. Build it here, do not design for sharing,
   and do not read `/srv/dev/pi-web-worktrees/worktree-create-ui`. If that branch later
   merges something overlapping, resolving it is that branch's problem, not this one's.

## Blockers

None. Leg 2's main known risk (UI churn on refresh) did **not** materialize: applying the
list through `applyProjectWorkspaces` alone required no workaround, and
`handleWorkspaceChange` early-returns on an unchanged selected workspace id, so a
fresh-but-equal list causes no downstream churn. No intervention signal fired.

Leg 3's own watch item: after wiring, confirm nothing in the resume path re-derives
selection from the refreshed list. If wiring turns out to need a change *inside*
`refreshSelectedProjectTopology` to stay non-disruptive, that is the intervention signal —
stop rather than relaxing the invariant.
