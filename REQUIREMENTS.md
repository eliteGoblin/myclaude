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

## Current State
- Installed: JS/TS focused (69 upstream files, pruned from 421)
- All agents upgraded to opus (Max sub)
- Fork: eliteGoblin/everything-claude-code
- Upstream: affaan-m/everything-claude-code
