# Implementation plan — worktree-autodetect (reduced scope)

Three legs. Each is a vertical slice: source + tests + checks + commit.

The order is deliberate: server truth first, then client application of that truth,
then the trigger that makes it zero-intervention.

---

## Leg 1 — Stop reporting removed worktrees (the inverse case)

**Why first:** it is independently valuable, has zero UI risk, and is the only part of
the feature that is a straight bug fix. Today a worktree deleted with `rm -rf` outside
PI WEB stays in the workspace list forever as a selectable ghost.

**Files**

- `src/server/workspaces/gitWorktreeDiscovery.ts`
- new `src/server/workspaces/gitWorktreeDiscovery.test.ts`

**Work**

1. Extend the porcelain parser to read the valueless `prunable` and `locked` keys.
   `git worktree list --porcelain` emits `prunable <reason>` for a linked worktree whose
   checkout directory no longer exists, and a bare `locked` line for a locked one.
   Verified in leg 0 against real git.
2. Surface `prunable` on `GitWorktreeInfo`, and filter prunable entries out of what
   `discoverGitWorktrees` returns — or return them and filter in `WorkspaceService`,
   whichever keeps the parser honest and the policy visible. Prefer: parser reports
   facts, `workspaceService` decides policy.
3. Do **not** run `git worktree prune`. Read-only. PI WEB must not mutate the user's
   repo metadata as a side effect of listing.
4. Keep the main worktree unconditionally: never filter the entry whose path equals
   `project.path`, so a project can never end up with an empty workspace list.

**Tests** (pure parser tests, no git process needed — inject or fake the exec boundary)

- parses `prunable` with a reason and `locked` without a value
- a prunable linked worktree is excluded from the workspace list
- a locked worktree is still included
- the main worktree survives even if git somehow marks it prunable

**Checks:** `npm test -- --run src/server/workspaces/gitWorktreeDiscovery.test.ts`,
plus the workspaceService/app.projects tests if they touch the shape, plus
`npm run typecheck` (`GitWorktreeInfo` is exported).

---

## Leg 2 — Non-disruptive workspace topology refresh in the client

**Why second:** this is the risky part, and it must be provably non-disruptive before
anything starts calling it automatically.

**Files**

- `src/client/src/controllers/workspaceController.ts`
- new `src/client/src/controllers/workspaceController.test.ts`

**Work**

1. Add a method — suggested name `refreshSelectedProjectTopology()` — that re-lists the
   selected project's workspaces and applies them via the existing
   `applyProjectWorkspaces` path.
2. **Selection invariants it must hold:**
   - If the currently selected workspace is still present, do **not** call
     `selectWorkspace`, do **not** clear the active session, do **not** reset
     workspace-scoped state. Only `workspaces` / `workspacesByProjectId` change.

   **Read this before writing the method — the wrong version looks correct.** The
   tempting shape, mirroring `selectProject()` six lines above it, is: refresh the list,
   then "re-resolve the selection to be safe" via
   `selectPreferredWorkspace(...)` + `await this.selectWorkspace(...)`. That is the bug.
   `selectWorkspace` has **no already-selected guard**, so even when it re-picks the very
   same workspace it unconditionally runs:
   - `sessions.clearActiveSession()` → `socket.close()` (closes the session WebSocket
     mid-stream), `clearPendingUpdates()`, `streamWatermark = undefined` (buffered deltas
     dropped), and `setState({ selectedSession: undefined, messages: [] })` (chat empties);
   - `setState({ ...resetWorkspaceScopedState() })` → clears `sessions`, `fileTree`,
     `expandedDirs`, `selectedFilePath`, `selectedFileContent`, `gitStatus`,
     `selectedDiffPath`, `selectedDiff`, `selectedStagedDiff`, `selectedTerminalId`.

   Because leg 3 calls this from `refreshAfterBrowserResume`, that would fire on **every**
   alt-tab back into PI WEB — not only when a worktree actually changed — blanking the
   chat, collapsing the file tree, and closing any open diff every time, and losing stream
   deltas that arrive while the socket is down. Applying the list via
   `applyProjectWorkspaces` alone is sufficient for the feature; `handleWorkspaceChange`
   early-returns when the selected workspace id is unchanged, so a fresh-but-equal list
   causes no downstream churn on its own.
   - If nothing is selected, just apply the list.
   - If the selected workspace **disappeared**, do not silently jump. Leave the
     selection as-is and let the existing deletion path own recovery; the user is
     currently working there and a surprise switch is worse than a stale label.
     If leg 2 finds this cannot be left alone safely, that is the intervention signal.
