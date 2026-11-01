#!/usr/bin/env node
/**
 * session-alias-hint-fsun.js — SessionStart hook (Frank's overlay)
 *
 * On every new Claude process, inject one context line so Claude can offer
 * the alias workflow without the user remembering commands:
 *   - folder has an alias      -> name it + how to load full context
 *   - folder has two aliases   -> list candidates, ask which one
 *   - folder unknown           -> suggest creating an alias (Claude should
 *                                 ASK the user, never create silently)
 *   - folder ignored           -> stay silent
 *
 * Fast + fail-open: no network, exits 0 on any error, <200 lines.
 */

'use strict';

const path = require('path');
const os = require('os');

function main() {
  const reg = require(path.join(os.homedir(), '.claude', 'scripts', 'lib', 'session-registry-fsun'));
  const cwd = process.cwd();
  const registry = reg.loadRegistry();

  const wt = path.resolve(cwd);
  if (registry.ignored.some(p => path.resolve(p) === wt)) return;

  const aliases = reg.currentAliases(cwd);
  if (aliases.length === 1) {
    const members = reg.sessionsForAlias(aliases[0], registry);
    process.stdout.write(
      `[sessions] This folder's alias: "${aliases[0]}" (${members.length} session(s)). ` +
      `Offer the user to load full project context via "/sessions switch ${aliases[0]}" if they want to resume prior work.\n`
    );
  } else if (aliases.length > 1) {
    process.stdout.write(
      `[sessions] This folder has multiple aliases: ${aliases.join(', ')}. ` +
      `Ask the user which one this session belongs to, then run "/sessions assign <alias> <file>" for the current session file.\n`
    );
  } else {
    const suggested = reg.suggestAliasName(cwd);
    process.stdout.write(
      `[sessions] No alias for this folder yet. Ask the user if they want one ` +
      `(suggested: "${suggested}") and create it via "/sessions alias create ${suggested}". Do not create it silently.\n`
    );
  }
}

try {
  main();
} catch (err) {
  process.stderr.write(`[SessionAliasHint] non-fatal: ${err.message}\n`);
}
process.exit(0);
