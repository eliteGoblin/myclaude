'use strict';

// Pure core of `myclaude usage`: plan usage (status-line cache or `claude -p "/usage"`) and
// local token totals from transcripts. fs, clock and the claude runner are injected.

const nodefs = require('fs');
const path = require('path');

const CACHE_MAX_AGE_MS = 15 * 60 * 1000;
const DEFAULT_SINCE_MS = 24 * 3600 * 1000;
const USAGE_TIMEOUT_MS = 60000;

function parseSince(s) {
  const m = /^(\d+)([hd])$/.exec(String(s || '').trim());
  if (!m || Number(m[1]) < 1) throw new Error('--since needs <N>h or <N>d, for example 24h or 7d');
  return Number(m[1]) * (m[2] === 'h' ? 3600 : 86400) * 1000;
}

// ─── plan usage ──────────────────────────────────────────────────────

// Text of `/usage` -> { fiveHour, week, weekByModel }. Each window is { percent, resets } or null.
function parsePlanText(text) {
  const out = { fiveHour: null, week: null, weekByModel: [] };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    const m = /^Current (session|5[- ]?hour|five[- ]hour|week)\s*(?:\(([^)]*)\))?\s*:\s*(\d+(?:\.\d+)?)\s*%\s*used(?:\s*·\s*resets\s+(.+))?$/i.exec(line);
    if (!m) continue;
    const win = { percent: Number(m[3]), resets: m[4] ? m[4].trim() : null };
    if (m[1].toLowerCase() === 'week') {
      const scope = (m[2] || '').trim();
      if (!scope || /^all models$/i.test(scope)) out.week = out.week || win;
      else out.weekByModel.push({ model: scope, ...win });
    } else out.fiveHour = out.fiveHour || win;
  }
  return out;
}

function epochToIso(sec) {
  return typeof sec === 'number' && Number.isFinite(sec) ? new Date(sec * 1000).toISOString() : null;
}

// Cache written by custom/scripts/statusline-fsun.js -> plan object, or null when unusable.
function planFromCache(raw, nowMs) {
  let c;
  try { c = JSON.parse(raw); } catch { return null; }
  if (!c || typeof c.written_at !== 'number') return null;
  const age = nowMs - c.written_at;
  if (age < 0 || age > CACHE_MAX_AGE_MS) return null;
  const win = (w) => {
    if (!w || typeof w.used_percentage !== 'number') return null;
    if (typeof w.resets_at === 'number' && w.resets_at * 1000 <= nowMs) return null; // window already reset
    return { percent: w.used_percentage, resets: epochToIso(w.resets_at) };
  };
  const fiveHour = win(c.five_hour);
  const week = win(c.seven_day);
  if (!fiveHour && !week) return null;
  return { source: 'status-line cache', ageSeconds: Math.round(age / 1000), fiveHour, week, weekByModel: [] };
}

function getPlan({ fs = nodefs, now = () => Date.now(), runner, cachePath, timeoutMs = USAGE_TIMEOUT_MS }) {
  const nowMs = now();
  try {
    const p = planFromCache(fs.readFileSync(cachePath, 'utf8'), nowMs);
    if (p) return { available: true, ...p };
  } catch { /* no cache: use /usage */ }
  let r;
  try { r = runner('claude', ['-p', '/usage', '--output-format', 'json'], { timeoutMs }); } catch (e) { r = { error: e.message }; }
  if (!r || r.error || (r.status != null && r.status !== 0)) {
    return { available: false, reason: (r && r.error) || `claude exited with status ${r && r.status}` };
  }
  let text = '';
  try { text = String(JSON.parse(r.stdout).result || ''); } catch { return { available: false, reason: 'claude output was not JSON' }; }
  const p = parsePlanText(text);
  if (!p.fiveHour && !p.week) return { available: false, reason: '/usage text had no plan lines' };
  return { available: true, source: '/usage', ageSeconds: 0, ...p };
}

// ─── local usage from transcripts ────────────────────────────────────

