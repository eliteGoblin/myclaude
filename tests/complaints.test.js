'use strict';

// Complaint register: parsing, each check type, regression exit logic, record. The real claude is never called.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('../lib/complaints');
const cmd = require('../lib/cmd-complaints');

const REAL_DIR = path.join(__dirname, '..', 'requirements', 'complaints');
const SESSION = '0d6c1a8f-e501-498a-8ebc-04f00736d652';

function complaintText({ id = 'C001', type, status = 'OPEN', repro, history = [] } = {}) {
  const fm = ['---', `id: ${id}`, ...(type ? [`type: ${type}`] : []), 'title: A title: with a colon', 'date: 2026-11-01', `status: ${status}`, 'failure: F1', '---'];
  const reproSection = repro === undefined ? 'MANUAL.' : `\`\`\`json repro\n${typeof repro === 'string' ? repro : JSON.stringify(repro)}\n\`\`\``;
  return `${fm.join('\n')}\n\n## Frank said\n\n> exact words\n\n## Claude replied\n\n> excerpt: none\n\n## Expected\n\nIt works.\n\n## Repro\n\n${reproSection}\n\n## Fix\n\nNone yet.\n\n## Check history\n${history.length ? `\n${history.join('\n')}\n` : ''}`;
}

const REPRO = {
  setup: { files: { 'm.py': 'x = 1\n' } },
  prompt: 'shall we fix m.py?',
  runs: 2,
  checks: { unchanged: ['m.py'], maxLines: 3, noSubagents: true, mustMatch: ['yes\\?'], mustNotMatch: ['done'] },
};

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'myclaude-test-'));
const parse = (opts, name = 'C001-x.md') => core.parseComplaint(complaintText(opts), `/r/${name}`);

// ─── parsing ─────────────────────────────────────────────────────────

test('parseComplaint reads frontmatter, sections, the repro block and the history', () => {
  const c = parse({ repro: REPRO, history: ['- 2026-11-01 pass 2/3 claude 2.1.316', '- 2026-11-02 pass 3/3 claude 2.1.317'] });
  assert.equal(c.id, 'C001');
  assert.equal(c.type, 'complaint');
  assert.equal(c.title, 'A title: with a colon');
  assert.equal(c.status, 'OPEN');
  assert.equal(c.frankSaid, '> exact words');
  assert.equal(c.reproError, null);
  assert.equal(c.repro.prompt, 'shall we fix m.py?');
  assert.equal(c.repro.runs, 2);
  assert.deepEqual(c.repro.setup, { files: { 'm.py': 'x = 1\n' }, git: false });
  assert.equal(c.history.length, 2);
  assert.equal(core.lastCheckText(c), '2026-11-02 3/3');
});

test('parseComplaint: a request has its own id prefix and statuses', () => {
  const r = parse({ id: 'R001', type: 'request', status: 'DONE-VERIFIED', repro: REPRO }, 'R001-x.md');
  assert.equal(r.type, 'request');
  assert.throws(() => parse({ id: 'R001', type: 'request', status: 'FIXED-VERIFIED' }, 'R001-x.md'), /not valid for a request/);
  assert.throws(() => parse({ status: 'DONE-VERIFIED' }), /not valid for a complaint/);
  assert.throws(() => parse({ id: 'C001', type: 'request' }, 'C001-x.md'), /must look like R001/);
});

test('parseComplaint rejects a bad id, file name, status and type', () => {
  assert.throws(() => parse({ id: 'X1' }), /must look like C001/);
  assert.throws(() => parse({ id: 'C002' }, 'C001-x.md'), /file name must start with "C002-"/);
  assert.throws(() => parse({ status: 'DONE' }), /status "DONE"/);
  assert.throws(() => parse({ type: 'wish' }), /type "wish"/);
  assert.throws(() => core.parseComplaint(complaintText().replace('failure: F1', 'failure: bad'), '/r/C001-x.md'), /failure "bad"/);
  assert.ok(core.parseComplaint(complaintText().replace('failure: F1', 'failure: F1, W'), '/r/C001-x.md'));
  assert.throws(() => core.parseComplaint('no frontmatter', '/r/C001-x.md'), /frontmatter is missing/);
});

