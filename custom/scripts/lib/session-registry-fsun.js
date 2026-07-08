/**
 * session-registry-fsun.js — Frank's alias-first session registry
 *
 * The registry is the source of truth for alias <-> session membership:
 *   - one alias = one project/topic; an alias OWNS many sessions (N:1)
 *   - each session file belongs to exactly one alias (or is unassigned)
 *   - an alias records one or MORE worktrees; new sessions in any of those
 *     folders are auto-assigned to it. A folder claimed by two aliases stays
 *     manual: the session is reported as unassigned with both candidates.
 *   - ignored folders (exact match) are invisible: never assigned, never
 *     nagged about (e.g. ~/claude_adhoc scratch sessions).
 *
 * Registry file: ~/.claude/session-registry.json
 *   { "version": 2,
 *     "aliases":  { "<name>": { "worktrees": ["..."], "note": "", "createdAt": "ISO" } },
 *     "sessions": { "<session-filename>": "<alias-name>" },
 *     "ignored":  ["/abs/path", ...] }
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
const SCAN_PAGE = 100000;

/** Fetch every session in one upstream scan (getAllSessions re-reads the
 *  whole dir per call, so looping small pages would be O(N^2); one huge
 *  page keeps it a single O(N) scan). hasMore loop is a safety net only. */
function scanAllSessions() {
  const all = [];
  let offset = 0;
  for (;;) {
    const page = sm.getAllSessions({ limit: SCAN_PAGE, offset });
    all.push(...page.sessions);
    if (!page.hasMore) return all;
    offset += SCAN_PAGE;
  }
}

// ─── registry I/O ──────────────────────────────────────────────────────

function emptyRegistry() {
  return { version: 2, aliases: {}, sessions: {}, ignored: [] };
}

function migrateAlias(a) {
  // v1 aliases had a single `worktree`; v2 uses `worktrees: []`
  if (Array.isArray(a.worktrees)) return a;
  const { worktree, ...rest } = a;
  return { ...rest, worktrees: worktree ? [worktree] : [] };
}

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return emptyRegistry();
  try {
    const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    if (!raw || typeof raw !== 'object') return emptyRegistry();
    const aliases = {};
    for (const [name, a] of Object.entries(raw.aliases || {})) aliases[name] = migrateAlias(a);
    return {
      version: 2,
      aliases,
      sessions: raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {},
      ignored: Array.isArray(raw.ignored) ? raw.ignored : [],
    };
  } catch (err) {
    // Never let a corrupt registry be silently replaced: preserve the bad
    // file so the next saveRegistry() can't destroy the user's mappings.
    const backup = `${REGISTRY_PATH}.corrupt`;
    try { fs.copyFileSync(REGISTRY_PATH, backup); } catch { /* best effort */ }
    process.stderr.write(
      `[SessionRegistry] WARNING: ${REGISTRY_PATH} is unreadable (${err.message}). ` +
      `Preserved a copy at ${backup}; starting from an empty registry.\n`
    );
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
  saveRegistry({
    ...reg,
    aliases: {
      ...reg.aliases,
      [name]: { worktrees: [wt], note: opts.note || '', createdAt: new Date().toISOString() },
    },
  });
  return { created: name, worktrees: [wt] };
}

