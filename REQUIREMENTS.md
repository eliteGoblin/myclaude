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

## Current State
- Installed: 74 upstream files (common + TS + web + python rules, agents, commands, skills)
- All agents upgraded to opus (Max sub)
- Fork: eliteGoblin/everything-claude-code
- Upstream: affaan-m/everything-claude-code
- Languages: JavaScript/TypeScript, Web/Frontend, Python
