'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('../lib/usage');
const cmd = require('../lib/cmd-usage');
const sl = require('../custom/scripts/statusline-fsun');

const NOW = Date.parse('2026-11-08T12:00:00Z');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'usage-test-'));

const USAGE_TEXT = [
  'You are currently using your subscription to power your Claude Code usage',
  '',
  'Current session: 12% used · resets 3pm (Australia/Sydney)',
  'Current week (all models): 36% used · resets Nov 10 at 12:59pm (Australia/Sydney)',
  'Current week (Fable): 42% used · resets Nov 10 at 1pm (Australia/Sydney)',
  '',
  "What's contributing to your usage?",
].join('\n');

test('parsePlanText reads week, 5-hour and per-model lines', () => {
  const p = core.parsePlanText(USAGE_TEXT);
  assert.deepStrictEqual(p.week, { percent: 36, resets: 'Nov 10 at 12:59pm (Australia/Sydney)' });
  assert.strictEqual(p.fiveHour.percent, 12);
  assert.deepStrictEqual(p.weekByModel.map((w) => [w.model, w.percent]), [['Fable', 42]]);
});

test('parsePlanText handles a missing 5-hour line and empty text', () => {
  const p = core.parsePlanText('Current week (all models): 36% used · resets Nov 10 at 1pm');
  assert.strictEqual(p.fiveHour, null);
  assert.strictEqual(p.week.percent, 36);
  assert.deepStrictEqual(core.parsePlanText(''), { fiveHour: null, week: null, weekByModel: [] });
});

function planDeps(over = {}) {
  return { now: () => NOW, cachePath: '/nonexistent/cache.json', runner: () => ({ status: 0, stdout: JSON.stringify({ result: USAGE_TEXT }) }), ...over };
}

test('getPlan falls back to /usage when no cache exists', () => {
  const p = core.getPlan(planDeps());
  assert.strictEqual(p.source, '/usage');
  assert.strictEqual(p.week.percent, 36);
});

test('getPlan uses a fresh cache and does not call claude', () => {
  const dir = tmp();
  const file = path.join(dir, 'c.json');
  const cache = { written_at: NOW - 60000, five_hour: { used_percentage: 5, resets_at: NOW / 1000 + 3600 }, seven_day: { used_percentage: 40, resets_at: NOW / 1000 + 86400 } };
  fs.writeFileSync(file, JSON.stringify(cache));
  const p = core.getPlan(planDeps({ cachePath: file, runner: () => { throw new Error('must not run claude'); } }));
  assert.strictEqual(p.source, 'status-line cache');
  assert.strictEqual(p.ageSeconds, 60);
  assert.strictEqual(p.week.percent, 40);
});

test('getPlan ignores a cache older than 15 minutes', () => {
  const dir = tmp();
  const file = path.join(dir, 'c.json');
  fs.writeFileSync(file, JSON.stringify({ written_at: NOW - 16 * 60000, seven_day: { used_percentage: 40, resets_at: NOW / 1000 + 86400 } }));
  assert.strictEqual(core.getPlan(planDeps({ cachePath: file })).source, '/usage');
});

test('getPlan reports not available when claude fails, never throws', () => {
  const p = core.getPlan(planDeps({ runner: () => ({ error: 'timeout after 60 s' }) }));
  assert.strictEqual(p.available, false);
  assert.match(p.reason, /timeout/);
  assert.strictEqual(core.getPlan(planDeps({ runner: () => { throw new Error('boom'); } })).available, false);
  assert.strictEqual(core.getPlan(planDeps({ runner: () => ({ status: 0, stdout: JSON.stringify({ result: 'nothing' }) }) })).available, false);
});

// ─── transcripts ─────────────────────────────────────────────────────

function entry(id, model, usage, ts) {
  return JSON.stringify({ type: 'assistant', timestamp: ts, message: { id, model, usage } });
}
const U = (i, cw, cr, o) => ({ input_tokens: i, cache_creation_input_tokens: cw, cache_read_input_tokens: cr, output_tokens: o });

function makeProjects() {
  const root = tmp();
  const dir = path.join(root, 'proj');
  fs.mkdirSync(path.join(dir, 'S1', 'subagents'), { recursive: true });
  const t = (h) => new Date(NOW - h * 3600000).toISOString();
  fs.writeFileSync(path.join(dir, 'S1.jsonl'), [
    entry('m1', 'sonnet', U(2, 100, 1000, 5), t(1)),
    entry('m1', 'sonnet', U(2, 100, 1000, 50), t(1)), // duplicate id: counted once, larger output kept
    entry('m2', 'sonnet', U(1, 0, 500, 10), t(2)),
    entry('old', 'sonnet', U(9, 9, 9, 9), t(100)), // outside 24h
    entry('syn', '<synthetic>', U(7, 7, 7, 7), t(1)),
    'not json "usage"',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'S1', 'subagents', 'agent-a1.jsonl'), entry('s1', 'opus', U(3, 30, 300, 20), t(1)));
  fs.writeFileSync(path.join(dir, 'S1', 'subagents', 'agent-a1.meta.json'), JSON.stringify({ agentType: 'architect' }));
  fs.writeFileSync(path.join(dir, 'S2.jsonl'), entry('o1', 'sonnet', U(4, 0, 0, 4), t(3)));
  // The scanner skips files by mtime, so make mtime match the fake clock.
  for (const f of [path.join(dir, 'S1.jsonl'), path.join(dir, 'S1', 'subagents', 'agent-a1.jsonl'), path.join(dir, 'S2.jsonl')]) {
    fs.utimesSync(f, NOW / 1000, NOW / 1000);
  }
  return root;
}

