# Charter — relay "worktree-autodetect"

## Relay identity

- **Name:** `worktree-autodetect`
- **Root:** `.pi-web/relays/worktree-autodetect/` in worktree `/srv/dev/pi-web-worktrees/worktree-autodetect`
- **Branch:** `feat/worktree-autodetect` (based on `main`)

## Goal / finish line

Worktrees created or removed outside PI WEB become visible in the browser workspace
list **with no user action of any kind**, on the next natural browser resume, on both
local and remote machines.

Concretely, the relay is finished when all of the following are true:

1. `discoverGitWorktrees` no longer reports worktrees whose checkout directory is gone
   (`prunable` in `git worktree list --porcelain`), so worktrees deleted outside PI WEB
   stop appearing as selectable ghost workspaces.
2. `WorkspaceController` can re-list the workspaces of the selected project and apply the
   result **without disturbing the current selection, session, or scroll state** when the
   selected workspace still exists, and without silently yanking the user out of a
   workspace that vanished while they were working in it.
3. `PiWebApp` calls that refresh from the existing browser-resume path
   (`refreshAfterBrowserResume`) and the existing plugin-facing `refreshAppData` path.
   No new timer, no new watcher, no new process, no new WebSocket channel.
4. Tests cover: prunable parsing/filtering, refresh-preserves-selection,
   refresh-when-selected-workspace-disappeared, and the resume wiring.
5. `npm run verify` is green, and a changeset exists describing the user-visible behavior.

**Explicitly out of scope** (decided in leg 0, do not re-open without the human):

- Filesystem watchers on `.git/worktrees` or anywhere else.
- Polling timers for worktree discovery.
- Any server→browser push channel for workspace topology.
- Instant (sub-second) detection while the browser tab already has focus.
- Auto-*adopting* anything into `projects.json`. Worktrees are derived, never registered;
  nothing is being adopted, and no project registry write is part of this work.

## Sizing

**One leg = one vertical slice that leaves the tree green and committed.**

A leg is done when its slice is implemented, its tests are written and passing, the
narrowest meaningful checks are run (`npm test -- --run <file>`, plus `npm run typecheck`
if exported types changed), and the work is committed. Do not carry uncommitted work
across a handoff.

Expected shape is three legs (see `plan.md`). If a leg turns out bigger than one slice,
split it and hand off the remainder rather than doing "just a bit more".

## Task selection policy

1. Take the explicit **next leg** named in `status.md`.
2. If `status.md` does not name one, take the next unfinished slice in `plan.md` in order.
3. If neither is clear, or the next slice would change the design rather than implement it,
   **stop and raise the intervention signal**. Do not redesign inside a leg.

## Handover protocol

Before handing off, in this order:

1. Make the work durable: source + tests written, checks run, changes **committed** with a
   Conventional Commit message.
2. Update `status.md`: current position, last completed leg, next leg to run, next task,
   relevant context for the next runner, blockers.
3. Append a concise entry to `log.md`: what you did, decisions and why, artifacts changed,
   exact checks run and their results, handing-off vs stopping.
4. Then `spawn_session` **once**, with a prompt starting:

```text
Relay "worktree-autodetect" leg <N> begins now.

You are the next runner in this Relay method chain.

Read:
- .pi-web/relays/worktree-autodetect/charter.md
- .pi-web/relays/worktree-autodetect/status.md

Do not read log.md end-to-end. Use it only for targeted lookup if status.md or charter.md points you there.

Run one leg according to the charter. Before handing off, update status.md, append log.md, make work durable, then either spawn the next leg once or stop with a clear intervention note.
```

## Intervention signal

**Stop, do not spawn**, and write a clearly marked `## BLOCKED` section at the top of
`status.md` plus a log entry, if any of these happen:

- The next task is ambiguous, or doing it would require a design decision not in this charter.
- You are tempted to add a watcher, a timer, a new process, or a new push channel. That
  means the design boundary is being crossed — get the human.
- Refresh-on-resume cannot be made to preserve selection without visible UI churn
  (list reordering, chat scroll jump, session reload, terminal teardown). This is the
  main known risk; it is a stop, not a workaround.
- Filtering `prunable` would remove a workspace the user could plausibly still want
  (for example a temporarily unmounted network path) and you cannot bound that safely.
- `npm run verify` fails for a reason you did not introduce.

## Reading discipline

Read to orient: `charter.md`, then `status.md`, then only the files `status.md` names.

Do **not** read `log.md` end-to-end; use it only for targeted lookup when pointed there.
Do **not** read the sibling worktrees `/srv/dev/pi-web-worktrees/worktree-create-ui` or
`/srv/dev/pi-web-worktrees/model-questions-ux` — they are separate, parallel efforts. Per
the human's decision, assume they contribute nothing to this relay; this relay owns the
workspace-topology refresh seam outright.

Relevant source surface, small enough to read directly when your leg touches it:

- `src/server/workspaces/gitWorktreeDiscovery.ts` (39 lines)
- `src/server/workspaces/workspaceService.ts` (44 lines)
- `src/client/src/controllers/workspaceController.ts` (~105 lines)
- `src/client/src/appShell/browserResumeController.ts` + its test
- `src/client/src/components/PiWebApp.ts` — only `refreshAfterBrowserResume`
  (~line 432) and `refreshAppData` (~line 485). Do not read this 2300-line file whole.

## Project conventions that apply

- **Changesets:** this is user-visible. Add a `.changeset/*.md` fragment
  (see `.agents/skills/changeset-changelog/SKILL.md`). Never hand-edit `CHANGELOG.md`.
- **Skills:** use `.agents/skills/code-quality-architecture/SKILL.md` when writing
  production code and `.agents/skills/testing-guide/SKILL.md` when writing tests.
- **Session daemon:** this design deliberately touches **no** sessiond code, no session
  runtime ownership, and no daemon protocol. **No manual session daemon restart is
  required.** Changes land on the autoreloading `pi-web-web-ui-dev.service` path only.
  If a leg finds itself editing `src/server/sessiond.ts`, that is the intervention signal.
- **Client URL conventions:** no new endpoints are added; the existing
  `workspacesApi.workspaces()` request path is reused unchanged.
- **No `npm install`** — `node_modules` here is a symlink to the main checkout.
