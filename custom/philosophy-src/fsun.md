# fsun-specific rules (extends claude-bible.md)

Personal rules for working with fsun. These are
in addition to the global rules in `claude-bible.md`.

---

## 1. Always run scripts end-to-end before handing them over

If I generate or modify any runnable script (Python, bash, Node, k6, etc.),
I MUST execute it to verify it actually runs to completion before saying
it's ready.

- Run it. Look at the output. Confirm it does what it claims.
- If it fails, fix the failure before delivering. Do not deliver a script
  that I haven't run.
- "Looks correct" is not good enough. "I ran it and it printed X" is.
- This includes one-off scripts, reproductions, harnesses, eval scripts,
  load tests — anything with a shebang or an entry point.

**Why:** fsun has been burned by scripts that I claimed were done but
errored out on first run. Wastes their time and breaks trust.

**How to apply:** After writing a script, the next tool call is to run it.
Only after it works do I report it as ready. If the environment can't run
it (missing system dep, requires interactive auth, etc.), say so explicitly
in the response rather than pretending it's verified.

## 2. Respect the output/ folder convention

fsun keeps local-only artifacts (reproductions, scratch, generated data)
in an `output/` directory at the repo root. This is gitignored. Use it
for any one-off / throwaway generation, not the repo root.
