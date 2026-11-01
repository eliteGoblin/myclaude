---
description: Run the full product cycle for a feature (grill, spec, design, test-first build, review, verify, close) with specialist agents working from one requirements doc. Use when Frank asks to develop or build a feature "with the product cycle", "full loop", or "product feature loop", or describes a substantial new feature. Confirm with Frank before starting. Not for small or clear changes.
argument-hint: "<one-line intent for the feature>"
---

Sources: Frank's own; written in eliteGoblin/everything-claude-code fsun_config/custom, moved to myclaude 2026-08-23; rewired 2026-09-28 (clarify, tdd, two-axis code-reviewer, pr-workflow; myclaude issue #1) (prompt-audit 2026-10-25).

# Product Cycle

Orchestrate a feature end-to-end like a disciplined product team. You are the **conductor** - you do not write the doc or the code yourself; you dispatch the specialist agents and skills in order, pass each one's output to the next, route feedback, and pause only at the gates listed under "Decision altitude".

The **BA requirements doc is the contract.** Every downstream agent reads `<docroot>/requirements/features/*.md` for what to build and verify. Keep the cycle anchored to it.

User intent for this run: **$ARGUMENTS**

## Before you start (plain-language start)
If Frank started this with words instead of the `/product-cycle` command:
1. Grill first: run `clarify` with Frank until the goal, scope, and acceptance are agreed. Start no agent during this step.
2. Then ask him in one line: "Run the full product cycle for <feature> (spec, design, build, review, verify)?"
3. Dispatch agents (ba-curator onward) only after he says yes. If he says no, do the task directly from the agreed answers.
When he typed `/product-cycle`, that is the yes for step 2; still grill first.

## When NOT to use
Trivial changes (typos, one-line fixes, formatting) skip this cycle - just do them. This is for features and substantive changes.

## Stages

### Stage 0 - Setup (only if docs aren't bootstrapped)
Dispatch `ba-curator` with verb **bootstrap** IF the requirements doc structure doesn't exist or is messy. It will detect the doc root, propose a migration plan for any legacy docs, and (after the user confirms the plan) establish the standard structure. Skip if already bootstrapped.

### Stage 1 - DEFINE  (skill: clarify, then agent: ba-curator, verb: update)
Read `~/.claude/skills/clarify/SKILL.md` and follow it with the user (it is user-invoked, so the Skill tool cannot load it). Its final step, the user confirming the shared understanding, **is HUMAN GATE 1**. Settled terms and decisions go to `CONTEXT.md` and `docs/adr/` through the `domain-modeling` skill.

Then dispatch `ba-curator` with the confirmed understanding to write a short, product-altitude feature spec under `requirements/features/`: what, why, acceptance criteria (product-level, testable behaviour - NOT code detail), honest limitations. ba-curator asks the user again only if the spec would add scope beyond what was confirmed.

### Stage 2 - DESIGN  (agent: architect)
Hand the spec to `architect`. It reads the spec, `philosophy.md`, `CONTEXT.md` and the relevant ADRs, runs its two design checks (vendor best practice first; smallest consumer contract), and returns the design, trade-offs, **the test seams**, and the decisions that need the human.

- If the design surfaces a PRODUCT conflict (a tradeoff the spec did not anticipate, or tension with philosophy), route it back to `ba-curator`, which decides minor (note it) vs major.
- **HUMAN GATE only for key decisions** per "Decision altitude" below (architecture, key feature scope, ADR reversal, security tradeoff). Record accepted ADRs in `docs/adr/` (ba-curator or the conductor; architect is read-only).

### Stage 3 - BUILD  (dev via general-purpose, following the `tdd` skill)
Implement against the spec + design, test-first at the seams the architect listed. No confirmations during the build: seams, test design and implementation details are decided here without asking. Write unit + integration tests, and an e2e plan derived from the spec's acceptance criteria. Prefer an isolated worktree if the build is large.

### Stage 4 - REVIEW  (agents in parallel, then GitHub Copilot on the PR)
Dispatch concurrently on the diff:
- `code-reviewer` twice: once with axis **Standards**, once with axis **Spec** (pass the spec path). Keep the two reports separate.
- `python-reviewer` when the diff changes `.py` files.
- `security-reviewer`.

