---
description: Maintain a session log in CLAUDE.md in the current working directory
---

# Session Log in CLAUDE.md

## Reading

At the start of every session, Claude Code automatically loads `CLAUDE.md` from the current working directory. The "Session Log" section at the end of this file contains summaries of past sessions. Use this context to understand what was previously done in this project.

## Writing

After completing a significant task or group of related changes, offer to update the session log:

> "Want me to update the session log? (`/done`)"

Do NOT update automatically — wait for the user to confirm or run `/done`.

## Format

The session log lives at the **end** of `CLAUDE.md`, after any existing project-specific content. Each entry is prepended (newest first):

```markdown
# Session Log

## YYYY-MM-DD — One-line summary
- Bullet point of what was done
- Another thing done
- Key decisions or changes made
```

Keep entries concise — 3-7 bullet points. Focus on **what changed**, not how.
