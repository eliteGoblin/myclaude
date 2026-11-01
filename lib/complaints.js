'use strict';

// Complaint register: parse complaints/*.md, run each repro in a fresh temp dir, evaluate the checks,
// keep the README index and the per-file check history. `claude` is injected (see cmd-complaints.js).

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const TYPES = ['complaint', 'request'];
const STATUSES = {
  complaint: ['OPEN', 'FIXED-VERIFIED', 'MANUAL', 'WONTFIX'],
  request: ['OPEN', 'DONE-VERIFIED', 'MANUAL', 'WONTFIX'],
};
const VERIFIED = new Set(['FIXED-VERIFIED', 'DONE-VERIFIED']);
const ID_PREFIX = { complaint: 'C', request: 'R' };
const CHECK_KEYS = ['unchanged', 'maxLines', 'noSubagents', 'mustMatch', 'mustNotMatch'];
const INDEX_START = '<!-- index:start -->';
const INDEX_END = '<!-- index:end -->';
const INDEX_HEADER = '| id | title | status | failure mode | last check |';
const HISTORY_LINE = /^- (\d{4}-\d{2}-\d{2}) pass (\d+)\/(\d+) claude (\S+)\s*$/;
const FILE_NAME = /^[CR]\d{3}-.+\.md$/;
const FAILURE = /^(F[1-6]|W)(,\s*(F[1-6]|W))*$/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ─── parsing ─────────────────────────────────────────────────────────

function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'));
  if (!m) throw new Error('frontmatter is missing');
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return { meta, body: m[2] };
}

