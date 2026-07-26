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

---

## Leg 1 — Stop reporting removed worktrees (server truth)

**Commit:** `266f941` — `fix(workspaces): hide worktrees whose checkout directory is gone`

### What I did

1. **Parser reports facts.** `src/server/workspaces/gitWorktreeDiscovery.ts` now reads the
   `prunable` and `locked` keys. Extracted the pure parsing step into an exported
   `parseGitWorktreeList(stdout)`; `discoverGitWorktrees` is now just the `execFile`
   boundary plus that call. `GitWorktreeInfo` gained optional `prunable` / `locked`.
2. **Service decides policy.** `src/server/workspaces/workspaceService.ts` filters prunable
   linked worktrees in a small private `selectable()` step, keeping the entry whose path
   equals `project.path` unconditionally. Existing "no worktrees" fallback then also covers
   the case where every listed worktree was filtered away, so a project can never present
   an empty workspace list.
3. **Injected the git boundary.** `WorkspaceService` now takes an optional
   `WorkspaceGitPort` (`{ isGitRepository, discoverGitWorktrees }`) defaulting to the real
   implementation. This is what made the policy testable without a real repo or a
   subclass-override fake, and it left every existing `new WorkspaceService()` call site
   (`app.ts`, `app.testSupport.ts`, `sessiond.ts`) untouched.
4. **Two new test files** (the plan predicted one; the policy assertions belong next to the
   service that owns them, not next to the parser):
   - `gitWorktreeDiscovery.test.ts` — parser only, fixtures captured verbatim from real git.
   - `workspaceService.test.ts` — prunable hidden, locked kept, project path kept even when
     marked prunable, fallback when everything is filtered, plus pre-existing labeling and
     non-git behavior pinned so leg 2/3 have a regression net.

### Decisions and why

- **Facts in the parser, policy in the service**, as `plan.md` preferred. The words
  `prunable` and `project.path` now appear in exactly one place each.
- **Constructor injection rather than subclass-override fakes.** `workspaceDeletionRoutes.test.ts`
  fakes `WorkspaceService` by subclassing and overriding `list()`, which cannot test `list()`
  itself. A narrow port is the smaller seam and keeps the production default unchanged.
- **Read-only, as mandated.** No `git worktree prune`, no repo metadata mutation anywhere.
- **`locked` is parsed but deliberately not acted on.** A locked worktree is a real checkout
  and stays selectable. It is surfaced now because git emits it in the same records and
  future UI may want it; adding it later would mean touching the parser again.
