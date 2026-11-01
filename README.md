# myclaude

Frank's **base layer** for Claude Code: how Claude works with him in every project. It holds one philosophy rule, a few always-on rules, skills, agents, hooks, and settings, all small and reviewed (`docs/INVENTORY.md`). `myclaude` writes this layer into each machine's `~/.claude` and keeps it in sync. It stores and manages only its own items.

## Install on a new machine

Needs `git`, Node >= 18, and the Claude Code CLI.

```bash
curl -fsSL https://raw.githubusercontent.com/eliteGoblin/myclaude/main/bootstrap.sh | bash
```

`bootstrap.sh` clones the repo to `~/devel/myclaude`, links the `myclaude` command into `~/.local/bin`, backs up the current `~/.claude` items, and runs `node myclaude.js install` (clones the pinned sources, installs myclaude's items). Run it again to update. If `~/.claude` already has edited copies of myclaude's files, it stops; then open Claude Code in `~/devel/myclaude` and say **"install myclaude"** (Claude follows `INSTALL.md`: compare, ask, install, verify).

After that: `myclaude status` shows the state; say **"review my setup"** once a month (`config-management` skill).

## Layers

| Layer | Owner | Example |
|---|---|---|
| Base (this repo, public) | myclaude | philosophy, product cycle, reviewers, verify gate, complaint loop |
| Other layers (private or corp) | their own repo or tool | a company's rules and agents, the focusd guards |

Rules that keep layers apart:

- myclaude writes only the paths listed in `manifest.json`. It never writes, moves, or deletes other files in `~/.claude`; `myclaude status` lists them as "other files".
- Another layer uses its own file names (for example `rules/<corp>/`, `agents/<corp>-*.md`) and never edits a file that myclaude installs. If it does, `sync` reports the file as LOCAL-MODIFIED and refuses to overwrite it, so the overlap shows up.
- A layer that needs a change in the base layer asks for it as a request (`requirements/complaints/`), not by editing the installed copy.
- Settings: myclaude merges only the keys it owns into `settings.json` (`custom/settings/`, recorded in `settingsOwned`); other keys stay as they are.

## Layout

| Path | Content |
|---|---|
| `myclaude.js`, `lib/` | The tool (CommonJS, Node >= 18, standard library only; `git` on PATH) |
| `manifest.json` | Manifest v2: `sources`, `entries`, `settingsOwned`, `lastSync` |
| `custom/` | Files Frank owns: `rules/`, `agents/`, `commands/`, `skills/`, `scripts/`, `settings/`; `philosophy-src/` holds the Claude Bible sources (not installed) |
| `INSTALL.md`, `CLEANUP.md` | Steps Claude follows to install into an existing `~/.claude`, then to clean up the old setup |
| `docs/INVENTORY.md`, `docs/REFERENCES.md` | Installed items with reasons and budgets; reference repos |
| `custom/settings/*.json` | Settings fragments merged into `~/.claude/settings.json`; see `custom/settings/README.md` |
| `docs/`, `requirements/`, `mcp_recipes/` | Research notes, requirements register, MCP recipes |
| `lib/chrome-mcp*.js`, `lib/cmd-chrome-mcp.js` | `myclaude chrome-mcp`: one shared debug Chrome for every MCP client (`mcp_recipes/chrome.md`) |
| `requirements/complaints/`, `lib/complaints.js`, `lib/cmd-complaints.js` | `myclaude complaints list\|check`: Frank's complaints and feature requests as exact quotes with repeatable checks; owned by the `ba-curator` agent (`complaints` skill) |
| `tests/` | `node --test` suite |
| `~/.myclaude/sources/<name>` | Full clones of each git source, detached at the pinned sha (not in this repo) |

## Sources

| Name | Repository | Role |
|---|---|---|
| `ecc` | https://github.com/affaan-m/everything-claude-code | Picks: python and typescript rule packs, the session script closure. The reviewer agents are forked into `custom/`. Reference repo. |
| `mattpocock` | https://github.com/mattpocock/skills | Picks: `codebase-design`, `domain-modeling`, `wait-what`. Forked into `custom/`: `tdd`, `diagnosing-bugs`, `writing-for-agents`, `improve-codebase-architecture`, `grilling` (as `clarify`). Installed flat as `skills/<name>/`. |
| `karpathy` | https://github.com/forrestchang/andrej-karpathy-skills | Reference only, no picks (the principles live in `custom/rules/frank/philosophy.md` §9). |
| `cct` | https://github.com/davila7/claude-code-templates | Reference only, no picks; read `cli-tool/components/`. |
| `custom` | `custom/` in this repo | Frank's own files and forks. Edits here install with `sync`; no `accept` step. |

What each installed item is for, and the budgets: `docs/INVENTORY.md`. Why each reference repo is listed: `docs/REFERENCES.md`.

## Manifest entry

```json
{ "src": "mattpocock", "path": "skills/productivity/grilling/", "dest": "skills/grilling/", "hash": "1a2b3c4d5e6f" }
```

`path` is relative to the source root; a trailing `/` means a directory entry (all files under it, hashed as one unit). `dest` is relative to `~/.claude` and is recorded only when it differs from `path`: `skills/<category>/<name>/` installs as `skills/<name>/` because the user skill scope is flat; every other path installs 1:1. `--as <name>` on `pick` renames the last segment. `hash` is the first 12 hex characters of the sha256 of the source at the last accepted sync. `forkedFrom` records the source a custom file was copied from. `kind: "settings"` marks a fragment.

## States

Each entry is classified from three hashes: S = source at the clone HEAD, B = recorded `hash`, D = installed copy.

| State | Condition | `sync` |
|---|---|---|
| CURRENT | S = B = D | skip |
| MISSING | D absent | copy, record hash |
| UPSTREAM-CHANGED | S differs, D = B | wait for `accept` (custom entries copy directly) |
| LOCAL-MODIFIED | S = B, D differs | refuse; `fork <dest>` keeps the edit, `sync --force` overwrites it |
| CONFLICT | S and D both differ from B | refuse; `diff --content` shows both sides |
| CONVERGED | S differs, D = S | record hash |
| DELETED-UPSTREAM | S absent | keep D, report; `unpick` or `fork` to resolve |
| FORK-DRIFT | custom entry with `forkedFrom`, upstream moved past `forkedFrom.hash` | report only; `accept` records the new upstream hash |

## Daily workflow: update, diff, accept, sync

```bash
node myclaude.js src update          # fetch every source; clone HEAD moves to the ref tip, pins stay
node myclaude.js diff                # list entries that are not CURRENT
node myclaude.js diff --content ecc  # unified diff per entry, one source only
node myclaude.js accept --all        # take every UPSTREAM-CHANGED entry; moves each source pin to its clone HEAD
node myclaude.js accept <dest>       # take one entry (the source pin also moves; see note below)
node myclaude.js sync                # install MISSING and custom changes; refuses LOCAL-MODIFIED and CONFLICT
node myclaude.js sync --dry-run      # same report, no writes
node myclaude.js status              # pins, state counts, other (non-myclaude) files under ~/.claude
node myclaude.js router              # regenerate skills/SOURCES.md (provenance) and docs/SKILL-ROUTER.md (trigger check)
```

### Guards

- `sync` refuses to copy from (or record a hash against) a source whose clone HEAD is not at its pin — after `src update`, review with `diff` and `accept`, or run `install` to return the clone to its pin. This prevents installing unreviewed tip content.
- `sync --force` first prints the exact LOCAL-MODIFIED/CONFLICT list it is about to overwrite.
- A directory entry and a file inside it cannot both be managed: `pick` and `own` refuse the overlap, and `sync` refuses a manifest that carries one.
- `unpick` of a LOCAL-MODIFIED or CONFLICT entry requires `--force`; `fork <dest>` keeps the edits instead.
- `fork` records `forkedFrom.hash` from the entry's recorded base (not the clone HEAD), so upstream commits between the base and an updated clone still surface as FORK-DRIFT.

`accept` copies the upstream version and records its hash in one step, so a following `sync` has nothing left to do for that entry. Note on per-entry `accept`: the pin of that source moves to the clone HEAD even if other entries from the same source were not accepted; on a new machine those entries would then install from the newer commit. Prefer `accept --all` after reviewing the diff.

## Picking and owning files

```bash
node myclaude.js ls ecc agents/                                  # files available in a source (* = picked)
node myclaude.js pick ecc agents/code-reviewer.md                # file entry
node myclaude.js pick mattpocock skills/productivity/grilling/   # directory entry, installs as skills/grilling/
node myclaude.js pick mattpocock skills/engineering/tdd/ --as mp-tdd
node myclaude.js pick custom settings/hooks.json                 # settings fragment
node myclaude.js unpick skills/grilling/                         # removes the entry and the installed copy
node myclaude.js fork agents/code-reviewer.md                    # moves the entry into custom/ with forkedFrom
node myclaude.js own rules/frank/new-rule.md                     # creates a custom file; never overwrites
```

`pick` refuses a `dest` that another source already provides and the reserved prefix `skills/synced/`.

## Settings fragments

`custom/settings/*.json` are partial settings objects. `sync` deep-merges them into `~/.claude/settings.json` (a `settings.json.bak` copy is written first). Objects merge recursively. `hooks.<Event>` arrays and `permissions.allow/deny/ask` arrays are unions keyed by identity (hook = matcher + command strings; permission = the rule string): an owned item is replaced in place or appended, and items the fragments do not own are kept. Every other value is a leaf where the fragment wins. The manifest's `settingsOwned` lists every leaf the fragments own; `unpick` of a fragment removes exactly those leaves. A hand edit to an owned leaf shows as LOCAL-MODIFIED and is overwritten only with `sync --force`. Keys such as `model`, `env`, `tui`, `skipAutoPermissionPrompt` are never touched unless a fragment names them.

## New machine

```bash
git clone https://github.com/eliteGoblin/myclaude.git ~/devel/myclaude
```

Then tell Claude "install myclaude": it follows `INSTALL.md` (backup, compare, one confirmation, `sync --force`, move old files into the backup, verify). `node myclaude.js install` alone clones every source at its pinned sha and runs `sync`; it refuses to overwrite locally modified files.

Environment overrides: `MYCLAUDE_CLAUDE_HOME` (default `~/.claude`), `MYCLAUDE_SOURCES_DIR` (default `~/.myclaude/sources`). `status` does not report the app-owned paths `skills/synced/` and `skills/.trash/`.

## Migration from manifest v1

`node myclaude.js migrate-v1 --ecc-sha <sha> [--karpathy-sha <sha>]` converts the v1 manifest (`upstream[]`, `bible[]`, `custom[]`, `hashes{}`) in place. `upstream` becomes source `ecc` pinned at the given sha (the fork's merge-base with upstream at migration time), `bible` becomes `karpathy`, `custom` keeps its files, and a path present in both lists becomes a custom entry with `forkedFrom`. Custom entries take the installed copy as their base hash because v1 kept none. Already done in this repo; kept for reference.

## Tests

```bash
npm test            # node --test tests/*.test.js
```

## Not built, on purpose

- No semver, dependency resolution, globs, or symlink install mode. Entries are explicit paths; directories end with `/`.
- No plugin or marketplace packaging of `custom/` (plugins cannot ship rules).
- No per-machine manifest overrides, no management of project-level `.claude/settings.json` or `~/.claude.json`, no JSON-with-comments in fragments.
- No GitHub API hash checks, no `npx skills add` integration, no automatic pull.
- No deletion of other layers' files in `~/.claude`; `status` lists them and Frank decides.
- No `rollback` command; `src update` moves the clone HEAD, `install` returns it to the pin, and git history of `manifest.json` holds every earlier pin.
- No `agents --opus` style edits of installed files; a per-agent `model:` change is a `fork`.
