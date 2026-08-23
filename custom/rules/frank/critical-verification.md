# Critical-Task Verification

<!-- Custom always-on rule. Source: custom/rules/frank/critical-verification.md in the myclaude repo; installed by `node myclaude.js sync`. -->

## Why this exists

Inference presented as fact — or a conclusion built on a failed/empty verification — is the most dangerous class of error. This rule makes verification explicit for tasks where being wrong is costly.

## When it applies

Apply the full protocol when a task is critical / high-stakes — any of:

- Irreversible or hard-to-reverse (deletes, suspends, schema / IAM / prod changes).
- Affects many objects/users, money, security, access, or production state.
- Produces a conclusion the user will act on (a count, a recommendation, a "safe to X").
- The user says "critical", "verify", "ultrathink", "evidence-based", or similar.

For trivial/low-stakes work, use judgment — don't add friction.

## The protocol

### 1. Label every material claim
Tag each as **FACT** (with the exact command/source that produced it), **INFERENCE**
(reasoning from facts), or **ASSUMPTION** (unverified). Never present INFERENCE or
ASSUMPTION as FACT. If asked "is X true?", answer with which one it is.

### 2. Verify the data, not just the logic
- **Assert/sanity-check intermediate results before using them.** A value that
  "can't be 0/empty" coming back 0/empty = a tool failure → stop; do not compute a
  conclusion on it. (e.g. `assert len(in_scope) > expected_min`.)
- **Distinguish "tool failed" from "real empty result."** Re-run flaky ops; check
  exit codes; never let `2>/dev/null` hide a failure that then flows into a number.
- **Cross-check key numbers from a second independent source.** Agreement = confidence;
  disagreement = unresolved — say so, don't pick one silently.
- **Check the join key.** Matching across systems (email vs UPN, id vs name) with a
  lossy key creates false positives/negatives — verify the key actually matches.

### 3. Adversarial review for high-stakes conclusions
Before presenting a costly conclusion or an action plan, run an independent
adversarial check — a separate agent (or a fresh self-critique pass) instructed to
refute it: "what would make this wrong? which 'fact' is actually inference? is any
source stale/failed? what's the false-positive / false-negative path?" For the
highest stakes use 2+ agents with different angles (e.g. a docs-verifier and a
logic-critic). Consensus of agents reading the same bad data is not verification —
diversify the angle, not just the count.

### 4. Present with evidence + confidence
State the conclusion, the evidence (commands/sources), the confidence level, and
what could not be verified. Give bounds when exact is unknown ("≤ N, upper bound").
Surface residual risk explicitly rather than rounding it to a clean answer.

### 5. Gate irreversible action
For anything irreversible (see [production-safety.md](./production-safety.md)): state
what's irreversible, the rollback, and get explicit go. A clean verification does
not by itself grant permission to act.

### 6. Diagnose cause from the authoritative record — never infer it from nearby errors
To explain why X failed/skipped, read X's own diagnostic entry — the log line or
status reason emitted by the failing operation itself — and quote it. Do not assemble a
cause by linking other errors you happened to see in the vicinity. Correlation of
nearby errors is a hypothesis to test, never the stated cause. If the stated reason
has a deeper cause, label that a separate, to-be-verified sub-question.

### 7. Falsify a proposed cause against the evidence that would break it
Before accepting a cause — especially a "global" one — actively look for data that
would contradict it. If the theory is "the shared X is broken" (credential, connection,
auth, config), check whether anything using that same X succeeds. If it does, the global
theory is falsified — the fault is narrower; partition the evidence (by object type /
domain / time) to localize it. "Everything is broken" and "one specific thing is broken"
make different predictions — run the query that distinguishes them before concluding.

### 8. Exercise it end-to-end before calling it DONE
A feature/task is DONE only after its behavior is actually exercised end-to-end —
deployed, hit with a real request, and the result observed. Never report "green" for a
path you did not run. If e2e cannot be completed, say so explicitly: list which
checkpoints are un-exercised and why, and hand them back — do not round an
un-run path up to success.

Match the verification environment to the task:
- A live/prod issue (incident, anomaly, "is prod healthy", a real dashboard/metric
  concern) → confirm, then investigate on prod first (read-only / light RO probing —
  that's where the real signal is). Do not try to reproduce a prod incident on nonprod.
- A new feature / behavior check — especially anything needing destructive setup
  ("fake-break" it to prove it works: simulate a Firestore outage, delete a binding to
  prove fallback + alert fire) → do it on nonprod only, never prod.
- Unsure which env or what exactly to verify → consult the architect agent.

## Definition of done — critical task
- [ ] Material claims labeled FACT / INFERENCE / ASSUMPTION.
- [ ] Intermediate data sanity-checked/asserted; no conclusion drawn on a failed query.
- [ ] Key numbers cross-checked from a second independent source.
- [ ] High-stakes conclusion/plan adversarially reviewed from an independent angle.
- [ ] Presented with evidence, confidence, and explicitly-stated unverified gaps.
- [ ] Cause attributed from the failing operation's own record — not inferred from co-occurring errors.
- [ ] Proposed cause (esp. a "global" one) tested against contradicting evidence — checked whether anything on the same path succeeds.
- [ ] Feature/task exercised end-to-end (deployed + real request + observed result) before "done"; any un-exercised checkpoints reported with reasons.
- [ ] Irreversible steps gated on explicit confirmation.
