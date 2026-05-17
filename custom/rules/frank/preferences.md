# Frank's Personal Preferences

> Custom always-on rule. Highest priority — overrides upstream rules on conflict.
> Lives in `fsun_config/custom/rules/frank/preferences.md`, installs to
> `~/.claude/rules/frank/preferences.md` via `ecc.js sync`.

## Communication

- Be concise. Lead with the answer, then the reasoning.
- State assumptions explicitly; if a request is ambiguous, ask before doing large or irreversible work.
- Surface tradeoffs instead of silently picking one option.

## Workflow

- Prefer the smallest change that satisfies the requirement; no speculative refactors.
- Sync model: cherry-pick from three sources via `node fsun_config/ecc.js` —
  `upstream` (ECC fork), `bible` (~/claude-bible skills), `custom` (this dir).
- Keep my fork rebased on `upstream/main`; my commits stay isolated in `fsun_config/`.

## Code

- Match the conventions of the surrounding code.
- No `console.log` or debug noise in committed code.

<!-- Add or edit guidelines above, then run: node fsun_config/ecc.js sync -->
