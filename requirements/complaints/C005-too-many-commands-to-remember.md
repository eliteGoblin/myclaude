---
id: C005
type: complaint
title: Too many commands to remember
date: 2026-11-01
status: FIXED-VERIFIED
failure: F1
---

## Frank said

> Im struggle to rememeber tall thee cmd ... I usually just say by words

## Claude replied

> excerpt: not captured at the time

## Expected

Frank describes the work in plain words and Claude starts the matching workflow. For a feature, Claude asks its questions first and starts no agent before Frank confirms (philosophy §14).

## Repro

```json repro
{"setup":{"git":true},"prompt":"develop a feature using the product cycle: add a /health endpoint to this service","runs":3,"checks":{"noSubagents":true,"mustMatch":["\\?"]}}
```

## Fix

- https://github.com/eliteGoblin/myclaude/pull/10 (plain-language product cycle)
- https://github.com/eliteGoblin/myclaude/pull/11 (the cycle grills first, then asks before starting agents)

## Check history

- 2026-11-01 pass 3/3 claude 2.1.316
- 2026-11-01 pass 3/3 claude 2.1.316
- 2026-11-01 pass 3/3 claude 2.1.316
