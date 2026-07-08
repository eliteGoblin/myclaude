/**
 * session-registry-fsun.js — Frank's alias-first session registry
 *
 * The registry is the source of truth for alias <-> session membership:
 *   - one alias = one project/topic; an alias OWNS many sessions (N:1)
 *   - each session file belongs to exactly one alias (or is unassigned)
 *   - an alias records its worktree; new sessions in that folder are
 *     auto-assigned to it. A folder with two aliases stays manual: the
 *     session is reported as unassigned with both candidates listed.
 *
 * Registry file: ~/.claude/session-registry.json
 *   { "version": 1,
 *     "aliases":  { "<name>": { "worktree": "...", "note": "", "createdAt": "ISO" } },
 *     "sessions": { "<session-filename>": "<alias-name>" } }
 *
 * Lives in fsun_config/custom/scripts/lib/. Depends one-way on
 * session-manager-fsun.js (which wraps upstream). Upstream untouched.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const fsun = require('./session-manager-fsun');
const sm = fsun.upstream.sm;

const REGISTRY_PATH = path.join(os.homedir(), '.claude', 'session-registry.json');
const ALIAS_NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SCAN_LIMIT = 1000;

// ─── registry I/O ──────────────────────────────────────────────────────

function emptyRegistry() {
  return { version: 1, aliases: {}, sessions: {} };
}

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return emptyRegistry();
  try {
    const reg = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    if (!reg || typeof reg !== 'object') return emptyRegistry();
    return {
      version: 1,
      aliases: reg.aliases && typeof reg.aliases === 'object' ? reg.aliases : {},
      sessions: reg.sessions && typeof reg.sessions === 'object' ? reg.sessions : {},
    };
  } catch {
    return emptyRegistry();
  }
}

function saveRegistry(reg) {
  const tmp = `${REGISTRY_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(reg, null, 2) + '\n');
  fs.renameSync(tmp, REGISTRY_PATH);
}

// ─── alias CRUD ────────────────────────────────────────────────────────

function validateAliasName(name) {
  if (!ALIAS_NAME_RE.test(String(name || ''))) {
    return `Invalid alias "${name}". Use lowercase letters, digits, hyphens (max 40 chars).`;
  }
  return null;
}

function createAlias(name, worktree, opts = {}) {
  const err = validateAliasName(name);
  if (err) return { error: err };
  const reg = loadRegistry();
  if (reg.aliases[name]) return { error: `Alias "${name}" already exists.` };
  const wt = path.resolve(worktree || process.cwd());
  const created = {
    ...reg,
    aliases: {
      ...reg.aliases,
      [name]: { worktree: wt, note: opts.note || '', createdAt: new Date().toISOString() },
    },
  };
  saveRegistry(created);
  return { created: name, worktree: wt };
}

function renameAlias(oldName, newName) {
  const err = validateAliasName(newName);
  if (err) return { error: err };
  const reg = loadRegistry();
  if (!reg.aliases[oldName]) return { error: `Alias "${oldName}" not found.` };
  if (reg.aliases[newName]) return { error: `Alias "${newName}" already exists.` };
  const aliases = { ...reg.aliases, [newName]: reg.aliases[oldName] };
  delete aliases[oldName];
  const sessions = {};
  for (const [file, a] of Object.entries(reg.sessions)) {
    sessions[file] = a === oldName ? newName : a;
  }
  saveRegistry({ ...reg, aliases, sessions });
  return { renamed: oldName, to: newName };
}

function removeAlias(name) {
  const reg = loadRegistry();
  if (!reg.aliases[name]) return { error: `Alias "${name}" not found.` };
  const aliases = { ...reg.aliases };
  delete aliases[name];
  const sessions = {};
  let freed = 0;
  for (const [file, a] of Object.entries(reg.sessions)) {
    if (a === name) { freed++; continue; }
    sessions[file] = a;
  }
  saveRegistry({ ...reg, aliases, sessions });
  return { removed: name, sessionsUnassigned: freed };
}

function assignSession(filename, aliasName) {
  const reg = loadRegistry();
  if (!reg.aliases[aliasName]) return { error: `Alias "${aliasName}" not found.` };
  saveRegistry({ ...reg, sessions: { ...reg.sessions, [filename]: aliasName } });
  return { assigned: filename, to: aliasName };
}

// ─── session scanning + auto-assignment ────────────────────────────────

function sessionWorktree(session) {
  const meta = sm.parseSessionMetadata(sm.getSessionContent(session.sessionPath));
  return meta.worktree || meta.Worktree || null;
}

function suggestAliasName(worktree) {
  const base = path.basename(worktree || 'project').toLowerCase();
  const cleaned = base.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return cleaned || 'project';
}

function aliasesForWorktree(reg, worktree) {
  if (!worktree) return [];
  const wt = path.resolve(worktree);
  return Object.entries(reg.aliases)
    .filter(([, a]) => path.resolve(a.worktree) === wt)
    .map(([name]) => name);
}

/**
 * Scan session-data, auto-assign new sessions whose folder maps to exactly
 * one alias, drop registry entries for deleted files, report the rest.
 * Never deletes session files; only registry bookkeeping is written.
 */