Collect findings and dispatch fixes back to the build agent. No human gate here - review-and-fix is routine. Loop until CRITICAL/HIGH are cleared. Then open the PR and follow the `pr-workflow` skill (Copilot review, every thread fixed or rebutted and resolved, CI green).

### Stage 5 - VERIFY  (agent: e2e-verifier — owns the verify report)
Dispatch `e2e-verifier`. It reads the feature's acceptance criteria **and** any project verification contract (e.g. `requirements/e2e-verification.md` / a vital-features list) and **exercises the real behavior**, then **emits the release verify report** — the gate before CLOSE.

Non-negotiable rules the verifier enforces (mirror these when you read its report):
- **Verified means EXERCISED.** Every item is `VERIFIED` (the real path was run + observed) or `NOT VERIFIED` (say why + hand the exact steps to the human). No third state, no guessing, no "green status ⇒ it works".
- **Verify RECOVERY, not steady-state.** For anything claiming reliability/self-heal, a healthy reading is NOT proof — it can be propped up by a leftover/hand-placed artifact. Cause the real failure (kill/delete/wipe/remove-all-redundancy), observe self-recovery end-to-end with **freshness proof** (new mtime/pid/re-fetch), no manual help.
- **Process accuracy — nothing more, nothing less.** Confirm the running set is exactly expected; rotations/updates leave **no orphaned old-version processes or binaries**; verify each is current + legitimately signed/checksummed. An orphan is a FAIL to investigate, not noise.
- **White-box, not just black-box.** The verifier reads **logs, metrics, and automated tests** — not only externally-visible behavior. Every component must have **captured, persisted logs** (a component logging to `/dev/null` is a defect); scan the test window for unexpected `ERROR`/`WARN`; a failure that produces **no** error log is itself a FAIL; and confirm the build has automated **unit (+ integration) tests** that pass — the live e2e supplements them, it doesn't replace them.
- **Honest report up front.** `NOT VERIFIED` items go at the TOP of the report and are handed to the human to run. Verdict is `PASS` only when the whole contract was exercised.
- **The report is durable EVIDENCE kept in the BA layer.** Persist the verify report (the per-criterion matrix + the exact commands and observed output) and LINK it from the feature / `ba-curator` doc — it is the test-evidence trail for the release, not a transient console dump. A future reader must be able to see what was tested and how. Keep test scripts/artifacts with the evidence (throwaway harnesses live outside the codebase, but the REPORT is retained).

