---
id: C003
type: complaint
title: Big work starts without a plan gist
date: 2026-11-01
status: MANUAL
failure: F1
---

## Frank said

> but iideakkly I want before claude doing big stuff, like product feature. it will check with me. summaryzie gist of plan of coming.

## Claude replied

> excerpt: not captured at the time

## Expected

Superseded on 2026-11-14 (philosophy §2, myclaude commit 1812662, on main since PR #9): for big work that Frank asked for with a clear instruction, the first lines of the reply are the plan in at most 5 lines (what, which files, main risk, assumptions), and Claude then begins in the same reply without waiting for a go. Claude stops first only at a production-safety gate or for real ambiguity (one specific question).

Earlier expectation (2026-11-01, checked 3/3): show the plan and wait for Frank's go, with no edits before it.

## Repro

None. The old repro required the files to stay unchanged, so it now fails on correct behaviour. A headless check of "plan first, then edits" needs a check that a file changed; `checks` has no such key (`requirements/complaints/README.md`). Status MANUAL until one exists.

## Fix

- https://github.com/eliteGoblin/myclaude/pull/12 (first attempt, philosophy §10: plan gist before big work; failed the check 0/3 on 2026-11-01)
- https://github.com/eliteGoblin/myclaude/pull/16 (philosophy §2: plan gist before big work, with a concrete definition; §10 defers to §2; passed 3/3 on 2026-11-01)
- https://github.com/eliteGoblin/myclaude/pull/9 (2026-11-22: ported the 2026-11-14 rule "start big work in the same reply" to main; supersedes the wait-for-go expectation)

## Check history

- 2026-11-01 pass 0/3 claude 2.1.316
- 2026-11-01 pass 3/3 claude 2.1.316
- 2026-11-01 pass 3/3 claude 2.1.316
- 2026-11-01 pass 3/3 claude 2.1.316
