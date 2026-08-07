# Agent Self-Learning — Role Memories

> Custom always-on rule. Highest priority — overrides upstream rules on conflict.
> Lives in `fsun_config/custom/rules/frank/agent-self-learning.md`, installs to
> `~/.claude/rules/frank/agent-self-learning.md` via `ecc.js sync`.
> Applies to EVERY agent (main thread or subagent) in EVERY project.

## The convention

Each repo keeps role-keyed memory files at **`.claude/agents/memory/`** (repo-relative,
git-versioned — lessons survive sessions and are reviewable in PRs):

- `<role>.md` — one file per role / task family (`sre`, `release`, `e2e-verify`,
  `docs`, `loadtest`, `general`, …). Role = your agent type or the task family.
- `_shared.md` — cross-cutting lessons every role needs.

**Bootstrap:** when starting work in a repo without `.claude/agents/memory/`,
create it on the first lesson (dir + your role file), and add the "Agent
self-learning" section to the project CLAUDE.md if missing.

## Read discipline

BEFORE substantive work: read `.claude/agents/memory/<your-role>.md` (if it exists)
plus `_shared.md`. That's the whole retrieval model — small curated files read whole
at start; role-keyed filenames ARE the index (no search infra needed).

## Write discipline

Write AFTER substantive work, at defined triggers only: a mistake/correction, a
verification that turned out false, a system quirk/gap discovered, or a novel
procedure that verifiably worked. Then:

- **Distill, don't transcribe.** One lesson = 2-4 lines: what happened → the
  reusable rule. Store rules/procedures, never episodes, transcripts, or diary.
- **Evidence-backed.** Each lesson notes what proved it (the failure, correction,
  command, or PR). No lessons from speculation or another agent's unverified claim.
- **Correct over append.** New experience contradicts an entry → UPDATE that entry
  (git history keeps the old one). Contradictions must never coexist.
- **Dedupe.** Repeat occurrence = strengthen/merge the existing entry, not a new one.
- **Never log routine success.** Only surprises, failures, corrections, quirks.
  A multi-step procedure that works end-to-end belongs in a script/runbook, not memory.
- **Scope honestly.** Role-specific → `<role>.md`; cross-cutting → `_shared.md`;
  cross-PROJECT behavior → an ECC rule / instinct, not a repo memory.

## Bloat + poison control

- **Cap ~200 lines per file.** At the cap, consolidate: merge related entries into
  one more general rule; drop the stalest.
- **Reading is curating.** When reading memory, fix or delete entries that are stale
  (system changed), wrong (contradicted by observation), or never useful.
- **Human review loop:** memories land in normal commits/PRs — Frank reviews lesson
  diffs like code. A wrong lesson is corrected/reverted in review, never compounded.
- **Metric:** the repeat-mistake. If a mistake recurs that an existing lesson already
  covered, that's a retrieval/compliance failure — surface it and make the lesson
  more prominent, don't just re-log it.
- **Prune what never gets used.** A memory file that is never read or edited is dead
  weight — delete it rather than carrying it.

## Canonical "## Memory" block for agent definitions

Every custom agent definition (`fsun_config/custom/agents/*.md`) carries this exact
section (swap `<role>` for its role file):

```markdown
## Memory (self-learning)

If the project you are working in has a `.claude/agents/memory/` directory (repo-relative), read `.claude/agents/memory/<role>.md` and `.claude/agents/memory/_shared.md` BEFORE substantive work. AFTER substantive work, append distilled lessons there (mistakes, quirks, gaps, corrections — 2-4 lines each: what happened → the reusable rule; dedupe rather than repeat; never log routine success), per the project CLAUDE.md "Agent self-learning" convention if present.
```

## How the learning layers compose (no duplication)

| Layer | Scope | Substrate |
|---|---|---|
| `continuous-learning-v2` instincts | Main-thread Claude's cross-session habits (style, workflow), confidence + promote/prune lifecycle | hook-observed, `ecc-homunculus` data dir |
| **Agent role memories (this rule)** | Per-ROLE, per-REPO operational lessons (system quirks, env facts, verified gotchas) | `.claude/agents/memory/*.md`, git |
| `learn-from-mistakes` | The main-thread reflect→generalize→encode loop when Frank corrects a mistake | routes each lesson to the right layer above (or an ECC rule) |

A lesson goes to exactly ONE layer: project/system fact → role memory; personal
cross-project habit → instinct/ECC rule.

<!-- Research grounding for the mechanics above: Reflexion (Shinn 2023) and ExpeL
     (Zhao 2023) on distilled reflections over transcripts and post-failure write
     triggers; Voyager (Wang 2023) and Agent Workflow Memory (Wang 2024) on inducting
     only from verified successes; Generative Agents (Park 2023) on threshold-gated
     reflection; MemGPT/Letta (Packer 2023) on a small always-loaded core plus
     read-on-demand rest; Mem0's ADD/UPDATE/DELETE on correction-over-append; the
     2026 memory-poisoning/misevolution work on evidence-gated writes and provenance.
     Full write-up:
       git show f4853445 -- fsun_config/custom/rules/frank/agent-self-learning.md
     -->