test('a MANUAL item has no repro block and no error', () => {
  const c = parse({ status: 'MANUAL' });
  assert.equal(c.repro, null);
  assert.equal(c.reproError, null);
});

test('a bad repro block is reported as reproError, not thrown', () => {
  const bad = (repro) => parse({ repro }).reproError;
  assert.match(bad('{not json'), /repro JSON is invalid/);
  assert.match(bad({ prompt: '', checks: { maxLines: 1 } }), /prompt/);
  assert.match(bad({ prompt: 'p' }), /at least one check/);
  assert.match(bad({ prompt: 'p', checks: { maxLine: 3 } }), /unknown check "maxLine"/);
  assert.match(bad({ prompt: 'p', checks: { unchanged: ['a.py'] } }), /does not create/);
  assert.match(bad({ prompt: 'p', checks: { mustMatch: ['('] } }), /regular expressions/);
  assert.match(bad({ prompt: 'p', checks: { maxLines: 0 } }), /maxLines/);
  assert.match(bad({ prompt: 'p', runs: 0, checks: { maxLines: 1 } }), /runs/);
  assert.match(bad({ prompt: 'p', checks: { noSubagents: false } }), /noSubagents must be true/);
  const noBody = complaintText({ repro: 'x' }).replace('```json repro\nx\n```', '```json repro\n```');
  assert.match(core.parseComplaint(noBody, '/r/C001-x.md').reproError, /empty or not closed/);
  assert.match(bad({ prompt: 'p', setup: { files: { '../x': 'a' } }, checks: { maxLines: 1 } }), /without "\.\."/);
  for (const name of ['.claude/settings.json', '.mcp.json', '.git/config', '/etc/x']) {
    assert.match(bad({ prompt: 'p', setup: { files: { [name]: 'a' } }, checks: { maxLines: 1 } }), /relative path/, name);
  }
  assert.match(bad({ prompt: '--add-dir /', checks: { maxLines: 1 } }), /must not start with "-"/);
});

test('loadComplaints sorts by file name and rejects duplicate ids', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'C002-b.md'), complaintText({ id: 'C002' }));
  fs.writeFileSync(path.join(dir, 'C001-a.md'), complaintText({ id: 'C001' }));
  fs.writeFileSync(path.join(dir, 'README.md'), 'not a complaint');
  assert.deepEqual(core.loadComplaints(dir).map((c) => c.id), ['C001', 'C002']);
  fs.writeFileSync(path.join(dir, 'C001-dup.md'), complaintText({ id: 'C001' }));
  assert.throws(() => core.loadComplaints(dir), /duplicate id C001/);
});

// ─── index and history ───────────────────────────────────────────────

test('renderIndex and replaceIndex keep the table between the markers', () => {
  const list = [parse({ history: ['- 2026-11-01 pass 1/1 claude 2.1.316'] })];
  const table = core.renderIndex(list);
  assert.match(table, /^\| id \| title \| status \| failure mode \| last check \|$/m);
  assert.match(table, /\| \[C001\]\(C001-x\.md\) \| A title: with a colon \| OPEN \| F1 \| 2026-11-01 1\/1 \|/);
  const readme = `intro\n${core.INDEX_START}\nold\n${core.INDEX_END}\nrest\n`;
  const next = core.replaceIndex(readme, list);
  assert.ok(next.startsWith('intro\n') && next.endsWith(`${core.INDEX_END}\nrest\n`));
  assert.ok(next.includes(table));
  assert.throws(() => core.replaceIndex('no markers', list), /needs/);
});

