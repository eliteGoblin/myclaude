---
description: Run the full BA-gated product development cycle for a feature - define, design, build, review, verify, close, with the BA requirements doc as the contract all agents read. Human gates at direction-approval and major-conflict. Use for FEATURES, not trivial fixes.
argument-hint: "<one-line intent for the feature>"
---

# Product Cycle

Orchestrate a feature end-to-end like a disciplined product team. You are the **conductor** - you do not write the doc or the code yourself; you dispatch the specialist agents in order, pass each one's output to the next, route feedback, and STOP at human gates.

The **BA requirements doc is the contract.** Every downstream agent reads `<docroot>/requirements/features/*.md` for what to build and verify. Keep the cycle anchored to it.

User intent for this run: **$ARGUMENTS**

## When NOT to use
Trivial changes (typos, one-line fixes, formatting) skip this cycle - just do them. This is for features and substantive changes.

## Stages

### Stage 0 - Setup (only if docs aren't bootstrapped)
Dispatch `ba-curator` with verb **bootstrap** IF the requirements doc structure doesn't exist or is messy. It will detect the doc root, propose a migration plan for any legacy docs, and (after the user confirms the plan) establish the standard structure. Skip if already bootstrapped.

### Stage 1 - DEFINE  (agent: ba-curator, verb: update)
Turn the user's intent into a short, product-altitude feature spec under `requirements/features/`: what, why, acceptance criteria (product-level, testable behavior - NOT code detail), honest limitations, design questions. Record the decision as an ADR if it's non-trivial or reverses a prior one.

**HUMAN GATE 1** - show the user the spec's what/why/acceptance + any design questions. Get explicit approval (or edits) before proceeding. Do NOT pass this gate on material/new scope without a clear yes.

### Stage 2 - DESIGN  (agent: architect)
Hand the approved spec to `architect` for the technical approach + risks. The architect reads the spec + `philosophy.md` + relevant ADRs.
- If the design surfaces a PRODUCT conflict (forces a tradeoff the spec didn't anticipate, or tension with philosophy), route it back to `ba-curator`, which decides minor (note it) vs major.
- **HUMAN GATE on major conflict only** - if the conflict is material or would reverse an ADR, stop and ask the user.

### Stage 3 - BUILD  (agents: dev via general-purpose or tdd-guide)
Implement against the spec + design. Write unit + integration tests, and an e2e plan derived from the spec's acceptance criteria. Prefer an isolated worktree if the build is large. TDD where it fits.

### Stage 4 - REVIEW  (agents: code-reviewer + language reviewer + security-reviewer, in parallel)
Run the relevant reviewers concurrently on the diff. Collect findings, dispatch fixes back to the build agent. This stage has NO human gate - review-and-fix is routine. Loop until reviewers are satisfied (CRITICAL/HIGH cleared).

### Stage 5 - VERIFY  (agent: e2e-runner)
Run the spec's acceptance criteria as real tests against actual behavior. The e2e agent reads `requirements/features/<this-feature>.md` as its contract.
- If behavior does NOT match the documented contract, route to `ba-curator`: minor (the doc was slightly off, update it + note) vs major (the product doesn't do what was promised, **HUMAN GATE 2**).

### Stage 6 - CLOSE  (agent: ba-curator, verb: release-review after ship)
Once merged/released: `ba-curator` flips status to shipped, updates the version table + honest-limitations, and confirms the feature spec matches what actually shipped.

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

## Human-gate discipline
The cycle is NOT fire-and-forget. Run a stage, report the result, STOP at each HUMAN GATE, and wait for the user to say continue. The gates are: (1) direction approval at DEFINE, (2) any architecture / key-feature / threat-model decision (per "Decision altitude" above), (3) major behavior/product conflict at VERIFY, plus any ADR reversal. Everything else (code-review fixes, test additions, implementation details, minor doc tweaks) proceeds without interrupting the user.

## Everything via PR
Code changes go through the project's PR workflow (branch -> PR -> reviewers -> CI green -> merge). Config/agent changes go through the config repo's PR workflow. Never push directly to a shared branch.

## Output between stages
After each stage, give the user a 3-5 line status: which stage finished, what the agent produced, whether the next step is a gate (needs them) or routine (proceeds automatically).