function attachWorktree(aliasName, worktree) {
  const reg = loadRegistry();
  const alias = reg.aliases[aliasName];
  if (!alias) return { error: `Alias "${aliasName}" not found.` };
  const wt = path.resolve(worktree);
  if (alias.worktrees.includes(wt)) return { error: `${wt} already attached to "${aliasName}".` };
  saveRegistry({
    ...reg,
    aliases: { ...reg.aliases, [aliasName]: { ...alias, worktrees: [...alias.worktrees, wt] } },
  });
  return { attached: wt, to: aliasName };
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

/**
 * Absorb: merge source aliases INTO target — memberships and worktrees move
 * to target, sources are deleted. This is how "combine all context into one
 * alias" works; session files themselves are never touched.
 */
function absorbAliases(target, rawSources) {
  const sources = [...new Set(rawSources)];
  const reg = loadRegistry();
  if (!reg.aliases[target]) return { error: `Target alias "${target}" not found.` };
  for (const s of sources) {
    if (!reg.aliases[s]) return { error: `Source alias "${s}" not found.` };
    if (s === target) return { error: 'Cannot absorb an alias into itself.' };
  }
  const aliases = { ...reg.aliases };
  let worktrees = [...aliases[target].worktrees];
  let moved = 0;
  const sessions = {};
  for (const [file, a] of Object.entries(reg.sessions)) {
    if (sources.includes(a)) { sessions[file] = target; moved++; }
    else sessions[file] = a;
  }
  for (const s of sources) {
    for (const wt of aliases[s].worktrees) {
      if (!worktrees.includes(wt)) worktrees = [...worktrees, wt];
    }
    delete aliases[s];
  }
  aliases[target] = { ...aliases[target], worktrees };
  saveRegistry({ ...reg, aliases, sessions });
  return { target, absorbed: sources, sessionsMoved: moved, worktrees };
}

function ignorePath(p) {
  const reg = loadRegistry();
  const abs = path.resolve(p);
  if (reg.ignored.includes(abs)) return { error: `${abs} already ignored.` };
  saveRegistry({ ...reg, ignored: [...reg.ignored, abs] });
  return { ignored: abs };
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
    .filter(([, a]) => a.worktrees.some(w => path.resolve(w) === wt))
    .map(([name]) => name);
}

function isIgnored(reg, worktree) {
  if (!worktree) return false;
  const wt = path.resolve(worktree);
  return reg.ignored.some(p => path.resolve(p) === wt);
}

/**
 * Scan session-data, auto-assign new sessions whose folder maps to exactly
 * one alias, drop registry entries for deleted files, skip ignored folders,
 * report the rest. Never deletes session files.
 */
function syncRegistry() {
  const reg = loadRegistry();
  const all = scanAllSessions();
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
    if (isIgnored(reg, worktree)) continue;
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
  // Skip the disk write when nothing changed — overview/switch call this often.
  if (JSON.stringify(sessions) !== JSON.stringify(reg.sessions)) saveRegistry(next);
  return { registry: next, autoAssigned, unassigned };
}

/**
 * Gather by topic: assign every session whose CONTENT mentions the topic to
 * the alias. Global by default; pass {worktree} to restrict to one folder.
 * Membership move only — files stay where they are.
 */
function gatherByTopic(aliasName, topic, opts = {}) {
  const reg = loadRegistry();
  if (!reg.aliases[aliasName]) return { error: `Alias "${aliasName}" not found.` };
  if (!topic || !String(topic).trim()) return { error: 'Topic required.' };
  const t = String(topic).toLowerCase();
  const restrict = opts.worktree ? path.resolve(opts.worktree) : null;

  const all = scanAllSessions();
  const sessions = { ...reg.sessions };
  const gathered = [];
  for (const s of all) {
    if (sessions[s.filename] === aliasName) continue;
    const worktree = sessionWorktree(s);
    if (isIgnored(reg, worktree)) continue;
    if (restrict && (!worktree || path.resolve(worktree) !== restrict)) continue;
    const content = sm.getSessionContent(s.sessionPath);
    if (!content.toLowerCase().includes(t)) continue;
    gathered.push({ filename: s.filename, from: sessions[s.filename] || '(unassigned)' });
    sessions[s.filename] = aliasName;
  }
  if (!opts.dryRun) saveRegistry({ ...reg, sessions });
  return { alias: aliasName, topic, gathered, dryRun: opts.dryRun === true };
}

/**
 * Consolidate: fold ALL of an alias's sessions into its newest file so the
 * alias has exactly ONE working session. Older members' content is appended
 * to the newest file as a "Merged History" block; the old files move to
 * ~/.claude/session-data/archive/ (reversible — nothing is deleted).
 */
function consolidateAlias(aliasName, opts = {}) {
  const reg = loadRegistry();
  if (!reg.aliases[aliasName]) return { error: `Alias "${aliasName}" not found.` };
  const members = sessionsForAlias(aliasName, reg);
  if (members.length <= 1) {
    return { consolidated: false, reason: `Alias "${aliasName}" already has ${members.length} session(s) — nothing to consolidate.` };
  }

  const target = members[0];
  const older = members.slice(1).reverse(); // oldest first for readable history
  const dryRun = opts.dryRun === true;

  if (!dryRun) {
    const banner = `\n\n---\n\n# Merged History (consolidated ${new Date().toISOString()})\n`;
    const blocks = older.map(s => {
      const content = sm.getSessionContent(s.sessionPath);
      return `\n## From ${s.filename}  (${s.date})\n${content.trim()}`;
    }).join('\n');
    const existing = sm.getSessionContent(target.sessionPath);
    const wrote = sm.writeSessionContent(target.sessionPath, existing.trimEnd() + banner + blocks + '\n');
    if (wrote === false) {
      return { error: `Failed to write merged content to ${target.filename} — nothing was archived.` };
    }

    const archiveDir = path.join(path.dirname(target.sessionPath), 'archive');
    fs.mkdirSync(archiveDir, { recursive: true });
    for (const s of older) {
      fs.renameSync(s.sessionPath, path.join(archiveDir, s.filename));
    }
    syncRegistry(); // drop registry entries for archived files
  }

  return {
    consolidated: true,
    alias: aliasName,
    target: target.filename,
    archived: older.map(s => s.filename),
    archiveDir: path.join(path.dirname(target.sessionPath), 'archive'),
    dryRun,
  };
}

// ─── views ─────────────────────────────────────────────────────────────

function sessionsForAlias(aliasName, reg) {
  const registry = reg || loadRegistry();
  const members = new Set(
    Object.entries(registry.sessions)
      .filter(([, a]) => a === aliasName)
      .map(([file]) => file)
  );
  return scanAllSessions().filter(s => members.has(s.filename)); // already mtime-desc
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
      worktrees: a.worktrees,
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
 * Load an alias: ALL member session summaries (newest first, unbudgeted —
 * they are small), then native transcripts from EVERY attached worktree,
 * topic-filtered and budget-filled (newest first across worktrees).
 */
function loadAliasContext(aliasName, opts = {}) {
  const reg = loadRegistry();
  const alias = reg.aliases[aliasName];
  if (!alias) return { error: `Alias "${aliasName}" not found. Run "sessions" to see aliases.` };

  const members = sessionsForAlias(aliasName, reg);
  if (members.length === 0) {
    return { error: `Alias "${aliasName}" has no sessions yet (folders: ${alias.worktrees.join(', ')}).` };
  }

  const budgetTokens = fsun.parseBudget(opts.budget);
  const budgetChars = budgetTokens * 4;
  const sinceDate = fsun.parseSince(opts.since || null);
  const topic = opts.topic || null;

  const summaries = members.map(s => ({
    filename: s.filename,
    date: s.date,
    content: sm.getSessionContent(s.sessionPath),
  }));

  const history = { transcripts: [], skipped: 0, charsUsed: 0, tokensUsed: 0 };
  if (opts.noHistory !== true) {
    let transcripts = alias.worktrees
      .flatMap(wt => fsun.findNativeTranscripts(wt).map(t => ({ ...t, worktree: wt })))
      .sort((a, b) => b.mtime - a.mtime);
    if (sinceDate) transcripts = transcripts.filter(t => t.mtime >= sinceDate);
    // A folder claimed by 2+ aliases shares one transcript dir. By default,
    // scope such folders' transcripts to THIS alias's member sessions.
    // ECC shortIds are the LAST 8 chars of the transcript uuid (see upstream
    // session-end.js), so match on the filename suffix "<shortId>.jsonl".
    // A member without a usable id can't be matched and is excluded there.
    // opts.allTranscripts=true loads everything regardless (richer context).
    const sharedWts = new Set(
      alias.worktrees
        .filter(wt => aliasesForWorktree(reg, wt).length > 1)
        .map(wt => path.resolve(wt))
    );
    if (!opts.allTranscripts && sharedWts.size > 0) {
      const memberIds = members.map(s => s.shortId).filter(id => id && id !== 'no-id');
      const before = transcripts.length;
      transcripts = transcripts.filter(t =>
        !sharedWts.has(path.resolve(t.worktree)) || memberIds.some(id => t.name.endsWith(`${id}.jsonl`))
      );
      history.scopedOut = before - transcripts.length;
    }
    const withDialog = transcripts.map(t => ({ ...t, dialog: fsun.extractDialog(t.path) }));
    const filtered = fsun.filterByTopic(withDialog, topic, { useLLM: opts.useLLM !== false });
    let charsUsed = 0;
    for (const t of filtered) {
      const cost = t.dialog.length;
      if (charsUsed + cost > budgetChars) { history.skipped++; continue; }
      history.transcripts.push({
        name: t.name, worktree: t.worktree, mtime: t.mtime,
        sizeChars: cost, score: t.score, llm: t.llm, dialog: t.dialog,
      });
      charsUsed += cost;
    }
    history.charsUsed = charsUsed;
    history.tokensUsed = Math.round(charsUsed / 4);
  }

  return {
    alias: aliasName,
    worktrees: alias.worktrees,
    memberCount: members.length,
    summaries,
    history,
    budget: { tokens: budgetTokens, chars: budgetChars },
    topic,
  };
}

function renderAliasLoad(result) {
  if (result.error) return `ERROR: ${result.error}`;
  const out = [];
  out.push(`# Alias: ${result.alias}  (${result.memberCount} sessions)`);
  out.push(`Folders: ${result.worktrees.join(', ')}`);
  out.push('');
  out.push('## Session Summaries (newest first)');
  for (const p of result.summaries) {
    out.push('---');
    out.push(`### ${p.filename}  (${p.date})`);
    out.push(p.content.trim());
    out.push('');
  }
  const h = result.history;
  out.push('## Native Transcript History');
  out.push(`Budget: ${result.budget.tokens.toLocaleString()} tokens`);
  if (result.topic) out.push(`Topic filter: "${result.topic}"`);
  out.push(`Included: ${h.transcripts.length}, skipped (over budget): ${h.skipped}, used: ${h.tokensUsed.toLocaleString()} tokens`);
  if (h.scopedOut) out.push(`Scoped out (other alias in shared folder): ${h.scopedOut} — use --all-transcripts to include`);
  out.push('');
  for (const t of h.transcripts) {
    out.push('---');
    out.push(`### ${t.name}  (${path.basename(t.worktree)})`);
    out.push(`mtime: ${t.mtime.toISOString()} · size: ${t.sizeChars.toLocaleString()} chars` +
      (t.score !== null ? ` · score: ${Number(t.score).toFixed(1)}${t.llm ? ' (LLM)' : ' (keyword)'}` : ''));
    out.push('');
    out.push(t.dialog);
    out.push('');
  }
  return out.join('\n');
}

// ─── help (chat-facing, like `myclaude help`) ──────────────────────────

const REGISTRY_HELP = `Sessions — alias-first (Frank's build). One alias = one project/topic.

Daily driver:
  sessions                          Overview: current folder's alias, alias table,
                                    unassigned folders (with suggested names)
  sessions switch <alias>           Load the WHOLE alias context (all summaries +
                                    transcripts from every attached folder;
                                    shared folders scoped to THIS alias by default)
    --topic "kw" --budget 1M --since 7d --no-history --no-llm
    --all-transcripts               include other aliases' transcripts too

Organize:
  sessions alias create <name> [path]   Name a project (default folder: cwd)
  sessions attach <alias> <path>        Alias spans another folder too
  sessions assign <alias> <file...>     Move specific session(s) to an alias
  sessions gather <alias> --topic "kw" [--folder path] [--dry-run]
                                        Pull every session mentioning a topic
                                        into the alias (global by default)
  sessions absorb <target> <src...>     Merge alias(es) INTO target (memberships
                                        + folders move; sources deleted)
  sessions consolidate <alias> [--dry-run]
                                        Fold all member sessions into ONE latest
                                        file; older files -> session-data/archive/
  sessions rename <old> <new>           Rename (memberships follow)
  sessions unalias <name>               Remove alias (files untouched)
  sessions ignore <path>                Never track/nag about a folder
                                        (e.g. ~/claude_adhoc scratch)

Rules of thumb:
  - New sessions auto-join their folder's alias; nothing is created silently.
  - A folder with 2 aliases -> you pick per session (candidates listed).
  - Registry ops NEVER delete session files; consolidate archives, not deletes.
  - Session IDs are hidden; use "sessions list --verbose" if you ever need them.
`;

module.exports = {
  REGISTRY_PATH,
  REGISTRY_HELP,
  loadRegistry,
  saveRegistry,
  validateAliasName,
  createAlias,
  attachWorktree,
  renameAlias,
  removeAlias,
  assignSession,
  absorbAliases,
  consolidateAlias,
  ignorePath,
  syncRegistry,
  gatherByTopic,
  sessionsForAlias,
  currentAliases,
  aliasOverview,
  suggestAliasName,
  loadAliasContext,
  renderAliasLoad,
};