test('appendHistory adds one line to an empty, a filled and a middle section', () => {
  const line = core.historyLine('2026-11-01', 2, 3, '2.1.316');
  assert.equal(line, '- 2026-11-01 pass 2/3 claude 2.1.316');
  const empty = core.appendHistory(complaintText(), line);
  assert.match(empty, /## Check history\n\n- 2026-11-01 pass 2\/3 claude 2\.1\.316\n$/);
  const twice = core.appendHistory(empty, '- 2026-11-02 pass 3/3 claude 2.1.317');
  assert.match(twice, /claude 2\.1\.316\n- 2026-11-02 pass 3\/3 claude 2\.1\.317\n$/);
  const middle = core.appendHistory('## Check history\n\n## Later\n\ntext\n', line);
  assert.equal(middle, `## Check history\n\n${line}\n\n## Later\n\ntext\n`);
  assert.equal(core.parseComplaint(twice, '/r/C001-x.md').history.length, 2);
});

// ─── check types ─────────────────────────────────────────────────────

async function evalChecks(checks, over = {}) {
  const dir = tmp();
  const setupFiles = { 'm.py': 'x = 1\n' };
  fs.writeFileSync(path.join(dir, 'm.py'), over.fileContent === undefined ? setupFiles['m.py'] : over.fileContent);
  if (over.deleteFile) fs.rmSync(path.join(dir, 'm.py'));
  return core.evaluateChecks(checks, {
    dir, result: over.result || 'ok', sessionId: over.sessionId === undefined ? SESSION : over.sessionId, setupFiles,
    countSubagents: () => (over.subagents === undefined ? 0 : over.subagents),
  });
}

test('check unchanged: passes on equal bytes, fails on an edit or a deleted file', async () => {
  assert.deepEqual(await evalChecks({ unchanged: ['m.py'] }), []);
  assert.deepEqual(await evalChecks({ unchanged: ['m.py'] }, { fileContent: 'x = 2\n' }), ['unchanged: m.py was changed']);
  assert.deepEqual(await evalChecks({ unchanged: ['m.py'] }, { deleteFile: true }), ['unchanged: m.py is missing']);
});

test('check maxLines counts non-empty lines only', async () => {
  assert.deepEqual(await evalChecks({ maxLines: 2 }, { result: 'a\n\n  \nb\n' }), []);
  assert.deepEqual(await evalChecks({ maxLines: 2 }, { result: 'a\nb\nc' }), ['maxLines: 3 > 2']);
});

test('check noSubagents: 0 passes, more fails, a missing session or transcript fails', async () => {
  assert.deepEqual(await evalChecks({ noSubagents: true }), []);
  assert.deepEqual(await evalChecks({ noSubagents: true }, { subagents: 2 }), ['noSubagents: 2 subagent(s) started']);
  assert.deepEqual(await evalChecks({ noSubagents: true }, { subagents: null }), ['noSubagents: session transcript not found']);
  assert.deepEqual(await evalChecks({ noSubagents: true }, { sessionId: '' }), ['noSubagents: session transcript not found']);
});

test('check mustMatch and mustNotMatch are case-insensitive', async () => {
  assert.deepEqual(await evalChecks({ mustMatch: ['SHALL\\b', '\\?'] }, { result: 'Shall we?' }), []);
  assert.deepEqual(await evalChecks({ mustMatch: ['\\?'] }, { result: 'done.' }), ['mustMatch: /\\?/ not found']);
  assert.deepEqual(await evalChecks({ mustNotMatch: ['done'] }, { result: 'All DONE' }), ['mustNotMatch: /done/ found']);
  assert.deepEqual(await evalChecks({ mustNotMatch: ['done'] }, { result: 'wait' }), []);
});

// ─── runs ────────────────────────────────────────────────────────────

function deps(fake, extra = {}) {
  const root = tmp();
  const made = [];
  const runClaude = async (req) => {
    made.push(req.cwd);
    return fake(req);
  };
  return { runClaude, countSubagents: () => 0, tmpRoot: root, timeoutMs: 1000, made, root, ...extra };
}

test('checkComplaints: counts passing runs, uses a fresh temp dir per run and removes it', async () => {
  const c = parse({ repro: REPRO });
  const seen = [];
  const d = deps((req) => {
    seen.push(fs.readFileSync(path.join(req.cwd, 'm.py'), 'utf8'));
    return { ok: true, result: 'yes?', sessionId: SESSION };
  });
  const [r] = await core.checkComplaints([c], {}, d);
  assert.equal(r.total, 2);
  assert.equal(r.passed, 2);
  assert.deepEqual(r.failed, []);
  assert.deepEqual(seen, ['x = 1\n', 'x = 1\n']);
  assert.equal(new Set(d.made).size, 2);
  assert.ok(d.made.every((p) => p.startsWith(path.join(d.root, 'C001-')) && !fs.existsSync(p)));
});

test('checkComplaints: an edit by claude fails the run, --runs overrides the repro', async () => {
  const c = parse({ repro: REPRO });
  let n = 0;
  const d = deps((req) => {
    if (++n === 1) fs.writeFileSync(path.join(req.cwd, 'm.py'), 'x = 2\n');
    return { ok: true, result: 'yes?', sessionId: SESSION };
  });
  const [r] = await core.checkComplaints([c], { runs: 3 }, d);
  assert.equal(r.total, 3);
  assert.equal(r.passed, 2);
  assert.deepEqual(r.failed, ['unchanged: m.py was changed']);
  assert.equal(r.nowPasses, false);
});

test('checkComplaints: setup.git creates a git repo; a claude failure is a tool error', async () => {
  const c = parse({ repro: { prompt: 'p', runs: 1, setup: { git: true }, checks: { maxLines: 5 } } });
  let hasGit = false;
  const ok = deps((req) => {
    hasGit = fs.existsSync(path.join(req.cwd, '.git'));
    return { ok: true, result: 'fine', sessionId: SESSION };
  });
  assert.equal((await core.checkComplaints([c], {}, ok))[0].passed, 1);
  assert.ok(hasGit);
  const broken = deps(() => ({ ok: false, error: 'timeout after 300 s' }));
  const [r] = await core.checkComplaints([c], {}, broken);
  assert.equal(r.passed, 0);
  assert.equal(r.toolErrors, 1);
  assert.deepEqual(r.failed, ['claude failed: timeout after 300 s']);
});

test('checkComplaints: MANUAL, WONTFIX and no-repro items are skipped without calling claude', async () => {
  const list = [parse({ status: 'MANUAL' }), parse({ id: 'C002', status: 'WONTFIX', repro: REPRO }, 'C002-x.md'), parse({ id: 'C003' }, 'C003-x.md')];
  const d = deps(() => assert.fail('claude must not run'));
  const results = await core.checkComplaints(list, {}, d);
  assert.deepEqual(results.map((r) => r.skipped), ['manual', 'wontfix', 'no repro']);
  assert.equal(d.made.length, 0);
});

// ─── regression exit logic ───────────────────────────────────────────

async function exitFor(status, type, pass) {
  const id = type === 'request' ? 'R001' : 'C001';
  const c = parse({ id, type, status, repro: { prompt: 'p', runs: 2, checks: { mustMatch: ['ok'] } } }, `${id}-x.md`);
  const d = deps(() => ({ ok: true, result: pass ? 'ok' : 'no', sessionId: SESSION }));
  const results = await core.checkComplaints([c], {}, d);
  return { code: core.exitCode(results), r: results[0] };
}

test('exit code: a FIXED-VERIFIED or DONE-VERIFIED item that fails is a regression', async () => {
  assert.equal((await exitFor('FIXED-VERIFIED', 'complaint', false)).code, 1);
  assert.equal((await exitFor('DONE-VERIFIED', 'request', false)).code, 1);
  assert.equal((await exitFor('FIXED-VERIFIED', 'complaint', false)).r.regression, true);
});

test('exit code: passing verified items and failing OPEN items exit 0', async () => {
  assert.equal((await exitFor('FIXED-VERIFIED', 'complaint', true)).code, 0);
  assert.equal((await exitFor('OPEN', 'complaint', false)).code, 0);
  const open = await exitFor('OPEN', 'complaint', true);
  assert.equal(open.code, 0);
  assert.equal(open.r.nowPasses, true);
});

test('exit code 2 (no verdict): a closed item with a broken repro or a claude failure is not a regression', async () => {
  const broken = parse({ status: 'FIXED-VERIFIED', repro: { prompt: 'p', checks: {} } });
  const [r] = await core.checkComplaints([broken], {}, deps(() => assert.fail('claude must not run')));
  assert.equal(r.regression, false);
  assert.equal(r.unverified, true);
  assert.equal(core.exitCode([r]), 2);

  const closed = parse({ status: 'FIXED-VERIFIED', repro: { prompt: 'p', runs: 2, checks: { mustMatch: ['ok'] } } });
  const [down] = await core.checkComplaints([closed], {}, deps(() => ({ ok: false, error: 'claude: command not found' })));
  assert.equal(down.regression, false);
  assert.equal(core.exitCode([down]), 2);

  let n = 0;
  const [mixed] = await core.checkComplaints([closed], {}, deps(() => (++n === 1 ? { ok: false, error: 'timeout' } : { ok: true, result: 'no', sessionId: SESSION })));
  assert.equal(mixed.regression, true);
  assert.equal(core.exitCode([mixed]), 1);

  const [m] = await core.checkComplaints([parse({ status: 'MANUAL' })], {}, deps(() => assert.fail('no')));
  assert.equal(core.exitCode([m]), 0);
});

test('checkComplaints: a setup file that cannot be written is a tool error, not an abort', async () => {
  const c = parse({ repro: { prompt: 'p', setup: { files: { '.': 'x' } }, checks: { maxLines: 5 } } });
  const d = deps(() => assert.fail('claude must not run'));
  const [r] = await core.checkComplaints([c, parse({ id: 'C002', status: 'MANUAL' }, 'C002-x.md')], {}, d).then((rs) => rs);
  assert.equal(r.toolErrors, 1);
  assert.match(r.failed[0], /^setup failed:/);
  assert.ok(fs.readdirSync(d.root).length === 0, 'temp dir removed');
});

// ─── claude output, transcripts, the real runner's arguments ─────────

test('parseClaudeOutput reads result and session_id and reports errors', () => {
  const ok = core.parseClaudeOutput(JSON.stringify({ type: 'result', result: 'hi', session_id: SESSION, is_error: false }));
  assert.deepEqual(ok, { ok: true, result: 'hi', sessionId: SESSION });
  const stream = core.parseClaudeOutput(JSON.stringify([{ type: 'system' }, { type: 'result', result: 'last', session_id: 's' }]));
  assert.equal(stream.result, 'last');
  assert.equal(core.parseClaudeOutput('Not logged in', 1, 'boom').ok, false);
  assert.match(core.parseClaudeOutput('Not logged in', 1, 'boom').error, /not JSON.*boom/);
  assert.match(core.parseClaudeOutput(JSON.stringify({ result: 'x', is_error: true }), 1).error, /reported an error/);
  assert.match(core.parseClaudeOutput(JSON.stringify({ subtype: 'error_max_turns' })).error, /no result/);
});

test('countSubagents: counts subagents/*.jsonl; a session with no subagent dir is 0; unknown is null', () => {
  const projects = tmp();
  const withAgents = path.join(projects, 'proj-a', SESSION, 'subagents');
  fs.mkdirSync(withAgents, { recursive: true });
  for (const f of ['agent-1.jsonl', 'agent-2.jsonl', 'agent-1.meta.json']) fs.writeFileSync(path.join(withAgents, f), '{}');
  assert.equal(core.countSubagents(SESSION, projects), 2);

  const other = '11111111-2222-3333-4444-555555555555';
  fs.mkdirSync(path.join(projects, 'proj-b'), { recursive: true });
  fs.writeFileSync(path.join(projects, 'proj-b', `${other}.jsonl`), '{}');
  assert.equal(core.countSubagents(other, projects), 0);

  fs.mkdirSync(path.join(projects, 'proj-b', '99999999-2222-3333-4444-555555555555', 'tool-results'), { recursive: true });
  assert.equal(core.countSubagents('99999999-2222-3333-4444-555555555555', projects), 0);

  assert.equal(core.countSubagents('00000000-2222-3333-4444-555555555555', projects), null);
  assert.equal(core.countSubagents('../etc', projects), null);
  assert.equal(core.countSubagents(SESSION, path.join(projects, 'missing')), null);
});

test('makeRunClaude passes the prompt, json output, acceptEdits, the temp cwd and the 300 s timeout', () => {
  let call;
  const run = cmd.makeRunClaude((bin, args, opts) => {
    call = { bin, args, opts };
    return { status: 0, stdout: JSON.stringify({ result: 'hi', session_id: SESSION }), stderr: '' };
  });
  assert.deepEqual(run({ prompt: 'hello', cwd: '/tmp/x' }), { ok: true, result: 'hi', sessionId: SESSION });
  assert.equal(call.bin, 'claude');
  assert.deepEqual(call.args, ['-p', 'hello', '--output-format', 'json', '--permission-mode', 'acceptEdits']);
  assert.equal(call.opts.cwd, '/tmp/x');
  assert.equal(call.opts.timeout, 300000);

  const timedOut = cmd.makeRunClaude(() => ({ error: Object.assign(new Error('spawnSync claude ETIMEDOUT'), { code: 'ETIMEDOUT' }) }));
  assert.deepEqual(timedOut({ prompt: 'p', cwd: '/tmp/x' }), { ok: false, error: 'timeout after 300 s' });
  const missing = cmd.makeRunClaude(() => ({ error: new Error('spawnSync claude ENOENT') }));
  assert.match(missing({ prompt: 'p', cwd: '/tmp/x' }).error, /ENOENT/);
});

// ─── command layer ───────────────────────────────────────────────────

function registerDir() {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'README.md'), `# register\n\n${core.INDEX_START}\n${core.INDEX_END}\n`);
  fs.writeFileSync(path.join(dir, 'C001-open.md'), complaintText({ id: 'C001', repro: { prompt: 'p1', runs: 1, checks: { mustMatch: ['ok'] } } }));
  fs.writeFileSync(path.join(dir, 'C002-closed.md'), complaintText({ id: 'C002', status: 'FIXED-VERIFIED', repro: { prompt: 'p2', runs: 1, checks: { mustMatch: ['ok'] } } }));
  fs.writeFileSync(path.join(dir, 'C003-manual.md'), complaintText({ id: 'C003', status: 'MANUAL' }));
  fs.writeFileSync(path.join(dir, 'R001-ask.md'), complaintText({ id: 'R001', type: 'request' }));
  return dir;
}