3. Guard against machine/project changing mid-flight, exactly like `selectProject` does
   (compare `selectedMachineId` and `selectedProject?.id` before applying).
4. Swallow-and-report errors the way sibling background refreshes do (`console.warn`,
   not `setState({ error })`) — a background topology refresh must never paint an error
   banner over a working session.

**Tests** (controller-layer, fake `api.workspaces`)

- a newly appeared worktree lands in `workspaces` and `workspacesByProjectId`
- the selected workspace is preserved; `sessions.clearActiveSession` is **not** called
- a stale response for a project the user has since left is discarded
- a rejected request does not set `state.error`

**Checks:** `npm test -- --run src/client/src/controllers/workspaceController.test.ts`.

---

## Leg 3 — Wire it to the existing resume path, document, changeset

**Why last:** only after leg 2 proves the refresh is inert.

**Files**

- `src/client/src/components/PiWebApp.ts` — `refreshAfterBrowserResume` (~432) and
  `refreshAppData` (~485). Touch only these two methods.
- possibly `src/client/src/components/PiWebApp.*.test.ts` (a focused new test file is fine)
- `docs/` — one short paragraph where workspaces/worktrees are explained; follow
  `.agents/skills/documentation-guide/SKILL.md` and do **not** grow `README.md`
- `.changeset/*.md`

**Work**

1. Add `this.workspaces.refreshSelectedProjectTopology()` to the `Promise.all` in
   `refreshAfterBrowserResume` and to `refreshAppData`.
   - `BrowserResumeController` already debounces per animation frame and collapses
     concurrent requests through `TrailingRefreshCoordinator`, so no extra throttling
     is needed. Verified in leg 0.
   - This inherits remote-machine support for free: `api.workspaces(projectId, machineId)`
     already routes through the machine proxy, and `/projects/:projectId/workspaces` is
     already in `FEDERATED_HTTP_ROUTES`.
2. Optionally also refresh on realtime-socket reconnect (`connectRealtime`'s
   `onReconnect`), which is the same class of natural event. Only if it costs nothing.
   Add the call directly; this relay owns the seam and is not coordinating with any
   other branch.
3. Document the behavior honestly: detection happens when the tab regains focus /
   becomes visible, not instantly.
4. Add the changeset (`npm run changeset`, or write the fragment directly).

**Checks:** the new/affected client tests, then **`npm run verify`** — this is the final
leg and the change is cross-cutting.

---

## Cost ledger (accepted in leg 0)

| Cost | Amount |
|---|---|
| New processes | 0 |
| New watchers (inotify/fs.watch) | 0 |
| New timers | 0 |
| New endpoints / push channels | 0 |
| Extra request per browser resume, per selected project | 1 (~2ms of `git worktree list` server-side) |
| Production lines changed | ~60 |
| New test files | 3 |

## Known risks

- **UI churn on refresh.** Mitigated by leg 2's invariants and its tests. This is the
  one that can kill the feature; it is an explicit intervention trigger.
- **Latency expectation.** Detection is resume-scoped. A user staring at an already-focused
  tab while a worktree appears in another window sees nothing until they refocus. This is
  an accepted, documented limit — not a bug to fix with a timer.
- **Overlap with the sibling `worktree-create-ui` effort.** Settled by the human: assume
  that session does nothing. This relay owns the refresh seam; build it here without
  designing for reuse, and do not read that worktree.
