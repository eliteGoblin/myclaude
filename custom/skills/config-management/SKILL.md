---
name: config-management
description: Update Claude config sources, cherry-pick skills/rules/agents from repos, or manage the myclaude manifest. Use when Frank says "update my config", "add repo X", "pick their Y skill", "why is file Z out of date", or anything about ~/.claude installs, sources, pins, or sync.
user-invocable: true
---

# Config management (myclaude)

Repo: `~/devel/myclaude`. Run every command as `node myclaude.js <cmd>` from the repo root.
`node myclaude.js --help` lists all commands; README.md documents states and rules.

## The model

1. Git sources are pinned by sha; full clones live in `~/.myclaude/sources/<name>`.
2. `manifest.json` lists every installed file: source, path, dest, hash at last accepted sync.
3. `custom/` holds files Frank owns; they install on `sync` with no accept step.
4. `sync` installs into `~/.claude`, comparing source (S), recorded hash (B), installed copy (D).
5. The tool is mechanical: it detects states and refuses unsafe writes. It does not judge diffs.
6. Claude supplies the judgment: read diffs, decide accept/fork/skip, explain to Frank.

## Update workflow ("update my config")

1. `src update` — fetch every source; clone HEAD moves to the ref tip, pins stay.
2. `diff` — list entries not CURRENT; `diff --content <src>` for the unified diffs.
3. READ each diff and judge it. Never accept a change you have not read.
4. `accept <dest>` for safe changes; prefer `accept --all` only after reviewing every diff (a per-entry accept moves that source's pin past unaccepted siblings).
5. CONFLICT or a change Frank wants to keep locally: hand-merge into the installed copy, then `fork <dest>` to move it into `custom/` with provenance.
6. `sync` — install; then `status` to confirm.
7. Report a table to Frank: entry, prior state, action taken, reason.

Never run `sync --force` without first listing exactly which LOCAL-MODIFIED or CONFLICT files it will overwrite and getting Frank's yes.

## Adding a source and picking files

```bash
node myclaude.js src add <name> <repo-url> [--ref r]   # clone + pin at ref tip
node myclaude.js ls <name> [prefix]                    # what it offers (* = picked)
node myclaude.js pick <name> <path> [--as newname]     # track a file or dir/
node myclaude.js sync                                  # install
```

Dest rule: user-scope skills are flat, so `skills/<category>/<name>/` installs as `skills/<name>/`; every other path installs 1:1 under `~/.claude`. `--as` renames the last segment (use it to avoid name collisions with already-installed skills). `pick` refuses a dest another source already provides.

## Discovery ("anything new in repo X?")

1. Read the pin: `node myclaude.js src ls`.
2. In `~/.myclaude/sources/<name>`: `git log --oneline <pinned-sha>..HEAD` and inspect files of interest.
3. Propose picks to Frank as a list, one line of reason each (what it does, why it fits).
4. Wait for his yes before picking, unless he pre-approved in the request.

## Install / new machine

```bash
git clone https://github.com/eliteGoblin/myclaude.git ~/devel/myclaude
cd ~/devel/myclaude && node myclaude.js install   # clones sources at pins, then sync
```

Settings fragments: `custom/settings/*.json` deep-merge into `~/.claude/settings.json` on `sync`; the manifest's `settingsOwned` lists every leaf they own. Never hand-edit those keys in `~/.claude/settings.json` — edit the fragment and `sync`. A hand edit shows as LOCAL-MODIFIED and blocks sync.

## Safety rails

- Commit the myclaude repo after every batch of changes (manifest edits, accepts, new custom files). Git history of `manifest.json` is the rollback path.
- LOCAL-MODIFIED means a human edited the installed copy. Investigate what changed and why before any overwrite; `fork` keeps the edit, `--force` destroys it.
- DELETED-UPSTREAM keeps the installed copy; resolve deliberately with `unpick` or `fork`.
- Provenance lives in `manifest.json` and the generated `skills/SOURCES.md` — never edit installed files in place; that breaks hash tracking.
- New custom file: `own <path>` (creates a stub, registers it); it never overwrites an existing file.

## Canonical "## Memory" block for custom agent definitions

Every custom agent definition (`custom/agents/*.md`) carries this exact section (swap `<role>` for its role file):

```markdown
## Memory (self-learning)

If the project you are working in has a `.claude/agents/memory/` directory (repo-relative), read `.claude/agents/memory/<role>.md` and `.claude/agents/memory/_shared.md` BEFORE substantive work. AFTER substantive work, append distilled lessons there (mistakes, quirks, gaps, corrections — 2-4 lines each: what happened → the reusable rule; dedupe rather than repeat; never log routine success), per the project CLAUDE.md "Agent self-learning" convention if present.
```