async function run(argv, dir, fake) {
  const out = [];
  const err = [];
  const code = await cmd.main(argv, {
    dir, out: (l) => out.push(l), err: (l) => err.push(l),
    deps: {
      runClaude: async (req) => fake(req), countSubagents: () => 0, claudeVersion: () => '9.9.9', now: () => new Date(2026, 10, 1), tmpRoot: tmp(),
    },
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

test('complaints list shows a type column and --write updates the README index', async () => {
  const dir = registerDir();
  const r = await run(['list', '--write'], dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /id\s+type\s+title\s+status\s+failure\s+last check/);
  assert.match(r.out, /R001\s+request/);
  const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  assert.match(readme, /\[R001\]\(R001-ask\.md\)/);
});

test('complaints check: table, skips MANUAL, exit 1 on a regression, 0 when only OPEN fails', async () => {
  const dir = registerDir();
  const fail = await run(['check'], dir, () => ({ ok: true, result: 'nope', sessionId: SESSION }));
  assert.equal(fail.code, 1);
  assert.match(fail.out, /C001\s+OPEN\s+0\/1\s+mustMatch/);
  assert.match(fail.out, /C002\s+FIXED-VERIFIED \(REGRESSION\)\s+0\/1/);
  assert.match(fail.out, /C003\s+MANUAL \(skipped: manual\)/);
  assert.match(fail.out, /R001\s+OPEN \(skipped: no repro\)/);
  assert.match(fail.err, /REGRESSION: C002/);

  const openOnly = await run(['check', 'C001'], dir, () => ({ ok: true, result: 'nope', sessionId: SESSION }));
  assert.equal(openOnly.code, 0);
  assert.doesNotMatch(openOnly.out, /C002/);
});

test('complaints check --record appends to Check history and the index; a tool error is not recorded', async () => {
  const dir = registerDir();
  const good = await run(['check', 'C001', '--runs', '2', '--record'], dir, () => ({ ok: true, result: 'ok', sessionId: SESSION }));
  assert.equal(good.code, 0);
  assert.match(good.out, /C001\s+OPEN \(now passes\)\s+2\/2/);
  const file = fs.readFileSync(path.join(dir, 'C001-open.md'), 'utf8');
  assert.match(file, /## Check history\n\n- 2026-11-01 pass 2\/2 claude 9\.9\.9\n$/);
  assert.match(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), /\| \[C001\]\(C001-open\.md\) \| .* \| OPEN \| F1 \| 2026-11-01 2\/2 \|/);

  const down = await run(['check', 'C001', 'C002', '--record'], dir, () => ({ ok: false, error: 'timeout after 300 s' }));
  assert.equal(down.code, 2);
  assert.match(down.err, /C001: not recorded, the check could not run/);
  assert.match(down.out, /C002\s+FIXED-VERIFIED \(could not run\)/);
  assert.doesNotMatch(down.err, /REGRESSION/);
  assert.deepEqual(core.loadComplaints(dir).map((c) => c.history.length).slice(0, 2), [1, 0]);

  fs.writeFileSync(path.join(dir, 'C004-badrepro.md'), complaintText({ id: 'C004', repro: { prompt: 'p', checks: {} } }));
  const badRepro = await run(['check', 'C004', '--record'], dir, () => assert.fail('claude must not run'));
  assert.equal(badRepro.code, 2);
  assert.match(badRepro.err, /C004: not recorded/);
  assert.equal(core.loadComplaints(dir).find((c) => c.id === 'C004').history.length, 0);
});

test('complaints: unknown id, unknown option and unknown command are errors', async () => {
  const dir = registerDir();
  assert.equal((await run(['check', 'C999'], dir)).code, 2);
  const badOption = await run(['check', '--fast'], dir);
  assert.equal(badOption.code, 2);
  assert.match(badOption.err, /unknown option/);
  assert.equal((await run(['check', '--runs', '0'], dir)).code, 2);
  fs.writeFileSync(path.join(dir, 'C009-bad.md'), 'no frontmatter');
  const broken = await run(['list'], dir);
  assert.equal(broken.code, 2);
  assert.match(broken.err, /C009-bad\.md: frontmatter is missing/);
  const origWrite = process.stderr.write;
  process.stderr.write = () => true;
  try {
    assert.equal(await cmd.main(['nope'], { dir }), 2);
  } finally {
    process.stderr.write = origWrite;
  }
});

// ─── the real register ───────────────────────────────────────────────

test('the real register: items parse; each has a repro unless MANUAL or closed by a recorded manual check', () => {
  const list = core.loadComplaints(REAL_DIR);
  assert.deepEqual(list.slice(0, 5).map((c) => c.id), ['C001', 'C002', 'C003', 'C004', 'C005']);
  for (const c of list) {
    assert.equal(c.reproError, null, `${c.id}: ${c.reproError}`);
    assert.ok(c.frankSaid.startsWith('>'), `${c.id} needs Frank's exact words`);
    if (c.status === 'MANUAL') assert.equal(c.repro, null, `${c.id} is MANUAL and must have no repro`);
    else if (!c.repro) {
      // A closed item may have no repro only when Frank accepted a manual check (recorded in its Check history).
      const file = fs.readdirSync(REAL_DIR).find((f) => f.startsWith(`${c.id}-`));
      const text = fs.readFileSync(path.join(REAL_DIR, file), 'utf8');
      assert.ok(['FIXED-VERIFIED', 'DONE-VERIFIED', 'WONTFIX'].includes(c.status) && /manual check/i.test(text), `${c.id} needs a repro block or a recorded manual check`);
    }
  }
});

test('the real register: the README index matches the files', () => {
  const list = core.loadComplaints(REAL_DIR);
  const readme = fs.readFileSync(path.join(REAL_DIR, 'README.md'), 'utf8');
  assert.equal(readme, core.replaceIndex(readme, list), 'run: node myclaude.js complaints list --write');
});

test('repro.allowedTools is validated and passed to the claude run', async () => {
  const block = (r) => core.parseRepro('```json repro\n' + JSON.stringify(r) + '\n```');
  assert.match(block({ prompt: 'x', allowedTools: ['-p'] }).error || '', /allowedTools/);
  assert.match(block({ prompt: 'x', allowedTools: 'Bash' }).error || '', /allowedTools/);
  assert.equal(block({ prompt: 'x', allowedTools: ['Bash(node *)'], checks: { maxLines: 5 } }).error, null);
  const { makeRunClaude } = require('../lib/cmd-complaints');
  let seen;
  const run = makeRunClaude((cmd, args) => { seen = args; return { status: 0, stdout: JSON.stringify({ result: 'ok', session_id: 's' }), stderr: '' }; });
  run({ prompt: 'hi', cwd: '/tmp', allowedTools: ['Bash(node *)'] });
  assert.deepEqual(seen.slice(-2), ['--allowedTools', 'Bash(node *)']);
});
