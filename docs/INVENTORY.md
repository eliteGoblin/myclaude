# Inventory

Every item myclaude installs into `~/.claude`, and why it is there. This table is the review list: an item with no clear "why" is a removal candidate. The monthly review (`config-management` skill) updates "Last reviewed". `manifest.json` is the machine-readable source of truth for paths and hashes; this file is the human-readable reason.

## Failure modes

Every item fixes at least one named failure mode.

| Id | Failure mode |
|---|---|
| F1 | Misalignment: the agent builds the wrong thing |
| F2 | Verbosity: too many words, jargon, hard for a non-native reader |
| F3 | Code does not work: no feedback loop |
| F4 | Ball of mud: code entropy |
| F5 | Unverified claims: inference or a failed query presented as fact; acting on an unconfirmed target |
| F6 | Config ball of mud: rules and skills grow, overlap, contradict |
| W | Work tool: a daily task Frank does (not a failure mode fix) |

## Budgets

| Kind | Budget | Now |
|---|---|---|
| Always-on rules (loaded every session) | ≤ 4 files, ≤ 400 lines; each file ≤ 200 lines | 4 files, 314 lines |
| Model-invoked skills (description loaded every session) | ≤ 15 | 14 |
| Agents | ≤ 10 | 10 |
| Commands (typed by Frank; never start by themselves) | ≤ 10 | 7 |

To add an item at a limit, remove or merge another item first. Frank can change a budget here.

## Always-on rules

| Item | Kind | Origin | Why kept | Failure mode | Last reviewed |
|---|---|---|---|---|---|
| `rules/frank/philosophy.md` | rule, always-on | custom: Claude Bible 1-12 + fsun.md + old preferences, critical-verification, learn-from-mistakes, behavioral-guidelines | The one statement of how Claude works with Frank | F1, F2, F5 | 2026-09-28 |
| `rules/frank/production-safety.md` | rule, always-on | custom | Production gates: assume prod, confirm destructive and undiscussed prod changes | F5 | 2026-09-28 |
| `rules/frank/agent-self-learning.md` | rule, always-on | custom | Role memories in `.claude/agents/memory/` so lessons persist per repo | F5, F6 | 2026-09-28 |

## Path-gated rules (load only when a matching file is read)

| Item | Kind | Origin | Why kept | Failure mode | Last reviewed |
|---|---|---|---|---|---|
| `rules/python/coding-style.md` | rule, `**/*.py` | ecc (picked) | About 1,281 `.py` edits in 90 days (August audit) | F3, F4 | 2026-09-28 |
| `rules/python/fastapi.md` | rule, FastAPI paths | ecc (picked) | Same | F3, F4 | 2026-09-28 |
| `rules/python/hooks.md` | rule, `**/*.py` | ecc (picked) | Same | F3 | 2026-09-28 |
| `rules/python/patterns.md` | rule, `**/*.py` | ecc (picked) | Same | F4 | 2026-09-28 |
| `rules/python/security.md` | rule, `**/*.py` | ecc (picked) | Same | F3 | 2026-09-28 |
| `rules/python/testing.md` | rule, `**/*.py` | ecc (picked) | Same | F3 | 2026-09-28 |
| `rules/typescript/coding-style.md` | rule, `**/*.{ts,tsx,js,jsx}` | ecc (picked) | About 200 `.ts`/`.js` edits in 90 days | F3, F4 | 2026-09-28 |
| `rules/typescript/hooks.md` | rule, same | ecc (picked) | Same | F3 | 2026-09-28 |
| `rules/typescript/patterns.md` | rule, same | ecc (picked) | Same | F4 | 2026-09-28 |
| `rules/typescript/security.md` | rule, same | ecc (picked) | Same | F3 | 2026-09-28 |
| `rules/typescript/testing.md` | rule, same | custom (fork of ecc) | Same; names e2e-verifier | F3 | 2026-09-28 |

## Skills (model-invoked)

