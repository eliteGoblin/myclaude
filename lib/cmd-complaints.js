'use strict';

// `myclaude complaints <list|check>` — command layer over lib/complaints.js.
// The register lives in requirements/complaints/ (owned by the ba-curator agent).

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const core = require('./complaints');

const COMPLAINTS_DIR = path.join(__dirname, '..', 'requirements', 'complaints');
const CLAUDE_TIMEOUT_MS = 300000;

const HELP = `myclaude complaints — Frank's complaints and requests as repeatable checks (requirements/complaints/)

  list [--write]                         the register: id, type, title, status, failure mode, last check;
                                         --write also rewrites the index table in requirements/complaints/README.md
  check [id...] [--runs N] [--record]    run each repro with the real claude (costs tokens), one fresh temp dir per run;
                                         --runs N overrides the repro's runs; --record appends to Check history + the index

check runs claude -p with the installed ~/.claude config, so sync a fix before checking it.
Exit code 1: a FIXED-VERIFIED or DONE-VERIFIED item fails again (regression); OPEN failures are expected.
Exit code 2: an error, or a check that could not run (claude failed, broken repro): no verdict.
`;

// The real claude call: edits inside the temp dir are allowed (acceptEdits), so an unchanged file proves restraint.
function makeRunClaude(spawn = cp.spawnSync) {
  return function runClaude({ prompt, cwd, timeoutMs = CLAUDE_TIMEOUT_MS, allowedTools = [] }) {
    const args = ['-p', prompt, '--output-format', 'json', '--permission-mode', 'acceptEdits'];
    // A repro that needs a command (not only edits) names it, e.g. "Bash(node *)"; headless runs deny the rest.
    if (allowedTools.length) args.push('--allowedTools', ...allowedTools);
    const r = spawn('claude', args, {
      cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.error) return { ok: false, error: r.error.code === 'ETIMEDOUT' ? `timeout after ${timeoutMs / 1000} s` : r.error.message };
    return core.parseClaudeOutput(r.stdout, r.status, r.stderr);
  };
}

function claudeVersion(spawn = cp.spawnSync) {
  const r = spawn('claude', ['--version'], { encoding: 'utf8', timeout: 30000 });
  const m = /^(\S+)/.exec(String(r.stdout || '').trim());
  return m ? m[1] : 'unknown';
}

function projectsDir(env = process.env) {
  return path.join(env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');
}

function defaultDeps() {
  return {
    runClaude: makeRunClaude(),
    countSubagents: (sessionId) => core.countSubagents(sessionId, projectsDir()),
    claudeVersion,
    timeoutMs: CLAUDE_TIMEOUT_MS,
    now: () => new Date(),
  };
}

function parseArgs(args) {
  const o = { ids: [], runs: null, record: false, write: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--record') o.record = true;
    else if (a === '--write') o.write = true;
    else if (a === '--runs') {
      const n = Number(args[++i]);
      if (!Number.isInteger(n) || n < 1) throw new Error('--runs needs a positive integer');
      o.runs = n;
    } else if (a.startsWith('--')) throw new Error(`unknown option: ${a}`);
    else o.ids.push(a.toUpperCase());
  }
  return o;
}

function writeIndex(dir, list) {
  const readme = path.join(dir, 'README.md');
  fs.writeFileSync(readme, core.replaceIndex(fs.readFileSync(readme, 'utf8'), list));
}

function cmdList(dir, opts, out) {
  const list = core.loadComplaints(dir);
  const rows = list.map((c) => [c.id, c.type, c.title, c.status, c.failure, core.lastCheckText(c)]);
  for (const line of core.formatTable(['id', 'type', 'title', 'status', 'failure', 'last check'], rows)) out(line);
  if (opts.write) {
    writeIndex(dir, list);
    out('index updated in README.md');
  }
  return 0;
}

function statusCell(r) {
  if (r.skipped) return `${r.status} (skipped: ${r.skipped})`;
  if (r.regression) return `${r.status} (REGRESSION)`;
  if (r.unverified) return `${r.status} (could not run)`;
  if (r.nowPasses) return `${r.status} (now passes)`;
  return r.status;
}

async function cmdCheck(dir, opts, out, err, deps) {
  const all = core.loadComplaints(dir);
  const unknown = opts.ids.filter((id) => !all.some((c) => c.id === id));
  if (unknown.length) {
    err(`unknown id: ${unknown.join(', ')}`);
    return 2;
  }
  const selected = opts.ids.length ? all.filter((c) => opts.ids.includes(c.id)) : all;
  const results = await core.checkComplaints(selected, { runs: opts.runs }, {
    ...deps,
    progress: (p) => err(`${p.id} run ${p.run}/${p.runs}: ${p.pass ? 'pass' : 'fail'}`),
  });
  const rows = results.map((r) => [r.id, statusCell(r), r.skipped ? '-' : `${r.passed}/${r.total}`, r.failed.join('; ') || '-']);
  for (const line of core.formatTable(['id', 'status', 'pass', 'failed checks'], rows)) out(line);

  if (opts.record) {
    const version = deps.claudeVersion();
    const date = core.formatDate(deps.now());
    for (const r of results) {
      if (r.skipped) continue;
      if (r.unverified) {
        err(`${r.id}: not recorded, the check could not run (${r.failed[0]})`);
        continue;
      }
      const c = selected.find((x) => x.id === r.id);
      fs.writeFileSync(c.file, core.appendHistory(fs.readFileSync(c.file, 'utf8'), core.historyLine(date, r.passed, r.total, version)));
    }
    writeIndex(dir, core.loadComplaints(dir));
    out('recorded in Check history; index updated');
  }
  const regressions = results.filter((r) => r.regression).map((r) => r.id);
  if (regressions.length) err(`REGRESSION: ${regressions.join(', ')} passed before and fails now`);
  const unverified = results.filter((r) => r.unverified).map((r) => r.id);
  if (unverified.length) err(`no verdict for ${unverified.join(', ')}: the check could not run`);
  return core.exitCode(results);
}

// opts.dir and opts.deps let tests point at a temp register and a fake claude.
async function main(argv, opts = {}) {
  const [sub, ...rest] = argv;
  if (!sub || sub === 'help' || sub === '--help') {
    process.stdout.write(HELP);
    return 0;
  }
  const out = opts.out || ((line) => process.stdout.write(`${line}\n`));
  const err = opts.err || ((line) => process.stderr.write(`[complaints] ${line}\n`));
  const dir = opts.dir || COMPLAINTS_DIR;
  try {
    if (sub === 'list') return cmdList(dir, parseArgs(rest), out);
    if (sub === 'check') return await cmdCheck(dir, parseArgs(rest), out, err, { ...defaultDeps(), ...opts.deps });
  } catch (e) {
    err(`error: ${e.message}`);
    return 2;
  }
  process.stderr.write(`unknown complaints command: ${sub}\n\n${HELP}`);
  return 2;
}

module.exports = { main, makeRunClaude, claudeVersion, projectsDir, HELP };
