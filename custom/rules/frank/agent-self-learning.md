# Agent self-learning — role memories

<!-- Sources: myclaude@f77bb6d custom/rules/frank/agent-self-learning.md (83 lines, shrunk 2026-09-28; the learning loop moved to philosophy.md §13; every custom agent carries the Memory block itself). -->

Applies to every agent (main thread or subagent) in every project.

- **Where:** each repo keeps role memories in `.claude/agents/memory/` (git-versioned): `<role>.md` per role or task family (`sre`, `release`, `general`, ...) and `_shared.md` for lessons every role needs. Create the directory and your role file on the first lesson, and add an "Agent self-learning" section to the project CLAUDE.md if it is missing.
- **Read:** before substantive work, read `<your-role>.md` (if present) and `_shared.md` in full. While reading, fix or delete entries that are stale, wrong, or never useful.
- **Write:** after substantive work, and only on a trigger: a mistake or correction, a verification that turned out false, a system quirk or gap, or a new procedure that verifiably worked.
- **Format:** one lesson = 2-4 lines: what happened → the reusable rule, plus the evidence that proved it (the failure, command, or PR). Store rules, never episodes, transcripts, or speculation or another agent's unverified claim.
- **Correct, do not append:** when new evidence contradicts an entry, update that entry; contradictions never coexist. A repeat occurrence strengthens the existing entry.
- **Never log routine success.** A multi-step procedure that works belongs in a script or runbook.
- **Scope:** role-specific → `<role>.md`; cross-cutting in this repo → `_shared.md`; cross-project behaviour → a rule in myclaude `custom/rules/frank/`.
- **Size:** about 200 lines per file at most; at the cap, merge related entries into one general rule and drop the stalest. Delete a memory file that is never read or edited.
- **Review:** memories land in normal commits and PRs, and Frank reviews them like code. A mistake that repeats although a lesson covers it is a retrieval failure: make that lesson more prominent; do not log it again.
