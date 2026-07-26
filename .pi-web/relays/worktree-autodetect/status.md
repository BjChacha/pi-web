# Status — relay "worktree-autodetect"

## ✅ APPROVED — relay is live

The human approved the reduced scope in leg 0 and answered every open question. There are
no outstanding decisions. Run leg 2.

## Current position

Leg 1 is complete and committed (`266f941`). The **server** side of the feature is done:
prunable worktrees are no longer reported as workspaces. Nothing in the client has changed
yet, so newly created worktrees still only appear on a full page load.

The design remains reduced scope: detection piggybacked on browser resume. No watchers,
no timers, no new processes, no new push channel. Breakdown is in `plan.md`.

## Leg tracking

- **Last completed leg:** 1 (server: hide removed worktrees)
- **Next leg to run:** 2

## Next task — leg 2

Non-disruptive workspace topology refresh in the client.

See `plan.md` → "Leg 2" and **read it fully before writing the method** — it spells out the
plausible-looking wrong implementation and exactly why it is destructive. Summary: add
`refreshSelectedProjectTopology()` to `WorkspaceController` that re-lists the selected
project's workspaces and applies them through `applyProjectWorkspaces` **only** — never
through `selectWorkspace`, which has no already-selected guard and would clear the active
session and all workspace-scoped state on every alt-tab. Guard against machine/project
changing mid-flight; `console.warn` on failure, never `setState({ error })`.

Files: `src/client/src/controllers/workspaceController.ts`,
new `src/client/src/controllers/workspaceController.test.ts`.

Do **not** wire anything into `PiWebApp` in leg 2 — that is leg 3, deliberately after the
refresh is proven inert.

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

None. Leg 2 is clear to run. The one thing to watch is leg 2's own intervention trigger:
if the refresh cannot be made non-disruptive without visible UI churn, stop rather than
working around it.