| Item | Kind | Origin | Why kept | Failure mode | Last reviewed |
|---|---|---|---|---|---|
| `skills/tdd/` | skill | custom (fork of mattpocock) | Red → green at agreed seams; `/product-cycle` BUILD | F3 | 2026-09-28 |
| `skills/diagnosing-bugs/` | skill | custom (fork of mattpocock) | Loop-first debugging of hard bugs | F3, F5 | 2026-09-28 |
| `skills/codebase-design/` | skill | mattpocock (picked) | Deep-module vocabulary shared by tdd, architect, improve-codebase-architecture | F4 | 2026-09-28 |
| `skills/domain-modeling/` | skill | mattpocock (picked) | `CONTEXT.md` glossary + `docs/adr/`; one store shared with ba-curator | F1, F2 | 2026-09-28 |
| `skills/writing-for-agents/` | skill | custom (fork of mattpocock) | How to write skills, rules, agents, CLAUDE.md without bloat | F6 | 2026-09-28 |
| `skills/pr-workflow/` | skill | custom | The one PR process: reviewers, Copilot threads, green CI | F3 | 2026-09-28 |
| `skills/config-management/` | skill | custom | myclaude mechanics, monthly review, improvement rule | F6 | 2026-09-28 |
| `skills/observability-buildout/` | skill | custom | Observability method: OpenTelemetry, SLOs, burn-rate alerts (vendor-neutral) | W, F3 | 2026-09-28 |
| `skills/complaints/` | skill | custom | Register of Frank's complaints and feature requests (`requirements/complaints/`): exact quotes, repeatable checks, closed only when the check passes; `complaints check` also catches regressions after config changes | F6 | 2026-11-01 |
| `commands/ticket-sizing.md` | skill (command file, model-invoked) | custom | Team story-point standard; used | W | 2026-09-28 |

## Commands (typed by Frank)

| Item | Kind | Origin | Why kept | Failure mode | Last reviewed |
|---|---|---|---|---|---|
| `/product-cycle` (`commands/product-cycle.md`) | skill (starts from plain words after Frank confirms; also typed) | custom | Feature cycle: clarify → spec → design → tdd → review → verify | F1, F3, F5 | 2026-11-01 |
| `/clarify` (`skills/clarify/`) | skill (starts from plain words; also typed) | custom (fork of mattpocock grilling) | Reach shared understanding in rounds; `/product-cycle` DEFINE | F1 | 2026-09-28 |
| `/wait-what` (`skills/wait-what/`) | command (user-invoked skill) | mattpocock (picked) | Re-explain the last message in plain technical English | F2 | 2026-09-28 |
| `/improve-codebase-architecture` (`skills/improve-codebase-architecture/`) | command (user-invoked skill) | custom (fork of mattpocock) | Periodic deepening review per repo | F4 | 2026-09-28 |
| `/deep-research` (`skills/deep-research/`) | command (user-invoked skill) | custom | Multi-agent research with adversarial citation check | F5 | 2026-09-28 |
| `/sessions` (`commands/sessions.md`) | command | custom (fork of ecc) | Alias-first session switching; used | W | 2026-09-28 |
| `/save-session` (`commands/save-session.md`) | command | custom (fork of ecc) | Save session state; used | W | 2026-09-28 |
| `/resume-session` (`commands/resume-session.md`) | command | custom (fork of ecc) | Resume saved state | W | 2026-09-28 |
| `/jira` (`commands/jira.md`) | command | custom (fork of ecc) | Jira tickets; used | W | 2026-09-28 |

## Agents

