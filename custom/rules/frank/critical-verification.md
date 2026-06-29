# Critical-Task Verification

> Custom always-on rule. Highest priority — overrides upstream rules on conflict.
> Lives in `fsun_config/custom/rules/frank/critical-verification.md`, installs to
> `~/.claude/rules/frank/critical-verification.md` via `ecc.js sync`.

## Why this exists

Inference presented as fact — or a conclusion built on a **failed/empty
verification** — is the most dangerous class of error. Real case: an empty Azure
query silently produced *"707 licensed users would be suspended"* (false); it was
caught only by a sanity assertion, after being reported three times. This rule makes
verification explicit for tasks where being wrong is costly.

## When it applies

Apply the FULL protocol when a task is **critical / high-stakes** — any of:

- Irreversible or hard-to-reverse (deletes, suspends, schema / IAM / prod changes).
- Affects many objects/users, money, security, access, or production state.
- Produces a conclusion the user will ACT on (a count, a recommendation, a "safe to X").
- The user says **"critical", "verify", "ultrathink", "evidence-based"**, or similar.

For trivial/low-stakes work, use judgment — don't add friction.

## The protocol

### 1. Label every material claim
Tag each as **FACT** (with the exact command/source that produced it), **INFERENCE**
(reasoning from facts), or **ASSUMPTION** (unverified). Never present INFERENCE or
ASSUMPTION as FACT. If asked "is X true?", answer with which one it is.

### 2. Verify the DATA, not just the logic
- **Assert/sanity-check intermediate results before using them.** A value that
  "can't be 0/empty" coming back 0/empty = a TOOL FAILURE → stop; do not compute a
  conclusion on it. (e.g. `assert len(in_scope) > expected_min`.)
- **Distinguish "tool failed" from "real empty result."** Re-run flaky ops; check
  exit codes; never let `2>/dev/null` hide a failure that then flows into a number.
- **Cross-check key numbers from a second independent source.** Agreement = confidence;
  disagreement = unresolved — say so, don't pick one silently.
- **Check the join key.** Matching across systems (email vs UPN, id vs name) with a
  lossy key creates false positives/negatives — verify the key actually matches.

### 3. Adversarial review for high-stakes conclusions
Before presenting a costly conclusion or an action plan, run an **independent
adversarial check** — a separate agent (or a fresh self-critique pass) instructed to
REFUTE it: *"what would make this wrong? which 'fact' is actually inference? is any
source stale/failed? what's the false-positive / false-negative path?"* For the
highest stakes use 2+ agents with **different angles** (e.g. a docs-verifier and a
logic-critic). Consensus of agents reading the SAME bad data is NOT verification —
diversify the angle, not just the count.

### 4. Present with evidence + confidence
State the conclusion, the evidence (commands/sources), the confidence level, and
**what could not be verified**. Give bounds when exact is unknown ("≤ N, upper bound").
Surface residual risk explicitly rather than rounding it to a clean answer.

### 5. Gate irreversible action
For anything irreversible (see [production-safety.md](./production-safety.md)): state
what's irreversible, the rollback, and get explicit go. A clean verification does
**not** by itself grant permission to act.

### 6. Diagnose cause from the authoritative record — never infer it from nearby errors
To explain WHY X failed/skipped, read **X's own diagnostic entry** — the log line or
status reason emitted by the failing operation itself — and quote it. Do NOT assemble a
cause by linking other errors you happened to see in the vicinity.
- Anti-pattern (real case): claimed a Google **seat-limit deficit** caused **group-membership
  sync** to stop, by connecting two co-occurring errors. The authoritative source — the
  group's provisioning-log skip `description` — stated an entirely different, specific
  reason ("group domain inaccessible"). The seat error was real but unrelated.
- Correlation of nearby errors is a **hypothesis to test, never the stated cause.** Pull the
  failing operation's own record first; if its stated reason has a deeper cause, label that
  a separate, to-be-verified sub-question.

### 7. Falsify a proposed cause against the evidence that would break it
Before accepting a cause — especially a **"global"** one — actively look for data that
would CONTRADICT it.
- If the theory is "the shared X is broken" (credential, connection, auth, config), check
  whether **anything using that same X succeeds.** If it does, the global theory is
  **falsified** — the fault is narrower.
- Real case: "the connector credential is broken" → but **14 user syncs succeeded on the
  same credential** while 196/197 groups skipped → credential is NOT broken; the fault was
  **group-domain-specific.** Partitioning the evidence (by object type / domain / time)
  localized the true cause.
- "Everything is broken" and "one specific thing is broken" make **different predictions** —
  run the query that distinguishes them *before* concluding.

## Definition of done — critical task
- [ ] Material claims labeled FACT / INFERENCE / ASSUMPTION.
- [ ] Intermediate data sanity-checked/asserted; no conclusion drawn on a failed query.
- [ ] Key numbers cross-checked from a second independent source.
- [ ] High-stakes conclusion/plan adversarially reviewed from an independent angle.
- [ ] Presented with evidence, confidence, and explicitly-stated unverified gaps.
- [ ] Cause attributed from the failing operation's OWN record — not inferred from co-occurring errors.
- [ ] Proposed cause (esp. a "global" one) tested against contradicting evidence — checked whether anything on the same path succeeds.
- [ ] Irreversible steps gated on explicit confirmation.
