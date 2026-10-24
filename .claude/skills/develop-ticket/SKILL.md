---
name: develop-ticket
description: Develop a ticket (a GitHub issue) - acceptance criteria, tests first, implementation, quality gate (tests, build, the running app, a review loop by a fresh agent), hand-off of the uncommitted changes for the user to verify, retro. Also resumes a ticket in progress. Use when asked to work on, implement, develop or continue a ticket.
argument-hint: <issue number>
---

# Develop ticket $ARGUMENTS

## Before anything

- **`.ticket.md` exists in the repo root and its `Step:` isn't `done`:** read it and continue at the
  step its `Step:` line names. On a resume, check `git log <Start>..HEAD` and `git status` against the
  progress log before going on.
- **No `.ticket.md`, or it says `Step: done`:** start at step 1, which overwrites the finished one.

## Rules for the whole flow

- `.ticket.md` (gitignored, from `ticket-template.md` next to this file) is the state. After every step,
  update its `Step:` line and add a line to the progress log. Write decisions to `## Decisions`, and
  every correction the user makes to `## Corrections`. Agents get their context from `.ticket.md` and
  report back short results, never file dumps.
- Everything the flow produces lives in `.ticket.md`, never only in the scratchpad, which is gone after
  a restart.
- There are two stops: unclear criteria at step 1 (only if needed) and the hand-off at step 5. Between
  them, work without asking unless something blocks you.
- The user reviews the work uncommitted and unstaged. Until the hand-off, commit `wip: <slice>` freely
  as checkpoints; step 5 undoes them. Never push, never force anything.
- Follow CLAUDE.md, in particular: build only what the ticket asks and offer extras in the reply, and
  never add Claude attribution to a commit message.

## 1. Intake

The user gives the issue number, plus any spec and acceptance criteria the issue doesn't hold.

1. `git status` must be clean, since the `wip:` commits would take in anything already changed. If it
   isn't, stop and ask.
2. Read the issue with `gh issue view <number> --comments`. If the user describes a ticket that has
   no issue yet, create one with `gh issue create` and use its number.
3. Create `.ticket.md` from the template. Set `Start:` to `git rev-parse HEAD`. Put the spec into
   `## Spec` and each criterion as Given / When / Then into the criteria table, with the level of the
   one test that proves it most cheaply. All tests are Vitest specs under `web/src/app`:

   | Criterion describes | Its test case |
   |---|---|
   | A calculation on ride data (power, climbs, totals, the time axis, FIT parsing) | A spec next to the module in `ride/`, on a synthetic ride |
   | What the chart draws or reads out on hover | `ride-chart/chart-option.spec.ts`, on `buildChartOption` |
   | How a number is written (units, rounding, unknown values) | `climb-format.spec.ts` |
   | What the page shows (stats, notices, errors, the climbs table) | `app.spec.ts`, through the DOM with TestBed |
   | Chart interaction (drag selection, zoom) | No automated test: checked in the running app at step 4 |

4. If a criterion is ambiguous, contradicts the spec or can't be tested, **STOP** and ask, all
   questions at once. Otherwise go on without asking.

## 2. Tests first

Write the one test per criterion and record its name in the criteria table. Every test must fail
now, for the right reason (missing behavior, not a compile error in unrelated code). Run them with
`npx ng test --watch=false` in `web/` (plain `vitest` skips the Angular test setup).

## 3. Implement

Write a short `## Approach` to `.ticket.md` first: slices in order with their files and the criteria
tests they make pass. Keep logic in the pure `ride/` modules and the chart option builder, and keep
`App` to wiring and messages. No approval needed.

Work slice by slice. Per slice: write the code, make that slice's tests pass, commit `wip: <slice>`,
log it.

## 4. Quality gate

All of these must pass:

- `npx ng test --watch=false` and `npx ng build` in `web/` (use `npx ng`: the global `ng` is too old).
- The change works in the running app. If port 4300 is already in use, check that it's the user's
  own `ng serve (mtb-power)` from `web/`, which watches the working tree, and reuse it. Otherwise
  start `npx ng serve` in `web/` in the background and use the port it reports. Open the app with the
  Chrome DevTools tools and check every criterion the ticket changed on screen. The demo ride loads on
  its own; other files can only be uploaded from inside the repo. Afterwards, stop only a server you
  started yourself, unless the user wants it running.
- **Review loop.** A fresh agent that didn't write the code reviews `git diff <Start>` (plus new files)
  against `## Spec` and the criteria. It reports only findings with a concrete consequence (a bug,
  values that can drift apart, dead code, a false comment, a real test gap), never style, and says
  "No important findings." when there are none. It also checks that ride data never leaves the
  browser, as the page promises.
  - Check every finding against the code before acting on it; record the ones you skip in
    `## Decisions` with the reason.
  - Fix the confirmed findings, rerun the tests, then start a new fresh reviewer on only that round's
    changes. Repeat until a round has no important findings.
  - If the findings stop shrinking (the same kind of problem keeps coming back), stop the loop and
    bring it to the user instead.

Record each test result and each review round in `.ticket.md`.

## 5. Hand-off

1. `git reset <Start>`: the `wip:` commits are gone and all the work is in the working tree,
   unstaged. From here on, never commit until the user says so; edit the working tree only.
2. **STOP:** show the user, in a few lines:
   - what changed, and the criteria table with results,
   - the review rounds: findings fixed or skipped,
   - the proposed commit message: one imperative line, no Claude attribution.

The user verifies, often in tuicr. Corrections they bring go into `## Corrections`; fix them in the
working tree and rerun the affected part of the gate. When the user says to commit, commit with the
proposed message. Push only when asked.

## 6. Retro

1. Ask whether to close the issue (`gh issue close <number>`), as CLAUDE.md says.
2. Go through `## Corrections`, `## Decisions` and the session for what the user had to correct or
   explain. Propose concrete changes to CLAUDE.md (learnings live there, not in Claude's memory) or to
   this skill, each as a one-line rule with its reason. Apply the ones the user picks and leave them
   uncommitted, listed apart from the ticket's changes.

When the retro is over, set `Step: done` in `.ticket.md`, so the next ticket starts fresh.
