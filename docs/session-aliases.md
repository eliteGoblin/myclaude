# Session Aliases — alias-first session management

**Status:** built (branch `feat/session-alias-registry`, PR #19) — pending merge
**Owner intent (Frank):** "I want persistent sessions I can switch to by alias. Hide session IDs from me. One alias = one project/topic. Same-alias context should be together, otherwise it's confusing."

## Problem

Sessions were addressed by opaque IDs, and context for one project/topic ended up
scattered across many session files and folders. Switching back to a piece of work
meant remembering IDs and manually stitching context together.

## What it does

An **alias** is the human name for a project/topic. Everything session-related is
organized around aliases, and session IDs are hidden from the user.

- **Explicit registry** (`~/.claude/session-registry.json`) is the source of truth:
  many sessions map to exactly one alias; an alias can own one or more folders
  (e.g. worktrees). New sessions automatically join their folder's alias.
- **`/sessions`** shows an alias overview: the current folder's alias, a table of
  all aliases, and any unassigned folders with *suggested* names — it suggests and
  waits for confirmation, never silently creates.
- **`/sessions switch <alias>`** loads the WHOLE alias context: all member
  summaries (unbudgeted) plus transcripts from every attached folder
  (token-budgeted).
- **Organizing verbs** (all human-initiated):
  - `attach` — let one alias span multiple folders
  - `assign` — move a session to an alias
  - `gather --topic` — pull topic-matching sessions (from anywhere) into an alias
  - `absorb` — merge whole aliases into one
  - `consolidate` — fold all members into ONE latest session file; older files
    are archived (`session-data/archive/`), never deleted
  - `rename`, `unalias`
  - `ignore` — mark scratch folders (e.g. `~/claude_adhoc`) as never-tracked
- **Session-start hint:** when a session starts, the user gets a contextual nudge —
  folder has an alias (offer to switch into it), folder hosts multiple aliases
  (ask which), no alias (ask to create one, suggested name = folder name),
  ignored folder (stay silent).
- **No automatic pruning:** session retention cleanup is disabled globally;
  any cleanup is manual and human-confirmed.

## Decisions (product altitude)

| # | Decision | Why |
|---|----------|-----|
| 1 | Membership lives in an explicit, inspectable **registry file** — not derived from folder layout | One folder can host two aliases, and sessions must be reassignable; deriving from folders can't express either |
| 2 | **Many sessions → one alias**; each session belongs to exactly one alias | Frank: "One alias = one project/topic. Same-alias context should be together, otherwise it's confusing" |
| 3 | Merging is **lazy at load time** by default; physical `consolidate` is opt-in and **archives rather than deletes** | Full context on switch without destructive side effects; nothing is lost by default |
| 4 | **Nothing is created or deleted silently** — unaliased folders get a suggestion and wait for a human yes; cleanup is manual | Trust: the registry stays something the human recognizes as their own organization |
| 5 | "Ask to persist" moved from session **exit** to session **start** | An exit-time prompt is infeasible (hooks can't prompt the user); continuous auto-save after every response already covers persistence, so the human question happens as a start-of-session hint instead |

## Honest limitations

- Alias switching loads transcripts under a token budget — very large aliases
  won't fit their entire history in one switch.
- `gather --topic` depends on topic matching quality; it proposes membership,
  it doesn't guarantee perfect recall.
- With global retention pruning off, session data grows until the human
  consolidates or cleans up manually — that's by design, but it's on the human.

## Relationship to prior work

Extends the context-rich `/sessions load` overlay (see
[sessions-extended.md](./sessions-extended.md)). That doc covers budgeted
transcript loading and topic filtering; this doc covers the alias/registry
organization layer built on top of it.