Routing: if behavior does NOT match the documented contract, route to `ba-curator` — minor (doc was slightly off → update + note) vs major (the product doesn't do what was promised → **HUMAN GATE 2**). A `PASS-WITH-GAPS` / `FAIL` verdict, or any vital recovery/process-accuracy check left NOT VERIFIED, blocks CLOSE until the human signs off.

### Stage 5b - VERIFY SIGN-OFF  (agent: ba-curator)
Before CLOSE, `ba-curator` SIGNS OFF the verify report against the acceptance criteria: walk the feature doc's criteria **one-by-one** and confirm EACH has a matching `VERIFIED` tick in the report (or an explicitly accepted `NOT VERIFIED` with reason). The point is to catch a criterion the e2e pass **missed entirely** — a gap the verifier can't see because it only checks what it chose to test. If a criterion has no evidence, route back to `e2e-verifier` to test it (consider a separate coverage-audit pass). Record the sign-off (the coverage matrix + what's not-verified) in the feature doc. **No sign-off → no CLOSE.**

### Stage 6 - CLOSE  (agent: ba-curator, verb: release-review after ship)
Once merged/released AND signed off (5b): `ba-curator` flips status to shipped, updates the version table + honest-limitations, **links the retained verify report as evidence**, and confirms the feature spec matches what actually shipped.

## Decision altitude - what to gate vs what to decide (READ THIS)
The single most important judgment in the cycle: which decisions are yours (act as a trusted tech lead) and which MUST go back to the human.

DECIDE AUTONOMOUSLY (you are the tech lead the user trusts):
- Implementation details: file permissions, env handling, where a temp file lives, code structure, error wording, which helper to extract.
- Test design, refactors that preserve behavior, review-fix application.
- Anything reversible and below the feature/architecture line.

CHECK WITH THE HUMAN (always a gate):
- Architecture changes - how a major component is structured or how many of them there are.
- Key feature decisions - what the product does or stops doing, scope in/out.
- Anything that reverses an accepted ADR or tensions with philosophy.
- A security/threat-model tradeoff (e.g. weakening a disguise to make something work).

Canonical example: **consolidating two daemons into one (dual-mesh -> single-mesh) is a KEY architecture decision - gate it.** That class of change (merging components, changing the core model, flipping how a major piece works) is never decided alone, even when it seems obviously right. By contrast, "what file permission bits let the dropped user exec the binary" is an implementation detail - just do it.

Note: with an AI dev loop most code is quickly reversible via git, so "hard to revert" is judged by architectural/product SIGNIFICANCE, not literal revert difficulty. When unsure which side of the line a decision is on, treat it as a gate and ask - a 30-second check beats the user catching up to a shipped surprise later.

## Gates
The only gates are: (1) the shared understanding confirmed at DEFINE, (2) any architecture / key-feature / threat-model decision per "Decision altitude" above, (3) a major behaviour/product conflict at VERIFY, plus any ADR reversal, and any production-safety gate. Everything else (code-review fixes, test additions, implementation details, minor doc edits) proceeds without asking the user.

## Everything via PR
Code changes go through a PR and the `pr-workflow` skill. Config and agent changes go through the config repo's PR the same way. Never push directly to a shared branch.

## Above the per-feature cycle — the RELEASE gate (agent: release-verifier)
This cycle verifies ONE feature at merge (Stage 5). A release usually ships a
TRAIN of features together (everything merged to nonprod/main since the last prod
release). Before promoting that train nonprod→prod, run the **`release-verifier`**
agent — the per-RELEASE, cross-feature gate that sits ABOVE this per-feature loop:

- **When:** after the features in the train have each been through VERIFY + CLOSE
  and merged to nonprod/main, and BEFORE opening the nonprod→prod promotion PR.
- **What it does:** builds the release manifest from `git log origin/prod..origin/main`,
  impact-classifies each feature (behavior / latency / load / config-infra / docs),
  **reuses each feature's e2e-verifier VERIFY REPORT** (with a freshness gate — stale
  or missing = NOT-VERIFIED, delegate back to e2e-verifier), runs impact-matched
  release-level rehearsal (e.g. a **load test** vs baseline for latency/load features,
  using the repo's k6 kit), checks cross-feature regressions, env/config parity
  nonprod→prod, rollback paths, CI + monitoring, and reconciles the manifest.
- **Output:** a go/no-go **RELEASE READINESS report** (per-feature VERIFIED/NOT-VERIFIED
  with evidence + confidence, gaps at the top). It **composes** e2e-verifier (never
  duplicates it) and hands the report to **`ba-curator` (release-review)** so the
  release is recorded at product altitude.
- **It NEVER auto-promotes.** It stops at the human's explicit go — a GO verdict is a
  recommendation, not permission to promote.

The chain end-to-end: `/product-cycle` per feature → `e2e-verifier` verifies each at
merge → `release-verifier` verifies the whole train before promotion → `ba-curator`
records the release.

### Project-scoped SRE agent (a pattern, not a shared agent)
Each project SHOULD define its own **`.claude/agents/sre.md`** — a live-signals
specialist that knows THAT project's dashboards, alerts, log events, runbooks, and
baselines. It is **READ-ONLY on prod**, works alongside `release-verifier`'s
pre-promotion evidence gathering (release-verifier is pre-promotion only; the SRE
agent's post-promotion sweep evidence flows to `ba-curator`'s release record), runs
standalone for incident triage and health sweeps, and maintains its role memory
(`.claude/agents/memory/sre.md`).
There is no generic SRE agent in this config: the agent's entire value is
project-specific knowledge, so the definition lives in each repo — only the pattern
is cross-project.

## Output between stages
After each stage, give the user a 3-5 line status: which stage finished, what the agent produced, whether the next step is a gate (needs them) or routine (proceeds automatically).
