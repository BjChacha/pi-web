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

---

## Leg 3 — wire the refresh to browser resume, document, changeset, full verify (final)

### What I did

Wired the leg-2 refresh into the two existing refresh paths, documented the behavior,
added the changeset, and ran the full `npm run verify` the charter requires of the last leg.

1. **Wiring (`src/client/src/components/PiWebApp.ts`, 2 lines).** Added
   `this.workspaces.refreshSelectedProjectTopology()` to the `Promise.all` in
   `refreshAfterBrowserResume` (~438) and in `refreshAppData` (~496). Nothing else in that
   2300-line file was read or touched, per the charter's reading discipline.
2. **Wiring test (`src/client/src/components/PiWebApp.workspaceTopology.test.ts`, new,
   3 tests).** Verifies the refresh is invoked by the exact callback
   `BrowserResumeController` calls (`browserResume.callbacks.refreshAfterResume`, not a
   hand-picked method reference), by `refreshAppData`, and that it still runs when a sibling
   refresh in the same batch rejects. Sibling refreshes are stubbed so the assertions observe
   only the topology call.
3. **Docs (`docs/faq.html`).** New FAQ entry `#worktree-list-out-of-date` plus its TOC link:
   worktrees are listed on demand and never registered; the list is re-read on tab
   focus/visibility rather than continuously, so refocusing updates it; selection/session/
   scroll are preserved; worktrees with a missing checkout directory are hidden and git still
   tracks them until `git worktree prune`. Placed in the FAQ per
   `.agents/skills/documentation-guide/SKILL.md` (troubleshooting/edge-case content);
   `README.md` deliberately untouched.
4. **Changeset (`.changeset/worktree-autodetect.md`).** `patch` for `@jmfederico/pi-web`
   (CalVer: patch is correct for a non-breaking user-facing capability), written as user
   behavior rather than an implementation log.

### Decisions and why

- **Did not add the `connectRealtime` `onReconnect` call.** `plan.md` marked it optional
  "only if it costs nothing". It is not free: `onReconnect` captures the machine id at
  connect time, while `refreshSelectedProjectTopology` reads the selected machine at call
  time, so wiring them together would either need a machine-scoped variant or would fire a
  refresh for a machine the user has since left. Adding a second concept for no user-visible
  gain over the resume path failed the cost test. Socket reconnect on resume is already
  covered by the resume path itself.
- **Did not pass a message-prefixing `onBackgroundError` sink from `PiWebApp`.** Leg 2 made
  it optional with a `console.warn` default that already includes project and machine in the
  message. `status.md` explicitly recorded this as not-required work; adding it would be
  scope creep for identical output.
- **Verified the wiring test is not vacuous.** Removed both call sites with `perl`, re-ran the
  file: 3/3 failed. Restored the file (verified 2 occurrences back) and re-ran: 3/3 passed.
- **No charter boundary crossed.** No timer, watcher, process, endpoint, or push channel;
  no change inside `refreshSelectedProjectTopology`; leg 2's tests were not weakened; the
  resume path re-derives no selection from the refreshed list.

### Checks run

- `npx vitest --run src/client/src/components/PiWebApp.workspaceTopology.test.ts` →
  **3 passed** (first run had 1 failure from a stub-shape mistake in my own test helper,
  fixed by failing one named sibling refresh instead of all of them)
- mutation check (call sites removed) → **3 failed**, as intended; restored → **3 passed**
- `git diff --check` → clean
- `npx eslint` on the new test and `PiWebApp.ts` → **clean**
- **`npm run verify` → green**: typecheck, lint, knip, and 228 test files /
  1840 passed, 2 skipped
- pre-commit `npm run verify:staged` → typecheck (cached), knip, eslint, related vitest
  (6 files / 20 tests) all **passed**

### Artifacts changed

- `src/client/src/components/PiWebApp.ts` (2 lines added)
- `src/client/src/components/PiWebApp.workspaceTopology.test.ts` (new, 3 tests)
- `docs/faq.html` (new FAQ entry + TOC link)
- `.changeset/worktree-autodetect.md` (new)
- committed as `84545fb feat(workspaces): refresh worktrees on browser resume`
- `status.md` rewritten as a finished-relay baton: finish-line conditions checked off one by
  one with their commits, leg tracking set to last completed 3 / next none, shipped behavior
  described in user terms, and the never-route-through-`selectWorkspace` invariant recorded
  for whoever edits this code next