// `## Heading` -> text below it. Headings inside fenced blocks are text.
function sections(body) {
  const out = {};
  let name = null;
  let fenced = false;
  for (const line of body.split('\n')) {
    if (/^```/.test(line)) fenced = !fenced;
    const h = !fenced && /^## (.+?)\s*$/.exec(line);
    if (h) {
      name = h[1];
      out[name] = [];
    } else if (name) {
      out[name].push(line);
    }
  }
  for (const k of Object.keys(out)) out[k] = out[k].join('\n').trim();
  return out;
}

// Config that claude loads from its cwd (hooks, MCP servers) must never come from a repro file.
const TOOL_CONFIG = new Set(['.claude', '.git', '.mcp.json']);
const safeRelative = (p) => {
  if (typeof p !== 'string' || p === '' || path.isAbsolute(p)) return false;
  const parts = p.split(/[\\/]/);
  return !parts.includes('..') && !TOOL_CONFIG.has(parts[0]);
};

function validRegex(p) {
  try {
    new RegExp(p, 'i');
    return true;
  } catch {
    return false;
  }
}

function validateChecks(checks, files) {
  if (!isObject(checks) || Object.keys(checks).length === 0) return 'repro.checks must name at least one check';
  for (const [key, value] of Object.entries(checks)) {
    if (!CHECK_KEYS.includes(key)) return `unknown check "${key}" (known: ${CHECK_KEYS.join(', ')})`;
    if (key === 'unchanged') {
      if (!Array.isArray(value) || value.length === 0 || !value.every((f) => typeof f === 'string')) return 'unchanged must be a list of file names';
      const missing = value.find((f) => !Object.prototype.hasOwnProperty.call(files, f));
      if (missing) return `unchanged names "${missing}", which setup.files does not create`;
    } else if (key === 'maxLines') {
      if (!Number.isInteger(value) || value < 1) return 'maxLines must be a positive integer';
    } else if (key === 'noSubagents') {
      if (value !== true) return 'noSubagents must be true (leave the key out to skip the check)';
    } else if (!Array.isArray(value) || value.length === 0 || !value.every((p) => typeof p === 'string' && validRegex(p))) {
      return `${key} must be a list of valid regular expressions`;
    }
  }
  return null;
}

function validateRepro(r) {
  if (!isObject(r)) return 'repro must be a JSON object';
  if (typeof r.prompt !== 'string' || !r.prompt.trim()) return 'repro.prompt must be a non-empty string';
  if (r.prompt.trimStart().startsWith('-')) return 'repro.prompt must not start with "-" (claude would read it as an option)';
  if (r.runs !== undefined && !(Number.isInteger(r.runs) && r.runs > 0)) return 'repro.runs must be a positive integer';
  if (r.setup !== undefined && !isObject(r.setup)) return 'repro.setup must be an object';
  const setup = r.setup || {};
  if (setup.git !== undefined && typeof setup.git !== 'boolean') return 'setup.git must be true or false';
  if (setup.files !== undefined && !isObject(setup.files)) return 'setup.files must be an object of file name to content';
  for (const [name, content] of Object.entries(setup.files || {})) {
    if (!safeRelative(name)) return `setup file name "${name}" must be a relative path without ".." and not under ${[...TOOL_CONFIG].join(', ')}`;
    if (typeof content !== 'string') return `setup file "${name}" must be a string`;
  }
  return validateChecks(r.checks, setup.files || {});
}

// The fenced block with info string `json repro` -> { repro, error }. No block: both null.
function parseRepro(section) {
  const m = /^```json repro[ \t]*\n([\s\S]*?)\n^```[ \t]*$/m.exec(section || '');
  if (!m) {
    return /^```json repro/m.test(section || '') ? { repro: null, error: 'the json repro block is empty or not closed' } : { repro: null, error: null };
  }
  let r;
  try {
    r = JSON.parse(m[1]);
  } catch (e) {
    return { repro: null, error: `repro JSON is invalid: ${e.message}` };
  }
  const error = validateRepro(r);
  if (error) return { repro: null, error };
  const setup = r.setup || {};
  return { repro: { prompt: r.prompt, runs: r.runs || 1, setup: { files: setup.files || {}, git: Boolean(setup.git) }, checks: r.checks }, error: null };
}

function parseHistory(section) {
  return (section || '').split('\n').map((l) => HISTORY_LINE.exec(l)).filter(Boolean)
    .map((m) => ({ date: m[1], passed: Number(m[2]), total: Number(m[3]), version: m[4] }));
}

function parseComplaint(text, file) {
  const where = path.basename(file);
  const fail = (msg) => {
    throw new Error(`${where}: ${msg}`);
  };
  let fm;
  try {
    fm = parseFrontmatter(text);
  } catch (e) {
    return fail(e.message);
  }
  const { meta, body } = fm;
  const type = meta.type || 'complaint';
  if (!TYPES.includes(type)) fail(`type "${type}" must be ${TYPES.join(' or ')}`);
  if (!new RegExp(`^${ID_PREFIX[type]}\\d{3}$`).test(meta.id || '')) fail(`id "${meta.id}" must look like ${ID_PREFIX[type]}001 for a ${type}`);
  if (!where.startsWith(`${meta.id}-`)) fail(`file name must start with "${meta.id}-"`);
  if (!meta.title) fail('title is missing');
  if (!STATUSES[type].includes(meta.status)) fail(`status "${meta.status}" is not valid for a ${type} (${STATUSES[type].join(' | ')})`);
  if (!FAILURE.test(meta.failure || '')) fail(`failure "${meta.failure}" must be F1-F6 or W (docs/INVENTORY.md), comma-separated if several`);
  const sec = sections(body);
  const { repro, error } = parseRepro(sec.Repro);
  return {
    file,
    id: meta.id,
    type,
    title: meta.title,
    date: meta.date || '',
    status: meta.status,
    failure: meta.failure,
    frankSaid: sec['Frank said'] || '',
    claudeReplied: sec['Claude replied'] || '',
    expected: sec.Expected || '',
    repro,
    reproError: error,
    history: parseHistory(sec['Check history']),
  };
}

function loadComplaints(dir) {
  if (!fs.existsSync(dir)) throw new Error(`complaints folder not found: ${dir}`);
  const list = fs.readdirSync(dir).filter((f) => FILE_NAME.test(f)).sort()
    .map((f) => parseComplaint(fs.readFileSync(path.join(dir, f), 'utf8'), path.join(dir, f)));
  const seen = new Set();
  for (const c of list) {
    if (seen.has(c.id)) throw new Error(`duplicate id ${c.id}`);
    seen.add(c.id);
  }
  return list;
}

// ─── index and history ───────────────────────────────────────────────

function lastCheckText(c) {
  const last = c.history[c.history.length - 1];
  return last ? `${last.date} ${last.passed}/${last.total}` : '-';
}

function renderIndex(list) {
  const cell = (s) => String(s).replace(/\|/g, '\\|');
  const rows = list.map((c) => `| [${c.id}](${path.basename(c.file)}) | ${cell(c.title)} | ${c.status} | ${c.failure} | ${lastCheckText(c)} |`);
  return [INDEX_HEADER, '|---|---|---|---|---|', ...rows].join('\n');
}

function replaceIndex(readme, list) {
  const a = readme.indexOf(INDEX_START);
  const b = readme.indexOf(INDEX_END);
  if (a < 0 || b < a) throw new Error(`README.md needs ${INDEX_START} and ${INDEX_END} around the index table`);
  return `${readme.slice(0, a + INDEX_START.length)}\n${renderIndex(list)}\n${readme.slice(b)}`;
}

function historyLine(date, passed, total, version) {
  return `- ${date} pass ${passed}/${total} claude ${version}`;
}

function appendHistory(text, line) {
  const lines = text.replace(/\n+$/, '').split('\n');
  const at = lines.findIndex((l) => l.trim() === '## Check history');
  if (at < 0) return `${lines.join('\n')}\n\n## Check history\n\n${line}\n`;
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  let ins = end;
  while (ins > at + 1 && lines[ins - 1].trim() === '') ins--;
  const tail = lines.slice(ins);
  const merged = [...lines.slice(0, ins), ...(ins === at + 1 ? [''] : []), line, ...(tail.length && tail[0].trim() !== '' ? [''] : []), ...tail];
  return `${merged.join('\n')}\n`;
}

function formatDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formatTable(headers, rows) {
  const width = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (r) => r.map((c, i) => String(c).padEnd(width[i])).join('  ').trimEnd();
  return [line(headers), line(width.map((w) => '-'.repeat(w))), ...rows.map(line)];
}

// ─── claude output and transcripts ───────────────────────────────────

// `claude -p --output-format json` stdout -> { ok, result, sessionId } or { ok: false, error }.
function parseClaudeOutput(stdout, status = 0, stderr = '') {
  const text = String(stdout || '').trim();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return { ok: false, error: `claude output is not JSON (exit ${status}): ${String(stderr || text).trim().slice(0, 200)}` };
  }
  if (Array.isArray(j)) j = [...j].reverse().find((e) => e && e.type === 'result');
  if (!isObject(j) || typeof j.result !== 'string') return { ok: false, error: `claude output has no result field (exit ${status})` };
  if (j.is_error || status !== 0) return { ok: false, error: `claude reported an error (exit ${status}): ${j.result.slice(0, 200)}` };
  return { ok: true, result: j.result, sessionId: j.session_id };
}

