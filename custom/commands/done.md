---
description: Summarize the current session and append to CLAUDE.md in the working directory
---

# Done — Save Session Summary

Summarize what happened in this session and append it to the `CLAUDE.md` file in the current working directory.

## Steps

1. **Review the conversation** — identify all tasks completed, decisions made, and notable changes.

2. **Check for existing CLAUDE.md** — read the file if it exists. Look for an existing `# Session Log` section.

3. **Create or update CLAUDE.md**:
   - If the file doesn't exist, create it with a `# Session Log` heading.
   - If it exists but has no `# Session Log` section, append one at the end.
   - Prepend the new entry (newest first) under the `# Session Log` heading.

4. **Entry format** — use today's date and a one-line summary:

```markdown
## YYYY-MM-DD — Brief summary of session

- What was done (bullet 1)
- What was done (bullet 2)
- Key decisions made
- Notable issues resolved
```

5. **Keep it concise** — 3-7 bullets. Focus on what changed and why, not how. Include file paths only when they help future sessions understand the change.

6. **Show the entry** to the user for confirmation before writing.
