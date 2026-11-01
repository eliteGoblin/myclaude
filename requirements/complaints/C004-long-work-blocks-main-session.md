---
id: C004
type: complaint
title: Long work in the main session blocks the discussion
date: 2026-11-01
status: FIXED-VERIFIED
failure: W
---

## Frank said

> do taks in main session blocking dsicussion. could delegate into sub sesisone tc.

## Claude replied

> excerpt: not captured at the time

## Expected

Long multi-step work (PR chains, wait loops, rebases, releases, broad research) goes to a background subagent with a complete brief. The main thread stays free, and Frank's questions get an answer while the work continues (philosophy §11).

## Repro

MANUAL: a headless `claude -p` run ends when the main thread ends, so "the main thread stayed free" cannot be checked there. Check by hand in an interactive session: start a long task, then ask a question while it runs.

## Fix

None yet.

## Check history
- 2026-11-01: manual check, accepted by Frank ("c004 is good neough"). Evidence: in session 44dc5ea4 the complaint loop build, the C003 fix and the model check ran as background agents while Frank kept talking in the main session.
