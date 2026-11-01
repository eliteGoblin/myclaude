#!/usr/bin/env node
'use strict';

// stop-verify-gate-fsun.js — Stop hook: block a "done" claim for code that was changed but never run.
//
// Blocks the turn when all three are true in the current turn:
//   1. a code file was edited (Edit / Write / MultiEdit / NotebookEdit),
//   2. no Bash command ran after the last such edit,
//   3. the final assistant text claims completion ("done", "fixed", "works", "passes", ...)
//      and does not say "NOT VERIFIED".
// Answers to questions and doc-only edits are never blocked. Known gaps (accepted): config files
// (.json, .yaml) are not "code"; a subagent's own test run is not visible here. A block happens at most once per turn
// (stop_hook_active). Sources: philosophy.md §7; https://code.claude.com/docs/en/best-practices
// ("a Stop hook runs your check as a script and blocks the turn from ending until it passes");
// obra/superpowers skills/verification-before-completion/SKILL.md. Added 2026-10-25.

const fs = require('fs');

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const CODE_EXT = /\.(js|cjs|mjs|ts|tsx|jsx|py|go|rs|rb|java|kt|sh|bash|zsh|sql|tf|ps1|swift|c|cc|cpp|h)$/i;
const CLAIM = /\b(done|fixed|works|working|passes|passing|ready|complete|completed|resolved)\b/i;
const NOT_VERIFIED = /not verified/i;
// "not done", "isn't fixed", "never passes", "until it works": negated or conditional, not a claim.
const NEGATED = /(?:\b(?:not|never|until|unless|once)|n't)\W+(?:\w+\W+){0,2}(done|fixed|works|working|passes|passing|ready|complete|completed|resolved)\b/i;
// "complete once you run it", "works after a restart": the claim depends on a later step.
const CONDITIONAL = /\b(done|fixed|works|working|passes|passing|ready|complete|completed|resolved)\W+(?:\w+\W+){0,1}(once|after|when|if|until|unless)\b/i;

function parseLines(text) {
  return text.split('\n').filter(Boolean).flatMap((l) => {
    try {
      const e = JSON.parse(l);
      return e && typeof e === 'object' ? [e] : [];
    } catch {
      return [];
    }
  });
}

function blocksOf(entry) {
  const c = entry && entry.message && entry.message.content;
  return Array.isArray(c) ? c : [];
}

function promptText(entry) {
  const c = entry.message && entry.message.content;
  if (typeof c === 'string') return c;
  if (blocksOf(entry).some((b) => b.type === 'tool_result')) return '';
  return blocksOf(entry).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

// A prompt Frank typed. Injected entries (task notifications, system reminders) start with '<'.
function isHumanPrompt(entry) {
  if (entry.type !== 'user' || entry.isMeta || entry.isSidechain) return false;
  const text = promptText(entry).trimStart();
  return text.length > 0 && !text.startsWith('<');
}

function currentTurn(entries) {
  let start = 0;
  entries.forEach((e, i) => { if (isHumanPrompt(e)) start = i + 1; });
  return entries.slice(start).filter((e) => e.type === 'assistant' && !e.isSidechain);
}

function editedPath(block) {
  const input = block.input || {};
  return input.file_path || input.notebook_path || '';
}

// Returns a block reason string, or '' to let the turn end.
function decide(entries) {
  const turn = currentTurn(entries);
  const tools = turn.flatMap(blocksOf).filter((b) => b.type === 'tool_use');
  let lastEdit = -1;
  tools.forEach((b, i) => { if (EDIT_TOOLS.has(b.name) && CODE_EXT.test(editedPath(b))) lastEdit = i; });
  if (lastEdit === -1) return '';
  if (tools.slice(lastEdit + 1).some((b) => b.name === 'Bash')) return '';
  const lastText = turn.flatMap(blocksOf).filter((b) => b.type === 'text').map((b) => b.text).pop() || '';
  const claims = CLAIM.test(lastText) && !NEGATED.test(lastText) && !CONDITIONAL.test(lastText) && !/\?\s*$/.test(lastText);
  if (!claims || NOT_VERIFIED.test(lastText)) return '';
  const file = editedPath(tools[lastEdit]);
  return `Code was changed (${file}) and nothing was run after the last edit, but the reply claims completion. Run the test, script, or command that exercises the change and report its output, or mark the claim NOT VERIFIED (philosophy.md §7).`;
}

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return;
  }
  if (input.stop_hook_active || !input.transcript_path) return;
  let text;
  try {
    text = fs.readFileSync(input.transcript_path, 'utf8');
  } catch {
    return;
  }
  let reason = '';
  try {
    reason = decide(parseLines(text));
  } catch {
    return; // never block on a hook error
  }
  if (reason) process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}

if (require.main === module) main();

module.exports = { decide, parseLines, isHumanPrompt };
