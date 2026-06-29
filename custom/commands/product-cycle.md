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

### Stage 4 - REVIEW  (agents: code-reviewer + language reviewer + security-reviewer, in parallel — AND GitHub Copilot on the PR)
Run the relevant reviewers concurrently on the diff. Collect findings, dispatch fixes back to the build agent. This stage has NO human gate - review-and-fix is routine. Loop until reviewers are satisfied (CRITICAL/HIGH cleared).

**Copilot review on the PR is MANDATORY before merge** (mirrors the always-on PR workflow). Once the PR is open and the local reviewers are clear: **request a GitHub Copilot review, WAIT for it to post, address EVERY comment** — fix it (push + reply `Fixed`) or rebut it (reasoned why-not) — **and mark each thread RESOLVED** (a reply alone does NOT resolve a line-level thread on GitHub). "Code review" for this cycle = the local specialist agents **and** Copilot; both must be satisfied. Do NOT merge with any unresolved Copilot thread or red CI. The exact commands are in **[Copilot review — exact commands](#copilot-review--exact-commands)** below.

### Stage 5 - VERIFY  (agent: e2e-verifier — owns the verify report)
Dispatch `e2e-verifier` (the web-frontend `e2e-runner` is for browser UIs; use it only for web work). It reads the feature's acceptance criteria **and** any project verification contract (e.g. `requirements/e2e-verification.md` / a vital-features list) and **exercises the real behavior**, then **emits the release verify report** — the gate before CLOSE.

Non-negotiable rules the verifier enforces (mirror these when you read its report):
- **Verified means EXERCISED.** Every item is `VERIFIED` (the real path was run + observed) or `NOT VERIFIED` (say why + hand the exact steps to the human). No third state, no guessing, no "green status ⇒ it works". The user has been burned by claimed-but-unverified results — do not repeat it.
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

## Human-gate discipline
The cycle is NOT fire-and-forget. Run a stage, report the result, STOP at each HUMAN GATE, and wait for the user to say continue. The gates are: (1) direction approval at DEFINE, (2) any architecture / key-feature / threat-model decision (per "Decision altitude" above), (3) major behavior/product conflict at VERIFY, plus any ADR reversal. Everything else (code-review fixes, test additions, implementation details, minor doc tweaks) proceeds without interrupting the user.

## Everything via PR
Code changes go through the project's PR workflow: branch -> PR -> local reviewers -> **request GitHub Copilot review -> address + RESOLVE every Copilot thread (fix + reply `Fixed` + mark resolved, or a reasoned rebuttal reply + resolve)** -> CI green -> merge. **Never merge a PR with an unresolved Copilot thread or red/pending CI.** Config/agent changes go through the config repo's PR workflow (same Copilot + CI gate). Never push directly to a shared branch.

## Copilot review — exact commands
Set `O`/`R`/`N` to owner / repo / PR-number. Run these as the literal mechanical steps:

1. **Request Copilot** (after the PR is open):
   ```bash
   gh api --method POST repos/$O/$R/pulls/$N/requested_reviewers -f "reviewers[]=copilot-pull-request-reviewer[bot]"
   ```
2. **Wait** ~1–3 min, then **pull its review + inline comments**:
   ```bash
   gh api repos/$O/$R/pulls/$N/reviews  -q '.[]|select(.user.login|startswith("copilot"))|.body'
   gh api repos/$O/$R/pulls/$N/comments -q '.[]|{id,path,line,body:.body[0:300]}'
   ```
3. **Address each comment** — fix in code (push the fix) or decide won't-fix — then **reply on that comment thread**:
   ```bash
   gh api --method POST repos/$O/$R/pulls/$N/comments/<COMMENT_ID>/replies -f body="Fixed: <what changed>"
   # or a reasoned rebuttal: -f body="Won't fix: <specific reason>"
   ```
4. **Mark the thread RESOLVED** (a reply does NOT resolve it). Get thread node-ids, then resolve each:
   ```bash
   gh api graphql -f query='{repository(owner:"'$O'",name:"'$R'"){pullRequest(number:'$N'){reviewThreads(first:50){nodes{id isResolved comments(first:1){nodes{databaseId}}}}}}}'
   gh api graphql -f query='mutation{resolveReviewThread(input:{threadId:"<THREAD_ID>"}){thread{isResolved}}}'
   ```
5. **Verify** before merge: every thread `isResolved:true` and CI green:
   ```bash
   gh pr checks $N --repo $O/$R          # all pass
   gh api repos/$O/$R/pulls/$N/comments -q '[.[]|.id]|length'   # cross-check none left unaddressed
   ```
Only then merge. No unresolved Copilot thread, no red CI.

## Output between stages
After each stage, give the user a 3-5 line status: which stage finished, what the agent produced, whether the next step is a gate (needs them) or routine (proceeds automatically).