// Subagent transcripts of a session: <projects>/<project>/<session id>/subagents/*.jsonl.
// null = the session is not on disk at all (a failed lookup, not "zero subagents").
function countSubagents(sessionId, projectsDir) {
  if (!/^[0-9a-zA-Z-]{8,}$/.test(String(sessionId || ''))) return null;
  let projects;
  try {
    projects = fs.readdirSync(projectsDir);
  } catch {
    return null;
  }
  const isDir = (p) => fs.existsSync(p) && fs.statSync(p).isDirectory();
  for (const project of projects) {
    const sessionDir = path.join(projectsDir, project, sessionId);
    if (isDir(sessionDir)) {
      const sub = path.join(sessionDir, 'subagents');
      return isDir(sub) ? fs.readdirSync(sub).filter((f) => f.endsWith('.jsonl')).length : 0;
    }
    if (fs.existsSync(path.join(projectsDir, project, `${sessionId}.jsonl`))) return 0;
  }
  return null;
}

// ─── checks ──────────────────────────────────────────────────────────

// Returns the list of failed checks (empty = pass).
async function evaluateChecks(checks, { dir, result, sessionId, setupFiles, countSubagents: count }) {
  const failed = [];
  for (const f of checks.unchanged || []) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) failed.push(`unchanged: ${f} is missing`);
    else if (!fs.readFileSync(p).equals(Buffer.from(setupFiles[f]))) failed.push(`unchanged: ${f} was changed`);
  }
  if (checks.maxLines !== undefined) {
    const n = result.split('\n').filter((l) => l.trim() !== '').length;
    if (n > checks.maxLines) failed.push(`maxLines: ${n} > ${checks.maxLines}`);
  }
  if (checks.noSubagents) {
    const n = sessionId ? await count(sessionId) : null;
    if (n === null) failed.push('noSubagents: session transcript not found');
    else if (n > 0) failed.push(`noSubagents: ${n} subagent(s) started`);
  }
  for (const p of checks.mustMatch || []) {
    if (!new RegExp(p, 'i').test(result)) failed.push(`mustMatch: /${p}/ not found`);
  }
  for (const p of checks.mustNotMatch || []) {
    if (new RegExp(p, 'i').test(result)) failed.push(`mustNotMatch: /${p}/ found`);
  }
  return failed;
}

