# Log — relay "worktree-autodetect"

Append-only. One entry per leg. Do not read end-to-end unless `status.md` points you here.

---

## Leg 0 — Assessment, design, packet creation

**Runner:** assessment/design session
**Outcome:** recommendation = **reduced scope**. Packet created. Relay parked pending
human approval. No production code written.

### Feature request

> "auto detect and show new worktrees, even when created outside of pi-web."

With the user's framing: nice-to-have, not a must, expects it may not be feasible, and
**must require zero user intervention**.

### What I found in the codebase

The single most important finding reframed the whole feature:

**Worktree discovery is already fully dynamic. There is no cache and no registry.**

`WorkspaceService.list()` (`src/server/workspaces/workspaceService.ts`, 44 lines) calls
`isGitRepository()` then `discoverGitWorktrees()` — which shells out to
`git worktree list --porcelain` — on **every single** `GET /projects/:projectId/workspaces`
request. I grepped for any cache/memo in that path: there is none. Workspace ids are
derived by hashing `${project.id}:${worktree.path}`, so they are stable across calls
without being stored anywhere.

And `projects.json` (`src/server/storage/projectStore.ts`) stores only
`{ id, name, path, createdAt }` per **project**. Workspaces are never persisted.

Two consequences, both of which delete a large chunk of the anticipated problem:

1. **A worktree created outside PI WEB is already detected.** The server has no stale
   state to invalidate. The gap is not detection at all — it is that **the browser never
   re-asks**. `WorkspaceController` fetches workspaces in `selectProject()` and in
   `refreshProjectWorkspaces()`, and the only caller of the latter is the
   workspace-*deletion* flow. So the list is fetched on project selection and then frozen
   for the lifetime of that selection.
2. **"Auto-adoption" is a non-question.** The brief asked whether zero-intervention
   detection implies zero-intervention adoption, and whether a discovered worktree should
   be a distinct "discovered" state. Since worktrees are derived and nothing is written to
   a registry, there is nothing to adopt and no state to distinguish. A new worktree is
   simply a member of the derived list. This was the design's biggest apparent risk and it
   evaporated on inspection.

Measured cost of the discovery itself: **~2ms**. 20 sequential
`git worktree list --porcelain` runs on this repo took 42ms total.

I also found the delivery mechanism already built and already debounced:
`src/client/src/appShell/browserResumeController.ts` listens to window `focus` and
document `visibilitychange`, batches signals per animation frame, and collapses
concurrent refreshes through `TrailingRefreshCoordinator`. It drives
`PiWebApp.refreshAfterBrowserResume()`, which today refreshes the selected session,
machine activities, and workspace-deletion runs. Workspace topology is conspicuously
absent from that list.

And remote machines need no work: `GET /projects/:projectId/workspaces` is already in
`FEDERATED_HTTP_ROUTES` (`src/shared/federatedRoutes.ts:25`) and `workspacesApi.workspaces`
already takes a `machineId` and routes via `machinePrefix`.

### The inverse case, verified against real git

I built a throwaway repo in `/tmp/wtprobe` and checked what git actually reports.

- `.git/worktrees/` does not exist until the first linked worktree is added, then gains
  one directory per worktree.
- After `rm -rf`ing a worktree's directory **without** `git worktree remove`,
  `git worktree list --porcelain` **still lists it**, with an extra line:
  `prunable gitdir file points to non-existent location`.
- A locked worktree gets a bare valueless `locked` line.

The current parser ignores both keys. So **PI WEB today shows worktrees that no longer
exist as normal, selectable workspaces** — a real bug, present regardless of whether the
detection feature is built. Selecting one produces a workspace whose path does not exist.

### Options compared

**A. `git worktree list` on a timer (server or client poll).**
Rejected. It is the obvious answer and it is the wrong one. A timer runs forever to catch
an event that happens a few times a week, and it must run per project, per machine, or it
does not actually satisfy "no intervention". For a nice-to-have, a permanent background
cost to serve a rare event is exactly the trade the user warned against. It also has no
natural interval: fast enough to feel automatic is wasteful, slow enough to be cheap is
not noticeably better than the resume trigger, which is free.

**B. Watch `.git/worktrees/` with `fs.watch`/inotify.**
This was the most interesting candidate and the one I most wanted to work. The watch
target is genuinely small and precise — one directory in the main repo, one entry per
worktree, written by git itself. That is far better than watching filesystems for new
directories.

Rejected anyway, on cost and correctness:

- **Lifecycle ownership is the real problem, not the watcher.** A watcher must be created
  and destroyed as projects are added/removed, and it must live somewhere long-lived. The
  web/API process autoreloads (`pi-web-web-ui-dev.service`), so watchers there churn
  constantly. The natural long-lived home is the session daemon — but that would drag a
  purely presentational concern into session runtime ownership and, per `AGENTS.md`, make
  every change to it require a manual daemon restart. For a nice-to-have, that is a
  disproportionate architectural commitment.
