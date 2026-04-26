# myclaude — Requirements

## Core
- Single CLI entry point for managing my Claude Code setup
- Quick cheatsheet so I don't need to memorize commands
- Cherry-pick files from upstream ECC, track what's installed
- Create my own custom rules/skills/commands/agents
- Sync upstream updates without merge conflicts (fork workflow)
- Symlink to ~/.local/bin for global access
- Works on macOS + Ubuntu (zsh)

- Subcommands: `myclaude rules`, `myclaude skills`, `myclaude commands` with `--verbose` flag
- Verbose shows what each rule covers, skill sections & value, command details
- Don't need to memorize — just `myclaude` to see everything
- Default `myclaude` shows status dashboard: counts, hooks wired, sessions
- `myclaude help` shows full command reference (separate from status)
- Session hooks auto-save/load context across projects
- `myclaude install` bootstraps a new machine: prereqs, sync, link, optional --opus
- Multi-language rules support: common + typescript + web + python (add more as needed)
- Cross-platform: macOS (zsh) + Ubuntu/Linux (zsh/bash)

## Custom overlays (`fsun_config/custom/`)
- `commands/done.md` — append-to-CLAUDE.md session log
- `commands/sessions.md` — context-rich `/sessions load` (overrides upstream)
- `scripts/lib/session-manager-fsun.js` — extension lib backing the overlay
- `rules/common/behavioral-guidelines.md` — Frank's behavioral rules
- `rules/common/session-log.md` — session-log convention rule

## Sessions overlay
See `fsun_config/docs/sessions-extended.md` for full design.

- Default `sessions load <id>` is **context-rich**: combines `.tmp` summary with Claude-native JSONL transcripts under `~/.claude/projects/<encoded-cwd>/` up to a token budget
- Token budget accepts shorthand: `500K`, `1M`, raw int. Default 500K (sized for 1M context window)
- `--topic "<kw>"` runs LLM topic filter via `claude -p`; falls back to keyword grep if `claude` unavailable
- `--no-history` returns to upstream-style metadata-only load
- `--since 7d|24h|2w` time-bounded filter
- `sessions merge <id> [--topic <kw>] [--dry-run]` consolidates sibling .tmp files into target
- `sessions help` prints full flag reference

## Current State
- Installed: 81 upstream files (common + TS + web + python rules, agents, commands, skills)
- 5 custom overlays (incl. sessions.md + session-manager-fsun.js)
- All agents upgraded to opus (Max sub)
- Fork: eliteGoblin/everything-claude-code
- Upstream: affaan-m/everything-claude-code
- Languages: JavaScript/TypeScript, Web/Frontend, Python
