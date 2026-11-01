# Clean up the old setup (after install)

Written for Claude. Run it when Frank says "clean up the old setup", after `INSTALL.md` has passed its verify step. For each step: run the check, show Frank one table (step | finding | proposed action), then do the actions he approves. Never delete without his yes; prefer moving to a backup over deleting.

## Steps

| # | Item | Check | Action |
|---|---|---|---|
| 1 | Old CLI link | `ls -la ~/.local/bin/myclaude` (before this cleanup it pointed to `~/devel/everything-claude-code/fsun_config/myclaude`) | `ln -sfn ~/devel/myclaude/myclaude ~/.local/bin/myclaude`, then `myclaude help` works |
| 2 | Claude Bible clone `~/claude-bible` | `diff -q ~/claude-bible/claude-bible.md custom/philosophy-src/claude-bible.md` and the same for `fsun.md` show no difference | If identical: move `~/claude-bible` to `~/.myclaude/archive/claude-bible-<date>`. If different: copy the newer text into `custom/philosophy-src/` and commit first |
| 3 | Old ECC fork setup `~/devel/everything-claude-code/fsun_config` | `node myclaude.js status` is clean (the new setup is live) | Do not delete. Add one line at the top of `fsun_config/README.md` (or create it): "Retired 2026-09 — config now lives in eliteGoblin/myclaude". Commit on a branch and open a PR in the fork (its main is protected) |
| 4 | GitHub fork `eliteGoblin/everything-claude-code` | Step 3 done; no open PRs Frank still wants | **Ask Frank** whether to archive the fork (reversible in GitHub settings). Do not archive without his yes |
| 5 | Install backup `~/.claude/backups/myclaude-<timestamp>/` | At least 14 days of normal use with no restore needed | **Ask Frank**, then delete old backups and keep the newest one |
| 6 | Dead permission rule | `grep -n 'git push \* :\*' custom/settings/permissions.json` | **Ask Frank**: remove it (sessions stop printing a warning) or replace it with `Bash(git push *)` (every push asks for approval). Then `sync` |
| 7 | Leaked GitHub token (2026-09-28) | A `gho_` token for eliteGoblin was printed in a local session log | Tell Frank to run `gh auth refresh -h github.com -u eliteGoblin` or revoke it in GitHub Settings → Applications. Claude cannot do this |
| 8 | Links to removed rules | `grep -rln '\.\./common/' ~/.claude/rules` (python/typescript packs link to `common/*`, which is no longer installed) | Remove the dead links in the forked copies, or fork the two packs into `custom/` and fix them there |
| 9 | Memory, notes, and installed files that describe the old setup | `grep -rln 'ecc.js\|fsun_config' ~/.claude/projects/*/memory ~/.mycc/notes.md ~/.mycc/knowledge.md ~/.claude/skills ~/.claude/agents ~/.claude/commands ~/.claude/rules` (ignore provenance lines such as "moved to myclaude") | Update each hit to point to myclaude; mark finished notes DONE |
| 10 | Unused source clones | `node myclaude.js src ls` (a source with 0 entries, for example `karpathy`) | Keep if it is in `docs/REFERENCES.md`; otherwise `src rm <name>` |

## Never touch

`~/.claude/skills/synced/`, `~/.claude/skills/.trash/`, `~/.claude/plugins/`, `~/.claude/projects/`, `~/.claude/session-data/`, `~/.claude/settings.local.json`, `~/.claude.json`.

## Done when

Every row is either done or explicitly skipped by Frank, and the table with the outcome is reported to him. Update `docs/INVENTORY.md` "last reviewed" if any item changed.