function writeSetup(dir, setup) {
  for (const [name, content] of Object.entries(setup.files)) {
    const p = path.join(dir, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  if (setup.git) cp.execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
}

// One run in a fresh temp dir. The dir is removed afterwards.
async function runOnce(c, run, deps) {
  const root = deps.tmpRoot || path.join(os.tmpdir(), 'myclaude-complaints');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, `${c.id}-${run}-`));
  try {
    try {
      writeSetup(dir, c.repro.setup);
    } catch (e) {
      return { pass: false, toolError: true, failed: [`setup failed: ${e.message}`] };
    }
    const r = await deps.runClaude({ prompt: c.repro.prompt, cwd: dir, timeoutMs: deps.timeoutMs });
    if (!r.ok) return { pass: false, toolError: true, failed: [`claude failed: ${r.error}`] };
    const failed = await evaluateChecks(c.repro.checks, {
      dir, result: r.result, sessionId: r.sessionId, setupFiles: c.repro.setup.files, countSubagents: deps.countSubagents,
    });
    return { pass: failed.length === 0, toolError: false, failed };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function summarize(failures) {
  const counts = new Map();
  for (const f of failures) counts.set(f, (counts.get(f) || 0) + 1);
  return [...counts].map(([f, n]) => (n > 1 ? `${f} (x${n})` : f));
}

// Runs every complaint that has a repro; MANUAL, WONTFIX and items without a repro are skipped.
async function checkComplaints(list, { runs } = {}, deps = {}) {
  const results = [];
  for (const c of list) {
    const base = { id: c.id, type: c.type, status: c.status, skipped: null, passed: 0, total: 0, failed: [], toolErrors: 0, unverified: false, regression: false, nowPasses: false };
    const skip = c.status === 'MANUAL' ? 'manual' : c.status === 'WONTFIX' ? 'wontfix' : !c.repro && !c.reproError ? 'no repro' : null;
    if (skip) {
      results.push({ ...base, skipped: skip });
      continue;
    }
    const total = runs || (c.repro && c.repro.runs) || 1;
    const r = { ...base, total };
    if (c.reproError) {
      r.failed = [c.reproError];
    } else {
      const failures = [];
      for (let run = 1; run <= total; run++) {
        const one = await runOnce(c, run, deps);
        if (one.pass) r.passed++;
        if (one.toolError) r.toolErrors++;
        failures.push(...one.failed);
        if (deps.progress) deps.progress({ id: c.id, run, runs: total, pass: one.pass });
      }
      r.failed = summarize(failures);
    }
    // A tool error or a broken repro is not a verdict: it cannot show a regression.
    r.unverified = Boolean(c.reproError) || r.toolErrors > 0;
    r.regression = VERIFIED.has(c.status) && r.passed + r.toolErrors < r.total && !c.reproError;
    r.nowPasses = c.status === 'OPEN' && r.total > 0 && r.passed === r.total;
    results.push(r);
  }
  return results;
}

// 1 = a closed complaint fails again (regression); OPEN failures are expected.
// 2 = a check could not run (claude failed, broken repro), so there is no verdict.
function exitCode(results) {
  if (results.some((r) => r.regression)) return 1;
  return results.some((r) => r.unverified) ? 2 : 0;
}

module.exports = {
  TYPES, STATUSES, VERIFIED, CHECK_KEYS, INDEX_START, INDEX_END,
  parseFrontmatter, parseComplaint, loadComplaints, parseRepro,
  lastCheckText, renderIndex, replaceIndex, historyLine, appendHistory, formatDate, formatTable,
  parseClaudeOutput, countSubagents, evaluateChecks, checkComplaints, exitCode,
};
