# Install myclaude into an existing ~/.claude

Instructions for Claude. When Frank says "install myclaude", follow these steps in order. myclaude adds no install logic beyond `node myclaude.js`; this file states what is installed and how.

Run every command from the repo root (the directory that holds this file). `CLAUDE_HOME` below means `$MYCLAUDE_CLAUDE_HOME` if set, else `~/.claude`.

## What myclaude contains

`docs/INVENTORY.md` lists every item, where it installs, and why. `manifest.json` lists the exact paths and hashes. Items install under `CLAUDE_HOME/{agents,commands,rules,skills,scripts}`; settings fragments in `custom/settings/*.json` merge into `CLAUDE_HOME/settings.json`.

## Never touch

Do not read-modify, move, back up into the old-files set, or delete any of these:

- `CLAUDE_HOME/skills/synced/` (skills the Claude app syncs)
- `CLAUDE_HOME/skills/.trash/`
- `CLAUDE_HOME/plugins/`, `CLAUDE_HOME/projects/`, `CLAUDE_HOME/session-data/`
- `CLAUDE_HOME/settings.local.json`
- `~/.claude.json` (MCP servers and app state)

Also leave alone everything else outside `agents commands rules skills scripts settings.json` (for example `CLAUDE.md`, `history.jsonl`, `sessions/`, `session-registry.json`).

## Steps

1. **Prerequisites.** `node --version` is 18 or later; `git` is on PATH. Run `node myclaude.js install --dry-run`: it clones every source at its pinned sha into `~/.myclaude/sources/` and reports what `sync` would do, without writing to `CLAUDE_HOME`.

2. **Back up.** Create the backup directory `CLAUDE_HOME/backups/myclaude-<YYYYMMDD-HHMMSS>/` and write a tar of the current state into it:
   ```bash
   B="$CLAUDE_HOME/backups/myclaude-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$B"
   tar -C "$CLAUDE_HOME" --exclude='skills/synced' --exclude='skills/.trash' -czf "$B/before.tgz" agents commands rules skills scripts settings.json
   tar -tzf "$B/before.tgz" | wc -l
   ```
   Check that the tar lists files (the count is not 0). If `tar` fails, stop and report. Also record the never-touch state for step 7:
   ```bash
   (cd "$CLAUDE_HOME" && find skills/synced skills/.trash settings.local.json -type f -exec sha256sum {} + 2>/dev/null | sort) > "$B/never-touch.before"
   ```

3. **Compare.** Run `node myclaude.js diff` and `node myclaude.js status`. Build one table for Frank with one row per path:
   - **same**: CURRENT;
   - **different**: MISSING (new), LOCAL-MODIFIED or CONFLICT (the installed copy differs; `node myclaude.js diff --content <dest>` shows how);
   - **only on this machine**: the "other files" that `status` lists (files myclaude does not contain: other layers or an old setup).
   For each "different" item that is LOCAL-MODIFIED or CONFLICT, read the diff and say in one line whether the installed copy holds an edit that the myclaude version lacks. Such an edit is not lost (the backup keeps it), but Frank must know before he says yes.

4. **Show the table and wait for Frank's yes.** This is the only confirmation. If Frank pre-approved the replacement in his request, continue.

5. **Replace.** Run `node myclaude.js sync --force`. It prints the files it overwrites first, then copies every inventory item, merges the settings fragments (writing `settings.json.bak` first), and regenerates `skills/SOURCES.md`.

6. **Leave other files alone.** `node myclaude.js status` lists "other files": everything in `~/.claude` that myclaude does not contain (other layers such as corp or focusd, or an old setup). Show the list to Frank. myclaude only installs its own items; move an old-setup file to `$B/old/<same relative path>` only when Frank names it.

7. **Verify.** Every check must pass; report each with its evidence.
   - `node myclaude.js status`: every entry CURRENT.
   - `node myclaude.js diff`: reports 0 entries that are not CURRENT.
   - `node -e 'JSON.parse(require("fs").readFileSync(process.argv[1]))' "$CLAUDE_HOME/settings.json"` exits 0.
   - The never-touch paths are unchanged: run the same `find ... | sort` into `$B/never-touch.after` and `diff` it with `$B/never-touch.before` (no output).
   - A new session lists the expected items: `claude -p "List the names of the skills, agents, and slash commands available to you, one per line."` shows the inventory items and none of the removed ones.

## Restore

To return to the state before the install: remove the installed `agents commands rules skills scripts settings.json` except `skills/synced/` and `skills/.trash/`, then `tar -C "$CLAUDE_HOME" -xzf "$B/before.tgz"`. `old/` in the backup holds the moved files as a second copy.

## Next

After the verify step passes, clean up the old setup: follow `CLEANUP.md` (Frank says "clean up the old setup").
