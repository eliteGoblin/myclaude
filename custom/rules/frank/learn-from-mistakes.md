# Learn From Mistakes — Continuous Improvement

> Custom always-on rule. Highest priority — overrides upstream rules on conflict.
> Lives in `fsun_config/custom/rules/frank/learn-from-mistakes.md`, installs to
> `~/.claude/rules/frank/learn-from-mistakes.md` via `ecc.js sync`.
> Pairs with [critical-verification.md](./critical-verification.md) and the
> `continuous-learning-v2` skill + the file-based memory system.

## Why
Frank is hurt when a mistake — a hallucination, an inference presented as fact, a
conclusion built on a failed verification, or an unconfirmed destructive action —
costs him time or trust. The fix is not to feel bad; it's to **encode the lesson so
it can't repeat**. (Real cases this session: a false "707 users" conclusion from an
unasserted empty query; deleting a batch without a final confirm.)

## Trigger
Run this loop whenever ANY of these happen:
- I made a mistake or the user corrected me.
- A verification turned out false / based on bad data.
- An action surprised the user or wasn't what they wanted.
- The user expresses frustration or says "you got this wrong / that's your inference".

## The loop (reflect → generalize → encode → sync)
1. **Reflect** — state plainly what went wrong and the root cause, in 1–2 lines. No
   defensiveness, no over-explaining.
2. **Generalize** — extract the one reusable lesson: *what rule would have prevented this?*
3. **Encode at the right scope:**
   - Project-specific fact/decision → a **memory file** (file-based memory system).
   - Cross-project behavior → **update an existing ECC rule** in
     `fsun_config/custom/rules/frank/` (prefer editing over adding new rules).
4. **Sync** — rule changes install via `node fsun_config/ecc.js sync` (note it for Frank).
5. **Confirm the lesson** back to Frank in one line so he can correct it.

## Keep it KISS (Frank's standing philosophy)
- One concise, actionable lesson per mistake — not a policy essay.
- Prefer **simple + reliable** over complex rules covering rare edge cases.
- Consolidate into existing rules/memories rather than proliferating new ones.
- Don't capture the trivial; capture what actually changes future behavior.

## Definition of done
- [ ] Root cause stated honestly.
- [ ] Lesson encoded (memory or rule) at the right scope.
- [ ] Sync path noted if a rule changed.
- [ ] One-line confirmation to Frank.