### Blockers

None. No intervention signal fired in this leg or any earlier one. No sessiond code touched,
so **no manual session daemon restart is required**; the change lands on the autoreloading
web/UI service path only.

### Handing off?

**No — this was the final leg.** All five charter finish-line conditions are met and
`npm run verify` is green, so per the charter this runner stops instead of spawning. The
branch `feat/worktree-autodetect` is ready for human review and merge.

---

## Post-relay — selected-workspace freshness fix (review follow-up, not a leg)

Triggered by a human review question after the relay finished: "do we have pragmatic
reasonable and stable code?" I reviewed the production diff against
`code-quality-architecture` and probed the runtime rather than trusting the leg summaries.

### What the review checked and found sound

- `handleWorkspaceChange` early-returns on equal workspace id → no `clearActiveSession`,
  no terminal teardown on resume.
- `WorkspaceList.updated()` re-scrolls on any `workspaces` change, but via
  `scrollIntoView({ block: "nearest" })`, a no-op when the row is already visible.
- Open row menu survives refresh: guarded by an id membership check, and ids are path-derived.
- Stale responses guarded on both machine and project id; background failures go to
  `onBackgroundError`, never `state.error`, so a flaky resume shows no error toast.

### The one real gap, and the fix

`applyProjectWorkspaces` wrote a fresh `workspaces` array but left `selectedWorkspace`
pointing at the pre-refresh object. Reproduced with a scratch test: after a refresh where a
worktree's branch changed outside PI WEB, the list row showed `feature-b` while
`selectedWorkspace.branch` was still `feature-a`. User-visible in the collapsed Workspaces
header and the mobile context bar until reselect. Not a regression (both were stale before),
but a new fresh/stale inconsistency introduced by making the list refresh.

Fixed by re-pointing `selectedWorkspace` at its refreshed entry, keyed by `id`. Safety rests
on two things: `id` is derived from the path, so this can never change *which* workspace is
selected; and `handleWorkspaceChange` gates on `id`, so no session/terminal teardown fires.
The patch is skipped when metadata is unchanged, because `patchChangesState` is
identity-based and a real HTTP response returns fresh-but-equal objects every resume —
without that guard every browser focus would push a new object into state.

### Decisions

- **Left `locked` parsed-but-unconsumed.** Flagged it as YAGNI in review, then kept it: it
  documents the deliberate policy that locked worktrees are *kept*, and that policy is pinned
  by a real `workspaceService` test. Removing the field would not remove the policy.
- **Left the two refresh entry points un-deduped.** Both are idempotent, stale-guarded, and
  ~2ms; cross-path collapsing would add a concept for no user-visible gain.
- **Compared metadata field-by-field** (`sameWorkspaceMetadata`) rather than `JSON.stringify`,
  which is key-order sensitive, or a deep-equal helper this file does not otherwise need.

### Checks run

- `npx vitest --run src/client/src/controllers/workspaceController.test.ts` → **9 passed**
- mutation A, never re-point (restores the original bug) → the re-point test failed, alone
- mutation B, always re-point (drops the unchanged guard) → the identity test failed, alone
- `npx eslint` on both changed files → clean; `npm run typecheck` → clean
- **`npm run verify` → green**: 228 files, **1842 passed**, 2 skipped (was 1840)
- pre-commit `verify:staged` → 6 files / 26 tests passed

### Artifacts changed

- `src/client/src/controllers/workspaceController.ts` (`refreshedSelection` +
  `sameWorkspaceMetadata`; `applyProjectWorkspaces` early-returns for the non-selected project)
- `src/client/src/controllers/workspaceController.test.ts` (+2 tests, 9 total)
- committed as `79577e4 fix(workspaces): keep selected workspace metadata fresh on refresh`
- no changeset added: `.changeset/worktree-autodetect.md` already promises the list stays
  correct without user action, and this fix delivers that promise rather than adding to it
- `status.md`: new "Post-relay review fix" section and the second invariant recorded

### Blockers

None. No new timer, watcher, process, endpoint, or push channel; no sessiond code touched, so
**no manual session daemon restart is required**. Branch still ready for review and merge.
