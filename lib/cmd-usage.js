'use strict';

// `myclaude usage [--json] [--since 24h|7d|<N>h|<N>d] [--session <id>]` — command layer over lib/usage.js.

const os = require('os');
const path = require('path');
const cp = require('child_process');
const core = require('./usage');
const { formatTable } = require('./complaints');

const HELP = `myclaude usage — plan usage and local token totals (another Claude session can read --json)

  usage [--json] [--since 24h|7d|<N>h|<N>d] [--session <id>]

  Plan: the status-line cache (~/.myclaude/usage-cache.json, younger than 15 min), else \`claude -p "/usage"\` (costs $0).
  Local: tokens per model, main vs subagent (and subagent type), from ~/.claude/projects transcripts, deduped by message id.
  --since   window for the local section (default 24h)
  --session totals for one session including its subagents (no time window unless --since is also given)
  Output tokens are approximate. Plan usage that cannot be read prints "plan usage: not available"; the command still succeeds.
`;

function parseArgs(args) {
  const o = { json: false, since: null, session: null, help: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') o.json = true;
    else if (a === '--help' || a === 'help') o.help = true;
    else if (a === '--since') {
      if (!args[i + 1]) throw new Error('--since needs a value');
      o.since = args[++i];
    } else if (a === '--session') {
      if (!args[i + 1]) throw new Error('--session needs a session id');
      o.session = args[++i];
    } else throw new Error(`unknown option: ${a}`);
  }
  return o;
}

function makeRunner(spawn = cp.spawnSync) {
  return (cmd, args, { timeoutMs }) => {
    const r = spawn(cmd, args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.error) return { error: r.error.code === 'ETIMEDOUT' ? `timeout after ${timeoutMs / 1000} s` : r.error.message };
    return { status: r.status, stdout: r.stdout };
  };
}

const n = (x) => x.toLocaleString('en-US');

function windowText(label, w) {
  return w ? `  ${label}: ${w.percent}% used${w.resets ? `, resets ${w.resets}` : ''}` : `  ${label}: not reported`;
}

function renderText(rep, windowLabel) {
  const lines = [];
  const p = rep.plan;
  if (p.available) {
    lines.push(`Plan usage (source: ${p.source}, age ${p.age_seconds} s)`);
    lines.push(windowText('5-hour', p.five_hour), windowText('week (all models)', p.week));
    for (const w of p.week_by_model) lines.push(windowText(`week (${w.model})`, w));
  } else lines.push(`plan usage: not available (${p.reason})`);
  lines.push('', `Local usage, ${windowLabel} (${rep.local.transcripts_scanned} transcripts; output tokens approximate)`);
  const t = rep.local.totals;
  if (!t.messages) lines.push('  no assistant messages found');
  else {
    const rows = rep.local.rows.map((r) => [
      r.model, r.role === 'main' ? 'main' : `subagent:${r.agentType}`, n(r.messages), n(r.input), n(r.cacheWrite), n(r.cacheRead), n(r.output),
    ]);
    rows.push(['total', '', n(t.messages), n(t.input), n(t.cacheWrite), n(t.cacheRead), n(t.output)]);
    lines.push(...formatTable(['model', 'role', 'msgs', 'input', 'cache write', 'cache read', 'output~'], rows));
  }
  return lines;
}

function run(args, deps) {
  const o = parseArgs(args);
  if (o.help) { deps.out(HELP.trimEnd()); return 0; }
  const sinceMs = o.since ? core.parseSince(o.since) : (o.session ? null : core.DEFAULT_SINCE_MS);
  const nowMs = deps.now();
  const plan = core.getPlan({ fs: deps.fs, now: deps.now, runner: deps.runner, cachePath: deps.cachePath });
  const local = core.scanLocal({ projectsDir: deps.projectsDir, sinceMs, session: o.session, fs: deps.fs, now: deps.now });
  const rep = core.buildReport({ plan, local, sinceMs, session: o.session, now: nowMs });
  if (o.json) deps.out(JSON.stringify(rep, null, 2));
  else {
    const label = (o.session ? `session ${o.session}` : 'all sessions') + (sinceMs == null ? ', no time limit' : `, since ${o.since || '24h'}`);
    for (const l of renderText(rep, label)) deps.out(l);
  }
  return 0;
}

function main(argv, deps = {}) {
  const home = os.homedir();
  const full = {
    fs: require('fs'),
    now: () => Date.now(),
    runner: makeRunner(),
    cachePath: process.env.MYCLAUDE_USAGE_CACHE || path.join(home, '.myclaude', 'usage-cache.json'),
    projectsDir: path.join(process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'projects'),
    out: (line) => process.stdout.write(`${line}\n`),
    ...deps,
  };
  try {
    return run(argv, full);
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    return 2;
  }
}

module.exports = { main, run, parseArgs, HELP };
