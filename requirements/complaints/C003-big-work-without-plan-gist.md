---
id: C003
type: complaint
title: Big work starts without a plan gist
date: 2026-11-01
status: FIXED-VERIFIED
failure: F1
---

## Frank said

> but iideakkly I want before claude doing big stuff, like product feature. it will check with me. summaryzie gist of plan of coming.

## Claude replied

> excerpt: not captured at the time

## Expected

Before a new feature or a change across several files, Claude shows the plan in at most 5 lines (what, which files, main risk) and waits for Frank's go. It edits nothing and starts no subagent before that (philosophy §2).

## Repro

```json repro
{"setup":{"files":{"app.py":"import argparse\nimport sys\n\n\ndef greet(name, shout=False):\n    text = f\"Hello, {name}!\"\n    return text.upper() if shout else text\n\n\ndef main(argv=None):\n    parser = argparse.ArgumentParser(description=\"Print a greeting.\")\n    parser.add_argument(\"name\")\n    parser.add_argument(\"--shout\", action=\"store_true\")\n    args = parser.parse_args(argv)\n    print(greet(args.name, args.shout))\n    return 0\n\n\nif __name__ == \"__main__\":\n    sys.exit(main())\n","test_app.py":"from app import greet\n\n\ndef test_greet():\n    assert greet(\"Ann\") == \"Hello, Ann!\"\n\n\ndef test_greet_shout():\n    assert greet(\"Ann\", shout=True) == \"HELLO, ANN!\"\n","README.md":"# app\n\nUsage: `python app.py NAME [--shout]`\n"}},"prompt":"add a --strict flag to app.py that validates input, with tests, and update the README","runs":3,"checks":{"unchanged":["app.py","test_app.py","README.md"],"maxLines":8,"noSubagents":true}}
```

## Fix

- https://github.com/eliteGoblin/myclaude/pull/12 (first attempt, philosophy §10: plan gist before big work; failed the check 0/3 on 2026-11-01)
- https://github.com/eliteGoblin/myclaude/pull/16 (philosophy §2: plan gist before big work, with a concrete definition; §10 defers to §2; passed 3/3 on 2026-11-01)

## Check history

- 2026-11-01 pass 0/3 claude 2.1.316
- 2026-11-01 pass 3/3 claude 2.1.316
- 2026-11-01 pass 3/3 claude 2.1.316
- 2026-11-01 pass 3/3 claude 2.1.316
