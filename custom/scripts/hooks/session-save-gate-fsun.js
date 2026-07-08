#!/usr/bin/env node
/**
 * session-save-gate-fsun.js — gated Stop hook (Frank's overlay)
 *
 * Wraps upstream session-end.js with two skips, so wire settings.json's Stop
 * hook to THIS script instead of session-end.js directly:
 *
 *   "Stop": [{ "hooks": [{ "type": "command",
 *     "command": "node \"$HOME/.claude/scripts/hooks/session-save-gate-fsun.js\"" }]}]
 *
 * Skip 1 — summarizer children: every ECC save spawns a headless
 *   `claude -p` helper (llm-summary.js) whose own Stop hook would write a
 *   ~27-line phantom stub into session-data/ (upstream #1494 gives each a
 *   unique filename instead of suppressing it). The helper inherits
 *   ECC_SKIP_LLM_SUMMARY=1, so its presence marks "we are inside the
 *   summarizer" — skip saving entirely.
 *   CAVEAT: setting ECC_SKIP_LLM_SUMMARY globally (the upstream knob for
 *   "no LLM summaries") would also disable saving with this gate in place.
 *
 * Skip 2 — ECC_DISABLED_HOOKS contains stop:session-end: honors ECC's
 *   documented disable knob without run-with-flags.js being installed
 *   (used by ~/claude_adhoc scratch folder's local settings).
 *
 * Otherwise: run session-end.js in-process (it reads the same stdin).
 * Fail-open: any unexpected error exits 0 so the Stop event is never blocked.
 */

'use strict';

const path = require('path');
const os = require('os');

function isDisabled() {
  if (process.env.ECC_SKIP_LLM_SUMMARY) return true;
  const raw = String(process.env.ECC_DISABLED_HOOKS || '');
  return raw.split(',').map(s => s.trim()).includes('stop:session-end');
}

try {
  if (!isDisabled()) {
    require(path.join(os.homedir(), '.claude', 'scripts', 'hooks', 'session-end.js'));
  }
} catch (err) {
  process.stderr.write(`[SessionSaveGate] non-fatal: ${err.message}\n`);
  process.exitCode = 0;
}
