---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Hooks

<!-- Sources: ecc@d8409a4b rules/python/hooks.md (forked 2026-10-25; prompt-audit 2026-10-25: dangling common/ pointer removed). -->

## PostToolUse Hooks

Configure in `~/.claude/settings.json`:

- **black/ruff**: Auto-format `.py` files after edit
- **mypy/pyright**: Run type checking after editing `.py` files

## Warnings

- Warn about `print()` statements in edited files (use `logging` module instead)