function syncRegistry() {
  const reg = loadRegistry();
  const all = sm.getAllSessions({ limit: SCAN_LIMIT }).sessions;
  const existing = new Set(all.map(s => s.filename));

  const sessions = {};
  for (const [file, a] of Object.entries(reg.sessions)) {
    if (existing.has(file) && reg.aliases[a]) sessions[file] = a;
  }

  let autoAssigned = 0;
  const unassigned = [];
  for (const s of all) {
    if (sessions[s.filename]) continue;
    const worktree = sessionWorktree(s);
    const candidates = aliasesForWorktree(reg, worktree);
    if (candidates.length === 1) {
      sessions[s.filename] = candidates[0];
      autoAssigned++;
    } else {
      unassigned.push({
        filename: s.filename,
        date: s.date,
        worktree,
        suggested: candidates.length ? null : suggestAliasName(worktree),
        candidates,
      });
    }
  }

  const next = { ...reg, sessions };
  saveRegistry(next);
  return { registry: next, autoAssigned, unassigned };
}

// ─── views ─────────────────────────────────────────────────────────────

function sessionsForAlias(aliasName, reg) {
  const registry = reg || loadRegistry();
  const members = Object.entries(registry.sessions)
    .filter(([, a]) => a === aliasName)
    .map(([file]) => file);
  const all = sm.getAllSessions({ limit: SCAN_LIMIT }).sessions;
  return all.filter(s => members.includes(s.filename)); // already mtime-desc
}

function currentAliases(cwd) {
  const reg = loadRegistry();
  return aliasesForWorktree(reg, cwd || process.cwd());
}

/**
 * Overview rows for the /sessions default view: one row per alias plus
 * grouped unassigned sessions needing a human decision.
 */
function aliasOverview() {
  const { registry, autoAssigned, unassigned } = syncRegistry();
  const rows = Object.entries(registry.aliases).map(([name, a]) => {
    const members = sessionsForAlias(name, registry);
    return {
      alias: name,
      worktree: a.worktree,
      note: a.note || '',
      sessions: members.length,
      lastActive: members.length ? members[0].date : '-',
    };
  }).sort((x, y) => String(y.lastActive).localeCompare(String(x.lastActive)));

  const groups = new Map();
  for (const u of unassigned) {
    const key = u.worktree || '(unknown worktree)';
    if (!groups.has(key)) {
      groups.set(key, { worktree: key, suggested: u.suggested, candidates: u.candidates, files: [] });
    }
    groups.get(key).files.push(`${u.date} ${u.filename}`);
  }

  return { rows, autoAssigned, unassignedGroups: [...groups.values()] };
}

// ─── alias switch: context-rich load of the whole alias ────────────────

/**
 * Load an alias: newest member session is the primary summary; prior member
 * summaries are appended within a slice of the budget; native transcripts
 * from the alias worktree fill the remainder (reuses the context-rich
 * machinery in session-manager-fsun).
 */
function loadAliasContext(aliasName, opts = {}) {
  const reg = loadRegistry();
  const alias = reg.aliases[aliasName];
  if (!alias) return { error: `Alias "${aliasName}" not found. Run "sessions" to see aliases.` };

  const members = sessionsForAlias(aliasName, reg);
  if (members.length === 0) {
    return { error: `Alias "${aliasName}" has no sessions yet (folder: ${alias.worktree}).` };
  }

  const primary = members[0];
  const result = fsun.loadSessionWithHistory(primary.shortId === 'no-id' ? primary.filename : primary.shortId, opts);
  if (result.error) return result;

  const budgetChars = result.budget.chars;
  const summarySliceChars = Math.floor(budgetChars * 0.2);
  const prior = [];
  let used = 0;
  for (const s of members.slice(1)) {
    const content = sm.getSessionContent(s.sessionPath);
    if (used + content.length > summarySliceChars) break;
    prior.push({ filename: s.filename, date: s.date, content });
    used += content.length;
  }

  return { ...result, alias: aliasName, worktree: alias.worktree, memberCount: members.length, priorSummaries: prior };
}

function renderAliasLoad(result) {
  if (result.error) return `ERROR: ${result.error}`;
  const out = [];
  out.push(`# Alias: ${result.alias}  (${result.memberCount} sessions, folder: ${result.worktree})`);
  out.push('');
  out.push(fsun.renderLoadOutput(result));
  if (result.priorSummaries && result.priorSummaries.length) {
    out.push('');
    out.push('## Prior Session Summaries');
    for (const p of result.priorSummaries) {
      out.push('---');
      out.push(`### ${p.filename}  (${p.date})`);
      out.push(p.content.trim());
      out.push('');
    }
  }
  return out.join('\n');
}

module.exports = {
  REGISTRY_PATH,
  loadRegistry,
  saveRegistry,
  validateAliasName,
  createAlias,
  renameAlias,
  removeAlias,
  assignSession,
  syncRegistry,
  sessionsForAlias,
  currentAliases,
  aliasOverview,
  suggestAliasName,
  loadAliasContext,
  renderAliasLoad,
};