function listTranscripts(projectsDir, fs) {
  const files = [];
  let dirs = [];
  try { dirs = fs.readdirSync(projectsDir); } catch { return files; }
  for (const d of dirs) {
    const dir = path.join(projectsDir, d);
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const nm of names) {
      if (nm.endsWith('.jsonl')) files.push({ file: path.join(dir, nm), session: nm.slice(0, -6), subagent: false });
      else {
        const sub = path.join(dir, nm, 'subagents');
        let subs = [];
        try { subs = fs.readdirSync(sub); } catch { continue; }
        for (const s of subs) {
          if (s.startsWith('agent-') && s.endsWith('.jsonl')) files.push({ file: path.join(sub, s), session: nm, subagent: true });
        }
      }
    }
  }
  return files;
}

function agentType(file, fs) {
  try { return JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8')).agentType || 'unknown'; } catch { return 'unknown'; }
}

const ZERO = () => ({ messages: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0 });
function add(t, e) {
  t.messages += 1; t.input += e.input; t.cacheWrite += e.cacheWrite; t.cacheRead += e.cacheRead; t.output += e.output;
}

// opts: { projectsDir, sinceMs (window length) | null, session | null, fs, now }
function scanLocal({ projectsDir, sinceMs, session = null, fs = nodefs, now = () => Date.now() }) {
  const cutoff = sinceMs == null ? null : now() - sinceMs;
  const files = listTranscripts(projectsDir, fs).filter((f) => !session || f.session === session);
  const seen = new Map(); // message.id -> entry (the copy with the most output tokens)
  let scanned = 0;
  for (const f of files) {
    if (cutoff != null) {
      try { if (fs.statSync(f.file).mtimeMs < cutoff) continue; } catch { continue; }
    }
    let text;
    try { text = fs.readFileSync(f.file, 'utf8'); } catch { continue; }
    scanned += 1;
    const type = f.subagent ? agentType(f.file, fs) : null;
    for (const line of text.split('\n')) {
      if (!line.includes('"usage"')) continue;
      let j;
      try { j = JSON.parse(line); } catch { continue; }
      const m = j && j.type === 'assistant' && j.message;
      if (!m || !m.id || !m.usage || !m.model || m.model === '<synthetic>') continue;
      if (cutoff != null) {
        const ts = Date.parse(j.timestamp);
        if (!Number.isFinite(ts) || ts < cutoff) continue;
      }
      const u = m.usage;
      const e = {
        model: m.model, role: f.subagent ? 'subagent' : 'main', agentType: type, session: f.session,
        input: u.input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0,
        cacheRead: u.cache_read_input_tokens || 0, output: u.output_tokens || 0,
      };
      const prev = seen.get(m.id);
      if (!prev || e.output > prev.output) seen.set(m.id, e);
    }
  }
  const rowMap = new Map();
  const totals = ZERO();
  for (const e of seen.values()) {
    const key = [e.model, e.role, e.agentType || ''].join('\u0000');
    if (!rowMap.has(key)) rowMap.set(key, { model: e.model, role: e.role, agentType: e.agentType, ...ZERO() });
    add(rowMap.get(key), e);
    add(totals, e);
  }
  const rows = [...rowMap.values()].sort((a, b) => b.output - a.output || a.model.localeCompare(b.model));
  return { files: scanned, totals, rows };
}

// ─── report ──────────────────────────────────────────────────────────

function buildReport({ plan, local, sinceMs, session, now }) {
  const win = (w) => (w ? { percent: w.percent, resets: w.resets } : null);
  return {
    generated_at: new Date(now).toISOString(),
    plan: plan.available
      ? {
        available: true, source: plan.source, age_seconds: plan.ageSeconds,
        five_hour: win(plan.fiveHour), week: win(plan.week),
        week_by_model: plan.weekByModel.map((w) => ({ model: w.model, percent: w.percent, resets: w.resets })),
      }
      : { available: false, source: null, age_seconds: null, five_hour: null, week: null, week_by_model: [], reason: plan.reason },
    local: {
      window: { since: sinceMs == null ? null : new Date(now - sinceMs).toISOString(), session: session || null },
      output_tokens_note: 'output tokens are approximate: per-step values in transcripts can be placeholders',
      transcripts_scanned: local.files,
      totals: local.totals,
      rows: local.rows,
    },
  };
}

module.exports = {
  CACHE_MAX_AGE_MS, DEFAULT_SINCE_MS, USAGE_TIMEOUT_MS,
  parseSince, parsePlanText, planFromCache, getPlan, scanLocal, buildReport,
};
