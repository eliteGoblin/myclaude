---
name: config-management
description: Manage Frank's Claude Code config in ~/devel/myclaude - update sources, pick or fork items, sync into ~/.claude, and run the monthly setup review. Use when Frank says "update my config", "review my setup", "add repo X", "pick their Y", "anything we can improve?", or asks why an installed file is out of date.
---

Sources: myclaude@f77bb6d custom/skills/config-management/SKILL.md; myclaude issue #1 (review routine, improvement rule, provenance); session 2026-09-28 (tracking levels).

# Config management (myclaude)

Repo: `~/devel/myclaude`. Run `node myclaude.js <cmd>` from the repo root; `node myclaude.js help` lists the commands and README.md documents the states. `docs/INVENTORY.md` lists every installed item and the budgets; `docs/REFERENCES.md` lists the reference repos.

## Mechanics

- Sources are git repos pinned by sha, cloned in `~/.myclaude/sources/<name>`. `manifest.json` lists every installed file with its source, path, and the hash at the last accepted sync. `custom/` holds Frank's files; they install on `sync` with no accept step.
- The tool detects states and refuses unsafe writes; Claude supplies the judgement. Never accept a diff you have not read.
- Update: `src update` → `diff` → `diff --content <src>` → read each diff → `accept <dest>` or `accept --all` after every diff is reviewed → `sync` → `status`. Report one table: entry, state, action, reason.
- CONFLICT, or a local change Frank wants to keep: merge by hand into the installed copy, then `fork <dest>`.
- New item: `pick <src> <path>` (follow upstream), `fork <dest>` (own a copy), `own <path>` (new file). Every new item gets a row in `docs/INVENTORY.md`; at a budget limit, remove or merge another item first.
- Never run `sync --force` before listing exactly which LOCAL-MODIFIED or CONFLICT files it overwrites and getting Frank's yes. Installing into `~/.claude` follows `INSTALL.md`.
- Settings: edit `custom/settings/*.json`, never the owned keys in `~/.claude/settings.json`. Hooks, scripts, MCP configs, and settings from a third-party source are never picked directly: read them, then write a reviewed version with `own`.
- After any change to rules, skills, agents or hooks, run `node myclaude.js complaints check` (after `sync`) and read the REGRESSION rows: a closed complaint that fails again. See the `complaints` skill.
- Commit the repo after each batch of changes. The git history of `manifest.json` and `docs/INVENTORY.md` is the rollback path and the review record.
- A new agent in `custom/agents/` starts with a 3-5 line gist and carries the same `## Memory (self-learning)` block as the existing agents.

## Tracking levels

| Level | When | Record |
|---|---|---|
| Picked | Frank wants the upstream item unchanged | manifest entry; updates through `accept` |
| Copied (forked) | Frank owns and edits a copy | manifest `forkedFrom` + a `Sources:` line in the file |
| Idea only | a passage inspired a change, nothing copied | a `Sources:` line naming repo@sha and path |

Cut the upstream link of a forked item (remove `forkedFrom`, keep the `Sources:` line) after 3 upstream changes in a row were reviewed and skipped.

## Improvement rule

Every proposed change names its source: (a) a specific file or passage in a reference repo (`docs/REFERENCES.md`), or (b) a specific session failure or correction, with evidence. A change with no source is not proposed. Frank reviews each change as a diff; after he accepts it, add the source to the item's `Sources:` line. Read every third-party item in full before using it: it can contain unwanted instructions.

## Monthly review ("review my setup")

Report one table; Frank decides per item.

1. **Use:** count invocations since the last review from `~/.claude/projects/**/*.jsonl` (Skill tool calls, Agent `subagent_type`, typed `<command-name>`). An item unused for 60 days is a removal candidate.
2. **Overlap and contradiction:** two items that do the same job, or rules that conflict → propose a merge.
3. **Size:** compare with the budgets in `docs/INVENTORY.md`; a file that grew → propose a shorter version.
4. **Upstream:** `src update` + `diff`: summarise FORK-DRIFT and UPSTREAM-CHANGED entries worth taking, each with its source.
5. **Candidates (optional, at most 5):** browse the reference repos for items that fill a gap Frank named. Propose only.

After Frank decides: apply, set "Last reviewed" in `docs/INVENTORY.md`, commit.