test('scanLocal dedupes by message id, splits main and subagent, filters by window', () => {
  const r = core.scanLocal({ projectsDir: makeProjects(), sinceMs: 24 * 3600000, now: () => NOW });
  assert.strictEqual(r.totals.messages, 4); // m1, m2, s1, o1
  assert.strictEqual(r.totals.output, 50 + 10 + 20 + 4);
  assert.strictEqual(r.totals.cacheRead, 1000 + 500 + 300);
  const sub = r.rows.find((x) => x.role === 'subagent');
  assert.strictEqual(sub.agentType, 'architect');
  assert.strictEqual(sub.model, 'opus');
  const mainSonnet = r.rows.find((x) => x.role === 'main' && x.model === 'sonnet');
  assert.strictEqual(mainSonnet.messages, 3);
});

test('scanLocal --since excludes older entries; no window includes them', () => {
  const projectsDir = makeProjects();
  assert.strictEqual(core.scanLocal({ projectsDir, sinceMs: 90 * 60000, now: () => NOW }).totals.messages, 2); // m1 and s1
  assert.strictEqual(core.scanLocal({ projectsDir, sinceMs: null, now: () => NOW }).totals.messages, 5);
});

test('scanLocal session totals include its subagents only', () => {
  const r = core.scanLocal({ projectsDir: makeProjects(), sinceMs: null, session: 'S1', now: () => NOW });
  assert.strictEqual(r.totals.messages, 4); // m1, m2, old, s1
  assert.ok(r.rows.some((x) => x.role === 'subagent'));
});

test('parseSince', () => {
  assert.strictEqual(core.parseSince('24h'), 24 * 3600000);
  assert.strictEqual(core.parseSince('7d'), 7 * 86400000);
  assert.throws(() => core.parseSince('abc'));
  assert.throws(() => core.parseSince('0h'));
});

// ─── command ─────────────────────────────────────────────────────────

function runCmd(args, over = {}) {
  const lines = [];
  const code = cmd.run(args, { fs, now: () => NOW, runner: planDeps().runner, cachePath: '/nonexistent', projectsDir: makeProjects(), out: (l) => lines.push(l), ...over });
  return { code, text: lines.join('\n') };
}

test('--json prints one object with stable keys', () => {
  const { code, text } = runCmd(['--json']);
  assert.strictEqual(code, 0);
  const j = JSON.parse(text);
  assert.deepStrictEqual(Object.keys(j), ['generated_at', 'plan', 'local']);
  assert.strictEqual(j.plan.week.percent, 36);
  assert.deepStrictEqual(Object.keys(j.local), ['window', 'output_tokens_note', 'transcripts_scanned', 'totals', 'rows']);
});

test('text output says "plan usage: not available" and still exits 0', () => {
  const { code, text } = runCmd([], { runner: () => ({ error: 'no claude' }) });
  assert.strictEqual(code, 0);
  assert.match(text, /plan usage: not available/);
  assert.match(text, /subagent:architect/);
});

// ─── status line script ──────────────────────────────────────────────

const SL_INPUT = {
  model: { display_name: 'Sonnet 5.5' }, session_id: 'abc',
  context_window: { used_percentage: 23.4 },
  rate_limits: { five_hour: { used_percentage: 12.2, resets_at: 1762560000 }, seven_day: { used_percentage: 36, resets_at: 1762750000 } },
};

test('status line: full line and omitted parts', () => {
  const line = sl.buildLine(SL_INPUT);
  assert.match(line, /^Sonnet 5\.5 · ctx 23% · 5h 12% · wk 36% \(\w{3} \d+ \d+(:\d\d)?[ap]m\)$/);
  assert.strictEqual(sl.buildLine({ model: { display_name: 'X' } }), 'X');
  assert.strictEqual(sl.buildLine({}), '');
});

test('status line: cache is written atomically and read back by usage', () => {
  const dir = tmp();
  const file = path.join(dir, 'sub', 'usage-cache.json');
  const nowSec = NOW / 1000;
  const input = { ...SL_INPUT, rate_limits: { five_hour: { used_percentage: 12, resets_at: nowSec + 100 }, seven_day: { used_percentage: 36, resets_at: nowSec + 1000 } } };
  sl.writeCache(file, sl.buildCache(input, NOW));
  assert.deepStrictEqual(fs.readdirSync(path.dirname(file)), ['usage-cache.json']); // no temp file left
  const p = core.getPlan(planDeps({ cachePath: file, runner: () => { throw new Error('no'); } }));
  assert.strictEqual(p.source, 'status-line cache');
  assert.strictEqual(p.week.percent, 36);
  assert.strictEqual(sl.buildCache({}, NOW).seven_day, null);
});
