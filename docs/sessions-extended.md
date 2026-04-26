# Sessions Extended — Frank's overlay for `/sessions`

## Problem

The upstream `/sessions load <id>` reads only the curated `.tmp` summary file (~2-15 KB). For deep-context resume — the same way `claude --resume` re-loads a full prior conversation — that's not enough. The Claude-native JSONL transcripts under `~/.claude/projects/<encoded-cwd>/` hold the actual dialog and tool-result history, but they're never linked from `.tmp` and they're huge (this project alone: 4 files, 3.4 MB ≈ 850K tokens).

## Goal

`/sessions load <id>` returns a context-rich blob by default — `.tmp` summary + relevant Claude-native transcripts up to a token budget — so a new session can pick up exactly where a prior one left off without manually grepping JSONL.

## Requirements (from user)

1. **Default = context-rich**, not opt-in. Plain `sessions load <id>` always loads .tmp + native history.
2. **Token budget** with human shorthand: `500K`, `1M`, `800K` — never raw `500000`.
3. **Topic filter via LLM** when `--topic` is provided. If LLM unavailable, fall back to keyword matching.
4. **Merge command**: combine sibling `.tmp` files (same project, optionally same topic) into the latest one.
5. **`/sessions help`** shows every command and flag.
6. All Frank changes live in `fsun_config/`. Upstream files in the repo stay untouched so `git pull upstream main` keeps merging cleanly.
7. Reasonable defaults assume **1M context window** (Frank runs extended-context Claude).

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Default budget | **500K tokens** | Safe for 1M context (leaves 500K for new conversation) |
| Budget shorthand parser | regex `^(\d+)([KkMm])?$` | Accepts `500K`, `1M`, raw `500000`; clear error otherwise |
| Token estimate | 4 chars/token (English) | Approximate; tunable via `--budget` if you hit limits |
| Native transcript discovery | `~/.claude/projects/<encoded-cwd>/*.jsonl` (cwd has slashes → hyphens) | Standard Claude Code layout |
| Worktree resolution | `meta.Worktree` from .tmp → `process.cwd()` fallback | Manual-written .tmp files often lack `Worktree:`; cwd-fallback recovers gracefully |
| Dialog extraction | user msgs + assistant text only, drop tool I/O | Tool results dominate bytes (90%+); dropping them keeps narrative tight |
| Topic filter (default) | LLM via `claude -p`, threshold 6/10 | Quality over speed; user explicitly asked for LLM. Keyword pre-filter narrows candidates first |
| Topic filter (fallback) | keyword count, normalized per 10K chars | Used if `claude -p` returns non-zero or times out |
| Time filter | `--since 7d` (`d`/`h`/`w`/`m`) | Independent of topic; can combine |
| Merge target | the resolved .tmp itself (in-place append under `# Merged History`) | User asked: "update latest one with all previous session" |
| Merge sibling discovery | same `Project:` field in metadata | Topic-agnostic by default; `--topic` adds content match |
| Override mechanism | new lib `session-manager-fsun.js` + override slash command | Upstream `session-manager.js` untouched; clean rebases |
| LLM fallback noise | warn + degrade silently (return keyword score) | Don't fail the whole load just because LLM is unreachable |

## Architecture

```
~/devel/everything-claude-code/
├── scripts/lib/session-manager.js          # upstream — UNTOUCHED
├── scripts/lib/session-aliases.js          # upstream — UNTOUCHED
├── commands/sessions.md                    # upstream — UNTOUCHED
└── fsun_config/
    ├── manifest.json                       # registers custom files
    ├── custom/
    │   ├── scripts/lib/session-manager-fsun.js   # NEW — extension
    │   └── commands/sessions.md                  # OVERRIDE — routes to fsun lib
    └── docs/sessions-extended.md           # this file
```

`fsun_config/ecc.js sync` copies custom files **after** upstream files, so the override of `commands/sessions.md` wins.

The new lib `session-manager-fsun.js` requires upstream `session-manager` and `session-aliases` via the same path-resolution shim used elsewhere — no fork of upstream code.

## API surface (fsun lib)

```js
const fsun = require('~/.claude/scripts/lib/session-manager-fsun');

fsun.parseBudget('500K')                          // → 500000
fsun.parseSince('7d')                             // → Date 7 days ago
fsun.encodeWorktreePath('/home/x/y')              // → '-home-x-y'
fsun.findNativeTranscripts(worktreePath)          // → [{ path, name, mtime, size }, ...]
fsun.extractDialog(jsonlPath)                     // → "USER: ...\n\nASSISTANT: ..."
fsun.filterByTopic(transcripts, topic, opts)      // → [{ ..., score, llm }, ...]
fsun.loadSessionWithHistory(idOrAlias, opts)      // main load entry point
fsun.mergeSessions(idOrAlias, opts)               // merge entry point
fsun.renderLoadOutput(result)                     // → string for stdout
fsun.HELP                                         // help text
```

Options for `loadSessionWithHistory`:
- `noHistory: bool`  → metadata + .tmp only
- `topic: string`    → enable LLM topic filter
- `budget: string`   → '500K' | '1M' | int
- `since: string`    → '7d' | '24h'
- `useLLM: bool`     → false to force keyword fallback

Options for `mergeSessions`:
- `topic: string`  → only siblings whose content matches
- `dryRun: bool`   → preview without writing

## Everyday usage

```bash
sessions load gemini_license                              # full context (default 500K budget)
sessions load gemini_license --topic "frontline"          # LLM-filtered to topic
sessions load gemini_license --budget 800K                # bigger budget
sessions load gemini_license --since 7d                   # only last week
sessions load gemini_license --no-history                 # quick metadata peek

sessions merge gemini_license --dry-run                   # preview consolidation
sessions merge gemini_license --topic "licensing"         # actually merge

sessions help                                             # all flags
```

## Install (fresh machine)

```bash
git clone https://github.com/eliteGoblin/everything-claude-code.git ~/devel/everything-claude-code
cd ~/devel/everything-claude-code
git remote add upstream https://github.com/affaan-m/everything-claude-code.git
npm install
node fsun_config/ecc.js sync               # copies upstream + custom (incl. session-manager-fsun.js)
```

After sync, `~/.claude/scripts/lib/session-manager-fsun.js` exists and `~/.claude/commands/sessions.md` is the overlay version.

## Sync upstream changes

```bash
cd ~/devel/everything-claude-code
git fetch upstream
git merge upstream/main                    # merges cleanly — upstream paths untouched
node fsun_config/ecc.js sync               # re-install
```

## Known limitations

- Token estimate is rough (4 chars/token). For large transcripts this can be off by ±20%. Pad budget if it matters.
- LLM filter spawns one `claude -p` per candidate transcript. With dozens of candidates, latency adds up. Use `--no-llm` for fast keyword-only.
- Subdirectory walking under `~/.claude/session-data/` is not yet implemented (upstream `getAllSessions` is flat-only). Required for the `usage/<topic>/` folder convention. **TODO**: extend upstream walker or shim it in `session-manager-fsun.js`.
- Merge appends under `# Merged History` — re-running merge appends again. Consider `--idempotent` flag if needed.

## Future / TODO

- Subdir walker for `~/.claude/session-data/` (enables `usage/`, `licensing/`, etc. folders)
- Cache LLM relevance scores per JSONL hash to skip re-scoring on subsequent loads
- `sessions search <query>` — grep across all .tmp + native transcripts
- Optional auto-merge hook on session-end
