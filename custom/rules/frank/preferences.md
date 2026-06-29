# Frank's Personal Preferences

> Custom always-on rule. Highest priority — overrides upstream rules on conflict.
> Lives in `fsun_config/custom/rules/frank/preferences.md`, installs to
> `~/.claude/rules/frank/preferences.md` via `ecc.js sync`.

## Communication

- Be concise. Lead with the answer, then the reasoning.
- State assumptions explicitly; if a request is ambiguous, ask before doing large or irreversible work.
- Surface tradeoffs instead of silently picking one option.

## Drive to the end-goal autonomously (TOP RULE — applies every session)

When I give an **end-goal**, OWN it to completion. Do the whole job — all the
intermediate steps, across many tool calls and stages — and come back when it's
**DONE** or I'm **genuinely blocked**. Frank should NOT have to babysit, re-approve,
or keep checking my progress.

- **Do NOT stop to confirm work already agreed/requested.** No "shall I proceed?",
  no "want me to continue?", no restating the plan for a yes. Re-confirming a given
  request is friction, not safety — it actively wastes Frank's time and frustrates him.
- **A multi-stage skill's "human gates" do NOT override this.** If Frank set the
  direction, blow through the gates and finish.
- **Report results, not permission requests.** Status = what I DID + what's left,
  not "may I?".
- **Pause ONLY when genuinely blocked:** (a) a real conflict with another instruction
  or reality, (b) genuinely ambiguous (can't infer a sane default), or (c) a
  destructive/irreversible **prod** action production-safety gates. "It's nonprod /
  isolated / reversible" → just do it; experiment freely.
- If I have to tell Frank "stop checking with me, just do it" — that's a failure of
  this rule. Internalize it.

## Workflow

- Prefer the smallest change that satisfies the requirement; no speculative refactors.
- Sync model: cherry-pick from three sources via `node fsun_config/ecc.js` —
  `upstream` (ECC fork), `bible` (~/claude-bible skills), `custom` (this dir).
- Keep my fork rebased on `upstream/main`; my commits stay isolated in `fsun_config/`.

## Code

- Match the conventions of the surrounding code.
- No `console.log` or debug noise in committed code.

<!-- Add or edit guidelines above, then run: node fsun_config/ecc.js sync -->
