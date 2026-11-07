---
id: R001
type: request
title: Show current Claude plan usage; token budget per task
date: 2026-11-08
status: OPEN
failure: W
---

## Frank said

> I want myclaude ablew to support showing current usage of claude sub, can run anotebrclaude to cehck, I want to set otken budeget for certain task.

> no nede to stop, just as tool to get usage, another calude session will use i tto get usage.

## Claude replied

Situation: no way to see plan usage or per-task token use from myclaude.

## Expected

- `node myclaude.js usage` prints plan usage (week and 5-hour percent, source and age) and local token totals by model and main vs subagent, deduplicated by message id.
- `--json` prints one JSON object with stable keys, so another Claude session can read it.
- `--since 24h|7d|<N>h|<N>d` sets the window; `--session <id>` gives totals for one session including its subagents.
- Plan source: the status line cache (younger than 15 minutes), else `claude -p "/usage"`. If neither works: "plan usage: not available"; the command still succeeds.
- The status line shows model, context %, 5-hour %, week % with reset time.
- The command only reports. It does not stop any task.

## Repro

```json repro
{"prompt":"run node ~/devel/myclaude/myclaude.js usage --json and tell me the weekly plan percent","runs":1,"checks":{"mustMatch":["\\d+\\s*%"],"noSubagents":true}}
```

## Fix

- https://github.com/eliteGoblin/myclaude/pulls (feat/usage)

## Check history

