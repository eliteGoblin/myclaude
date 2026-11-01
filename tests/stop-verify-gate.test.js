'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, '..', 'custom', 'scripts', 'hooks', 'stop-verify-gate-fsun.js');
const { decide } = require(HOOK);

const prompt = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const toolResult = () => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } });
const tool = (name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
const say = (text) => ({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
const edit = (file) => tool('Edit', { file_path: file });
const bash = (command) => tool('Bash', { command });

test('blocks: code edited, nothing run after it, reply says done', () => {
  const reason = decide([prompt('fix it'), edit('/r/lib/a.js'), toolResult(), say('Fixed. It works now.')]);
  assert.match(reason, /lib\/a\.js/);
});

test('allows: a command ran after the last code edit', () => {
  assert.equal(decide([prompt('fix it'), edit('/r/lib/a.js'), toolResult(), bash('npm test'), toolResult(), say('Fixed: 51 pass.')]), '');
});

test('blocks: a command ran only before the last edit', () => {
  const t = [prompt('fix'), bash('npm test'), toolResult(), edit('/r/lib/a.py'), toolResult(), say('Done.')];
  assert.notEqual(decide(t), '');
});

test('allows: doc-only edits, no claim, or an explicit NOT VERIFIED', () => {
  assert.equal(decide([prompt('x'), edit('/r/README.md'), toolResult(), say('Done.')]), '');
  assert.equal(decide([prompt('x'), edit('/r/a.js'), toolResult(), say('I changed the parser; next I need your input.')]), '');
  assert.equal(decide([prompt('x'), edit('/r/a.js'), toolResult(), say('Fixed, NOT VERIFIED: no test runner here.')]), '');
});

test('allows: edits from an earlier turn do not count in a new question turn', () => {
  const t = [prompt('fix'), edit('/r/a.js'), toolResult(), say('Edited.'), prompt('is it done?'), say('Yes, it is done.')];
  assert.equal(decide(t), '');
});

test('hook process: prints a block decision, and stays silent when stop_hook_active', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stopgate-'));
  const transcript = path.join(dir, 't.jsonl');
  fs.writeFileSync(transcript, [prompt('fix'), edit('/r/a.ts'), toolResult(), say('All done.')].map((e) => JSON.stringify(e)).join('\n'));
  const run = (input) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8' });
  const blocked = run({ transcript_path: transcript, stop_hook_active: false });
  assert.equal(blocked.status, 0);
  assert.equal(JSON.parse(blocked.stdout).decision, 'block');
  assert.equal(run({ transcript_path: transcript, stop_hook_active: true }).stdout, '');
  assert.equal(run({ transcript_path: path.join(dir, 'missing.jsonl') }).stdout, '');
});

test('allows: negated or conditional status, and a reply that ends with a question', () => {
  for (const text of ['Not done yet. Shall I run it?', 'The fix is not ready.', "It isn't fixed.", 'It will be complete once you run it.', 'Edited the parser. Should I run the tests?']) {
    assert.equal(decide([prompt('x'), edit('/r/a.js'), toolResult(), say(text)]), '', text);
  }
});

test('injected user entries (task notifications) do not start a new turn; sidechain entries are ignored', () => {
  const notice = { type: 'user', message: { content: [{ type: 'text', text: '<task-notification>agent finished</task-notification>' }] } };
  assert.notEqual(decide([prompt('fix'), edit('/r/a.js'), toolResult(), notice, say('Done.')]), '');
  const sideBash = { ...bash('npm test'), isSidechain: true };
  assert.notEqual(decide([prompt('fix'), edit('/r/a.js'), toolResult(), sideBash, say('Done.')]), '');
});

test('parseLines drops non-object JSON lines, so decide never throws on them', () => {
  const { parseLines } = require(HOOK);
  const entries = parseLines(['null', '3', '"s"', JSON.stringify(prompt('x')), JSON.stringify(say('Done.'))].join('\n'));
  assert.equal(entries.length, 2);
  assert.equal(decide(entries), '');
});