- **The directory does not exist until the first worktree exists**, so a repo with no
  linked worktrees needs a watch on `.git/` itself to catch `worktrees/` being created —
  a noisier target that fires on every ref update, index write, and fetch.
- **It only fixes the local case.** Remote machines would need the event pushed over the
  machine transport, which means a new workspace-topology realtime event type, publishing
  it from the daemon, adding it to `FEDERATED_WEBSOCKET_ROUTES` plumbing, parsing it in
  `sessionSocket.ts`, and handling it in `PiWebApp`. That is a meaningful new protocol
  surface for a feature the user called optional.
- **Environment caveats are real.** `fs.watch` is unreliable on Docker bind mounts on
  macOS/Windows (the repo ships `docker/compose.yml` with bind-mounted checkouts) and on
  network filesystems, and inotify watch limits are a known operational failure mode. So
  the "instant" promise would be silently broken for a subset of users — worse than an
  honest "updates when you come back to the tab".
- **It still would not be enough.** `fs.watch` on `.git/worktrees` catches creation but
  the removal case still needs the `prunable` fix, because `rm -rf` of the *checkout*
  does not touch `.git/worktrees/<name>` at all — I verified the metadata directory
  survives. So the watcher does not even subsume the cheaper fix.

**C. Piggyback on events that already happen.** ← chosen
The refresh already exists, is already debounced, already covers remote machines, and
costs one ~2ms request per tab refocus. Marginal cost is as close to zero as this feature
can get, and the code surface is ~60 production lines.

### Recommendation: reduced scope

Do the cheap 90%:

1. **Fix the inverse case** — filter `prunable` worktrees out of the workspace list.
   Read-only; PI WEB must not run `git worktree prune` as a side effect of listing.
2. **Add a non-disruptive topology refresh** to `WorkspaceController` that re-lists the
   selected project's workspaces without touching selection or session state.
3. **Call it from the existing resume path** — no new timer, watcher, process, or channel.

**Scope boundary, stated plainly:** detection is **resume-scoped, not instant**. A worktree
created in another terminal while the PI WEB tab already has focus is not noticed until the
tab is refocused or becomes visible again. That is the honest limit, and it should be
documented rather than papered over.

Within that boundary it is genuinely zero-intervention: no button, no config, no opt-in,
works on local and remote machines, works for creation and removal.

### The risk that could kill it

`WorkspaceController.selectWorkspace()` calls `clearActiveSession()` and
`resetWorkspaceScopedState()`. If a background refresh routes through it, the user's chat
is torn down every time they refocus the tab. The refresh must apply the list through
`applyProjectWorkspaces` only. `ProjectActivityOwnershipCoordinator` is the existing
precedent for background topology hydration that deliberately leaves selection alone, and
is the model to follow. Leg 2 proves this with tests before leg 3 wires the trigger — and
if it cannot be made non-disruptive, that is an explicit stop.

### What would change the recommendation

- If the user says instant-while-focused is actually required, option B comes back on the
  table — but with the session daemon commitment, the new realtime event type, and the
  Docker/network-filesystem caveats accepted as the price.
- If a future need arises for reliable server-pushed workspace topology for another reason,
  the watcher becomes incremental rather than a feature-specific cost, and the ledger flips.

### Artifacts created

- `.pi-web/relays/worktree-autodetect/charter.md`
- `.pi-web/relays/worktree-autodetect/status.md`
- `.pi-web/relays/worktree-autodetect/plan.md`
- `.pi-web/relays/worktree-autodetect/log.md` (this file)

### Checks run

None — no code was changed in this leg.

### Human decisions received at the end of leg 0

All three open questions were answered, and the reduced scope was approved:

1. **Latency** — resume-scoped detection is acceptable. No timer, no watcher.
2. **Removed worktrees** — yes, hide worktrees whose directory is gone.
3. **Sibling overlap** — assume the other session does nothing; this relay owns the
   refresh seam outright and should not design for sharing.

The human also asked for the `selectWorkspace` risk to be explained concretely. The
worked failure mode is now recorded inline in `plan.md` → Leg 2, because the buggy version
is the one that looks correct: re-resolving the selection after a refresh via
`selectPreferredWorkspace` + `selectWorkspace` (mirroring `selectProject`) tears down the
session on **every** browser resume, since `selectWorkspace` has no already-selected guard
and always runs `clearActiveSession()` (closing the session socket mid-stream and dropping
buffered deltas) plus `resetWorkspaceScopedState()` (clearing chat, file tree, open file,
git status, open diff, terminal selection).

### Handing off?

**Yes.** Packet committed, `status.md` un-parked with the decisions recorded, leg 1
dispatched via `spawn_session`.
