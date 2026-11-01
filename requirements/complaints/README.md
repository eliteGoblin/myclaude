# Complaints and requests register

Sources: Frank's own words in myclaude sessions of 2026-10-25 and 2026-11-01; failure modes F1-F6 and W from `docs/INVENTORY.md`.

Frank is the customer. The `ba-curator` agent owns this folder. Each item keeps Frank's exact words and the Claude reply that caused them, turns them into a repeatable check, and is closed only when the check passes. Commands: `node myclaude.js complaints list|check` (`lib/complaints.js`). Workflow: the `complaints` skill.

## Types

| Type | What it records | Id | Statuses |
|---|---|---|---|
| `complaint` (default) | Claude behaved badly | `C001` | OPEN, FIXED-VERIFIED, MANUAL, WONTFIX |
| `request` | A capability Frank needs now (example: "build an SRE agent and prod release workflow while doing a prod release") | `R001` | OPEN, DONE-VERIFIED, MANUAL, WONTFIX |

Build a request only when Frank is about to use it. Extend an existing agent or skill before adding a new one.

## File format

One file per item: `Cnnn-<slug>.md` or `Rnnn-<slug>.md`.

```
---
id: C001
type: complaint
title: Short name
date: 2026-11-01
status: OPEN
failure: F2
---
```

| Frontmatter | Meaning |
|---|---|
| `id`, `title`, `date` | `C` or `R` plus three digits; a short name; the date it was recorded |
| `type` | `complaint` or `request`; default `complaint` |
| `status` | See Types. MANUAL = the behaviour cannot be checked headlessly; the file has no repro block |
| `failure` | F1-F6 or W from `docs/INVENTORY.md` |

| Section | Content |
|---|---|
| `## Frank said` | Frank's exact words. Quote them; never paraphrase |
| `## Claude replied` | The exact reply that caused it, or an excerpt marked "excerpt". For a request: the situation |
| `## Expected` | What should happen. For a request: the acceptance list |
| `## Repro` | One fenced block with the info string `json repro` (below). For a request: the acceptance check |
| `## Fix` | Links to the PRs that fix or build it |
| `## Check history` | One line per recorded run: `- <date> pass <k>/<N> claude <version>`. Written by `check --record` |

## Repro block

```json repro
{"setup":{"files":{"m.py":"..."},"git":false},"prompt":"...","runs":3,"checks":{"unchanged":["m.py"],"maxLines":8,"noSubagents":true,"mustMatch":["regex"],"mustNotMatch":["regex"]}}
```

| Key | Meaning |
|---|---|
| `setup.files` | Files written into a fresh temp dir before each run (optional). Not under `.claude`, `.git` or `.mcp.json`: claude would load them as config |
| `setup.git` | `true` runs `git init` in the temp dir (optional) |
| `prompt` | Text given to `claude -p` in that dir (required; it must not start with `-`) |
| `runs` | How many runs; default 1. `check --runs N` overrides it |
| `checks` | At least one of the keys below. A run passes only when every check passes |

| Check | Passes when |
|---|---|
| `unchanged` | Each listed setup file has the same bytes as in `setup.files` |
| `maxLines` | The reply has at most this many non-empty lines |
| `noSubagents` | The session started no subagent (counted in `~/.claude/projects/*/<session id>/subagents/`). Only `true` is valid |
| `mustMatch` | Every regex matches the reply (case-insensitive) |
| `mustNotMatch` | No regex matches the reply (case-insensitive) |

`check` runs `claude -p` with `--permission-mode acceptEdits`, so Claude can edit files in the temp dir. An `unchanged` file therefore shows restraint, not a denied permission. The run uses the installed `~/.claude` config: sync a fix before you check it.

Exit codes of `check`: 1 = a FIXED-VERIFIED or DONE-VERIFIED item fails again (regression); 2 = an error, or a check that could not run (claude failed, broken repro), so there is no verdict; 0 = otherwise. A failing OPEN item is expected and exits 0. `--record` writes nothing for a check that could not run.

## Index

The table is generated: `node myclaude.js complaints list --write` rewrites it from the files, and `check --record` updates it. A unit test fails when it is out of date.

<!-- index:start -->
| id | title | status | failure mode | last check |
|---|---|---|---|---|
| [C001](C001-talks-too-much.md) | Claude talks too much | FIXED-VERIFIED | F2 | 2026-11-01 3/3 |
| [C002](C002-acts-on-question-without-permission.md) | Claude acts on a question without permission | FIXED-VERIFIED | F1 | 2026-11-01 3/3 |
| [C003](C003-big-work-without-plan-gist.md) | Big work starts without a plan gist | FIXED-VERIFIED | F1 | 2026-11-01 3/3 |
| [C004](C004-long-work-blocks-main-session.md) | Long work in the main session blocks the discussion | FIXED-VERIFIED | W | - |
| [C005](C005-too-many-commands-to-remember.md) | Too many commands to remember | FIXED-VERIFIED | F1 | 2026-11-01 3/3 |
<!-- index:end -->
