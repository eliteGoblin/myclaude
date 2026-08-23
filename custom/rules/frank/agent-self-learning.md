# Agent Self-Learning — Role Memories and the Learning Loop

<!-- Custom always-on rule. Source: custom/rules/frank/agent-self-learning.md in the myclaude repo; installed by `node myclaude.js sync`. -->

Applies to every agent (main thread or subagent) in every project.

## The convention

Each repo keeps role-keyed memory files at `.claude/agents/memory/` (repo-relative,
git-versioned — lessons survive sessions and are reviewable in PRs):

- `<role>.md` — one file per role / task family (`sre`, `release`, `e2e-verify`,
  `docs`, `loadtest`, `general`, …). Role = your agent type or the task family.
- `_shared.md` — cross-cutting lessons every role needs.

Bootstrap: when starting work in a repo without `.claude/agents/memory/`,
create it on the first lesson (dir + your role file), and add the "Agent
self-learning" section to the project CLAUDE.md if missing.

## Read discipline

Before substantive work: read `.claude/agents/memory/<your-role>.md` (if it exists)
plus `_shared.md`. That is the whole retrieval model — small curated files read whole
at start; role-keyed filenames are the index (no search infrastructure needed).

## Write discipline

Write after substantive work, at defined triggers only: a mistake/correction, a
verification that turned out false, a system quirk/gap discovered, or a novel
procedure that verifiably worked. Then:

- **Distill, don't transcribe.** One lesson = 2-4 lines: what happened → the
  reusable rule. Store rules/procedures, never episodes, transcripts, or diary.
- **Evidence-backed.** Each lesson notes what proved it (the failure, correction,
  command, or PR). No lessons from speculation or another agent's unverified claim.
- **Correct over append.** New experience contradicts an entry → update that entry
  (git history keeps the old one). Contradictions must never coexist.
- **Dedupe.** Repeat occurrence = strengthen/merge the existing entry, not a new one.
- **Never log routine success.** Only surprises, failures, corrections, quirks.
  A multi-step procedure that works end-to-end belongs in a script/runbook, not memory.
- **Scope honestly.** Role-specific → `<role>.md`; cross-cutting → `_shared.md`;
  cross-project behavior → a rule in `custom/rules/frank/`, not a repo memory.

## Bloat + poison control

- **Cap ~200 lines per file.** At the cap, consolidate: merge related entries into
  one more general rule; drop the stalest.
- **Reading is curating.** When reading memory, fix or delete entries that are stale
  (system changed), wrong (contradicted by observation), or never useful.
- **Human review loop:** memories land in normal commits/PRs — Frank reviews lesson
  diffs like code. A wrong lesson is corrected/reverted in review, never compounded.
- **Metric:** the repeat-mistake. If a mistake recurs that an existing lesson already
  covered, that is a retrieval/compliance failure — surface it and make the lesson
  more prominent, don't just re-log it.
- **Prune what never gets used.** A memory file that is never read or edited is dead
  weight — delete it rather than carrying it.

## When a mistake happens — the learning loop

Frank is hurt when a mistake — a hallucination, an inference presented as fact, a
conclusion built on a failed verification, or an unconfirmed destructive action —
costs him time or trust. The fix is to encode the lesson so it cannot repeat.

Trigger: I made a mistake or Frank corrected me; a verification turned out false or
was based on bad data; an action surprised Frank or was not what he wanted; Frank
says "you got this wrong / that's your inference".

1. **Reflect** — state plainly what went wrong and the root cause, in 1-2 lines. No
   defensiveness, no over-explaining.
2. **Generalize** — extract the one reusable lesson: what rule would have prevented this?
3. **Encode at the right scope** (one layer per lesson):
   project-specific fact/decision → auto-memory (`MEMORY.md`); per-role, per-repo
   operational lesson → `.claude/agents/memory/<role>.md`; cross-project behavior →
   update an existing rule in `custom/rules/frank/` (prefer editing over adding).
4. **Sync** — rule changes install via `node myclaude.js sync` (note it for Frank).
5. **Confirm** the lesson back to Frank in one line so he can correct it.

Keep it simple: one concise, actionable lesson per mistake, not a policy essay;
simple + reliable over rules for rare edge cases; consolidate into existing
rules/memories rather than adding new ones; capture what changes future behavior,
not the trivial.

The canonical "## Memory" block that every custom agent definition carries lives in the config-management skill (authoring reference, not needed at run time).
