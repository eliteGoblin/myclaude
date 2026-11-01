# myclaude — Requirements

Frank's personal Claude Code configuration: a small, curated set of rules, skills, agents, and commands that Frank owns and improves over time. Design record: GitHub issues #1 (curated setup), #2 (INSTALL.md), #3 (usage report, not built yet).

## Principles

- Less is more. Every item fixes a named failure mode (F1-F6 in `docs/INVENTORY.md`) or is a work tool Frank uses.
- Budgets: ≤ 4 always-on rule files and ≤ 400 lines (each ≤ 200 lines); ≤ 15 model-invoked skills; ≤ 10 agents; ≤ 10 commands. At a limit, remove or merge before adding.
- Upstream repos are references to read, not bases to follow (`docs/REFERENCES.md`). Items Frank edits are forked into `custom/`; items he follows unchanged stay picked and update through `accept` after a reviewed diff.
- Every item in `custom/` has a `Sources:` line. Every proposed change names its source: a reference-repo file or a session failure.
- Nothing is applied automatically. Claude reads every diff; Frank decides.

## Functional

- One manifest (`manifest.json`) lists every installed file, its source, pin, and hash; `node myclaude.js` compares source, recorded hash, and installed copy before writing (README.md).
- `INSTALL.md` lets Claude install into an existing `~/.claude` with a backup, one comparison table, one confirmation, and verification. App-owned paths (`skills/synced/`, `skills/.trash/`, `plugins/`, `projects/`, `session-data/`, `settings.local.json`, `~/.claude.json`) are never touched.
- Monthly review ("review my setup") with the `config-management` skill: use, overlap, size, upstream changes, at most 5 candidates.
- Frank's complaints and feature requests are kept as exact quotes with repeatable checks in `requirements/complaints/` (`node myclaude.js complaints check`); an item closes only when its check passes.
- Works on Linux (WSL) and macOS; Node >= 18, standard library only.

## Session tooling

Alias-first session management (`/sessions`, `/save-session`, `/resume-session`) and its scripts: see `docs/session-aliases.md`, `docs/sessions-extended.md`, and `requirements/features/sessions-native-uuid-resume.md`.