Usage counts: transcripts since 2026-05 (issue #1, 2026-09-28).

| Item | Kind | Origin | Why kept | Failure mode | Last reviewed |
|---|---|---|---|---|---|
| `agents/ba-curator.md` | agent | custom | Product-altitude spec and sign-off; 11 uses | F1 | 2026-09-28 |
| `agents/architect.md` | agent (read-only) | custom (fork of ecc) | DESIGN stage, test seams; 16 uses | F4 | 2026-09-28 |
| `agents/code-reviewer.md` | agent (read-only) | custom (fork of ecc) | Standards and Spec review; 38 uses | F3, F4, F1 | 2026-09-28 |
| `agents/python-reviewer.md` | agent (read-only) | custom (fork of ecc) | Python-specific review; 12 uses | F3 | 2026-09-28 |
| `agents/security-reviewer.md` | agent (read-only) | custom (fork of ecc) | Security review, reports only; 2 uses | F3 | 2026-09-28 |
| `agents/e2e-verifier.md` | agent | custom | VERIFY: exercised or NOT VERIFIED; 2 uses | F3, F5 | 2026-09-28 |
| `agents/release-verifier.md` | agent | custom | Release-train go/no-go before promotion | F5 | 2026-09-28 |
| `agents/citation-verifier.md` | agent | custom | Checks citations against sources for deep-research; 3 uses | F5 | 2026-09-28 |
| `agents/solution-doc-writer.md` | agent (model: opus) | custom (Frank's own, written 2026-10-20, tracked 2026-11-01) | Writes solution architecture documents: gist first, diagram first, in scope, Confluence-ready; runs the reviewer checklist before handing over; not counted yet | F2 | 2026-11-01 |
| `agents/solution-doc-reviewer.md` | agent (read-only, model: opus) | custom (Frank's own, written 2026-10-20, tracked 2026-11-01) | Cold-read review of a solution document: PASS/FAIL per test and an exact cut list; not counted yet | F2 | 2026-11-01 |

## Support files (no context cost)

| Item | Kind | Origin | Why kept | Last reviewed |
|---|---|---|---|---|
| `scripts/hooks/session-alias-hint-fsun.js`, `scripts/hooks/session-save-gate-fsun.js` | hook scripts | custom | SessionStart alias hint and Stop save gate (settings `hooks.json`) | 2026-09-28 |
| `scripts/lib/session-manager-fsun.js`, `scripts/lib/session-registry-fsun.js` | libraries | custom | Session alias registry used by `/sessions` | 2026-09-28 |
| `scripts/hooks/session-end.js`, `scripts/lib/{agent-data-home,llm-summary,path-safety,session-aliases,session-manager,transcript-context,utils}.js` | libraries | ecc (picked) | `require()` closure of the session scripts | 2026-09-28 |
| `settings/attribution.json` | settings fragment | custom | No AI attribution in commits and PRs | 2026-09-28 |
| `settings/hooks.json` | settings fragment | custom | Wires the two session hooks and the verify gate | 2026-10-25 |
| `scripts/hooks/stop-verify-gate-fsun.js` | hook script | custom | Stop hook: blocks a completion claim when code was edited and nothing ran after the last edit (F3, F5) | 2026-10-25 |
| `settings/models.json` | settings fragment | custom | `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`: general-purpose subagents on Sonnet; agents with `model:` keep theirs (architect, ba-curator: opus). 60-day usage review 2026-10-26: Opus general-purpose agents were 29% of estimated spend | 2026-10-26 |
| `settings/output-style.json` | settings fragment | custom | Concise output style (F2) | 2026-09-28 |
| `settings/permissions.json` | settings fragment | custom | Ask/deny rules that enforce production-safety prefixes | 2026-09-28 |
| `settings/pretooluse-guards.json` | settings fragment | custom | `rm -rf` block and destructive-SQL ask hooks | 2026-09-28 |
| `settings/plugins.json` | settings fragment | custom | pyright LSP plugin | 2026-09-28 |

`skills/SOURCES.md` in `~/.claude` is generated by `sync` (provenance table); it is not an item.

## Not installed

- `custom/philosophy-src/` holds the Claude Bible source files (`claude-bible.md`, `fsun.md`). Source material only; `philosophy.md` is the installed form.
- Reference repos are listed in `docs/REFERENCES.md`.