- **Re-verified the git behavior** rather than trusting it: created a throwaway repo,
  `rm -rf`'d a linked worktree and locked another. Confirmed `prunable gitdir file points to
  non-existent location` and `locked keep me`. Test fixtures are that exact output. Probe
  repo deleted afterwards.
- **No API/type change.** `prunable`/`locked` never leave the server, so the shared
  `Workspace` type and the client are untouched. Leg 2 needs no type work.

### Checks run

- `npm test -- --run src/server/workspaces/gitWorktreeDiscovery.test.ts src/server/workspaces/workspaceService.test.ts` → 10 passed
- `npm test -- --run src/server/workspaces/` → 12 files, 88 passed
- `npm test -- --run src/server/app.projects.test.ts` → 5 passed (workspace list route contract)
- `npm run typecheck` → clean
- `npx eslint` on all four changed files → clean
- pre-commit `verify:staged` → cached typecheck, knip, eslint, 14 related test files / 63 tests, all green

`npm run verify` was not run; per `plan.md` that is leg 3's gate.

### Artifacts changed

- `src/server/workspaces/gitWorktreeDiscovery.ts` (modified)
- `src/server/workspaces/workspaceService.ts` (modified)
- `src/server/workspaces/gitWorktreeDiscovery.test.ts` (new)
- `src/server/workspaces/workspaceService.test.ts` (new)
- `status.md` (leg tracking → last completed 1 / next 2, next task set to leg 2, added a
  note about the new `WorkspaceGitPort` seam)

No changeset yet — charter allows it any time up to leg 3, and leg 3 owns one fragment for
the whole user-visible behavior.

### Blockers

None. Nothing ambiguous, no design decision needed, no intervention trigger fired.

### Handing off?

**Yes.** Work committed, packet updated, leg 2 dispatched via `spawn_session`.

---

## Leg 2 — Non-disruptive workspace topology refresh in the client

**Commit:** `d0f8f9f` — `feat(workspaces): add non-disruptive workspace topology refresh`

### What I did

Added `WorkspaceController.refreshSelectedProjectTopology()`: it reads the selected project
and machine, calls `api.workspaces(project.id, machineId)`, re-reads state, discards the
response if machine or selected project changed mid-flight, and applies the list via the
existing private `applyProjectWorkspaces` — and nothing else. No selection is re-derived, no
session is cleared, no workspace-scoped state is reset, no URL update.

Added `src/client/src/controllers/workspaceController.test.ts` (7 tests, new file).

### Decisions and why

- **Did not use `selectPreferredWorkspace` / `selectWorkspace`.** `plan.md` documented this
  as the plausible-looking destructive shape; I confirmed it in the source before writing.
  `selectWorkspace` has no already-selected guard, so it unconditionally calls
  `sessions.clearActiveSession()` and `setState({ ...resetWorkspaceScopedState() })` — which
  clears `sessions`, `fileTree`, `expandedDirs`, `selectedFilePath`, `gitStatus`, the three
  diff fields, and `selectedTerminalId`. Since leg 3 calls this on every browser resume, that
  would blank the UI on every alt-tab. Applying the list alone is sufficient.
- **Selected workspace that disappeared: selection left untouched**, per plan. No new
  recovery path; `refreshAfterWorkspaceDeleted` still owns that. Covered by a test asserting
  the vanished workspace stays selected and `clearActiveSession` is not called.
- **Errors: injected sink, not `state.error`.** Added optional
  `onBackgroundError(message, error)` to `WorkspaceControllerDependencies`, defaulting to
  `console.warn`, mirroring `SessionNotificationController`'s existing pattern. This keeps the
  behavior testable without stubbing `console` and guarantees a background refresh never
  paints an error banner over a working session. The method therefore never rejects.
- **Guard style copied from `selectProject`** (compare `selectedMachineId` and
  `selectedProject?.id` after the await) rather than inventing a generation counter — the
  method is a single request with no trailing-pass semantics, so
  `ProjectActivityOwnershipCoordinator`'s heavier machinery would have been disproportionate.
- **Wrote a `why` comment on the method**, not a `what` one: it records the invariant and why
  the simpler-looking `selectWorkspace` route is unsafe, so a future editor cannot "simplify"
  it back into the bug.
- **Nothing wired into `PiWebApp`**, per plan — deliberately leg 3.

### Verification that the guard is not vacuous

Mutation-tested the tests: temporarily patched the method to the plausible wrong version
(`selectPreferredWorkspace(...)` + `await this.selectWorkspace(...)`) and re-ran the file —
**2 of 7 tests failed** (selection-preserved and vanished-workspace). Restored the file from
backup and re-confirmed 7/7 green. The tests genuinely pin the invariant.

### Checks run

- `npx vitest --run src/client/src/controllers/workspaceController.test.ts` → **7 passed**
- `npx vitest --run src/client/src/controllers` → **26 files, 204 tests passed** (no
  regression in sibling controllers)
- `npm run typecheck` → **clean** (one iteration: `expandedDirs` is
  `Record<string, FileTreeEntry[]>`, not booleans — fixed in the fixture)
- `npx eslint` on both changed files → **clean**
- pre-commit `npm run verify:staged` on commit → typecheck (cached), knip, eslint, and
  related vitest (5 files / 21 tests) all **passed**

`npm run verify` was not run: the charter assigns it to leg 3, and this leg's change is
contained to one controller.

### Artifacts changed

- `src/client/src/controllers/workspaceController.ts` (modified: new method, new optional
  `onBackgroundError` dependency)
- `src/client/src/controllers/workspaceController.test.ts` (new, 7 tests)
- `status.md` (leg tracking → last completed 2 / next 3, next task set to leg 3 with the
  method's exact call signature, added notes on test coverage + the mutation check + the new
  `onBackgroundError` dependency, rewrote Blockers to record that the UI-churn risk did not
  materialize)

Still no changeset — leg 3 owns it, and `status.md` now flags it explicitly as missing.

### Blockers

None. The charter's main intervention trigger for this leg (refresh cannot be made
non-disruptive without visible UI churn) did not fire: no workaround was needed. No watcher,
timer, process, endpoint, or push channel added. No sessiond code touched, so **no manual
session daemon restart is required**.

### Handing off?

**Yes.** Work committed, packet updated, leg 3 dispatched via `spawn_session`.
