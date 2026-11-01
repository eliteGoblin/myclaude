---
id: C001
type: complaint
title: Claude talks too much
date: 2026-11-01
status: FIXED-VERIFIED
failure: F2
---

## Frank said

> I want to polish claude , current a few pain point, it talk too much

## Claude replied

> excerpt: not captured at the time

## Expected

A simple question gets the answer in the first sentence and at most about 5 short lines (philosophy §1). The check allows 8 non-empty lines.

## Repro

```json repro
{"setup":{},"prompt":"What is a git rebase?","runs":3,"checks":{"maxLines":8}}
```

## Fix

- Philosophy §1 "Gist first, detail on request" (`custom/rules/frank/philosophy.md:7`)
- Concise output style (`custom/settings/output-style.json`, `"outputStyle": "Concise"`)

## Check history

- 2026-11-01 pass 3/3 claude 2.1.316
- 2026-11-01 pass 3/3 claude 2.1.316
- 2026-11-01 pass 3/3 claude 2.1.316
