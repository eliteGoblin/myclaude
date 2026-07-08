/**
 * session-manager-fsun.js — Frank's session-manager extension
 *
 * Wraps the upstream session-manager.js with:
 *   - context-rich loading (default): combines .tmp summary with Claude-native
 *     JSONL transcripts under ~/.claude/projects/<encoded-cwd>/
 *   - human-friendly token budgets ("500K", "1M")
 *   - LLM topic filtering (via `claude -p`) with keyword-grep fallback
 *   - merge: consolidate multiple .tmp files for same alias/project into one
 *
 * Lives in fsun_config/custom/scripts/lib/. The slash command override at
 * fsun_config/custom/commands/sessions.md routes here. Upstream files are
 * untouched.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// Resolve upstream lib via the same path-discovery shim used elsewhere
function resolveUpstream(name) {
  const env = process.env.CLAUDE_PLUGIN_ROOT;
  if (env && env.trim()) return require(path.join(env.trim(), 'scripts', 'lib', name));
  const home = os.homedir();
  const claudeDir = path.join(home, '.claude');
  if (fs.existsSync(path.join(claudeDir, 'scripts', 'lib', `${name}.js`))) {
    return require(path.join(claudeDir, 'scripts', 'lib', name));
  }
  // Fallback for dev: source repo
  return require(path.join(home, 'devel', 'everything-claude-code', 'scripts', 'lib', name));
}

const sm = resolveUpstream('session-manager');
const aa = resolveUpstream('session-aliases');

// ─── budget parsing ────────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4; // rough English estimate

function parseBudget(str) {
  if (str === undefined || str === null) return 500_000; // default 500K tokens
  if (typeof str === 'number') return str;
  const m = String(str).trim().match(/^(\d+)([KkMm])?$/);
  if (!m) throw new Error(`Invalid budget: ${str}. Use like "500K", "1M", or raw "500000".`);
  const num = parseInt(m[1], 10);
  const mult = m[2] ? (m[2].toLowerCase() === 'k' ? 1_000 : 1_000_000) : 1;
  return num * mult;
}

function tokensToChars(tokens) {
  return tokens * CHARS_PER_TOKEN;
}

// ─── claude-native transcript discovery ────────────────────────────────

function encodeWorktreePath(p) {
  // ~/.claude/projects/ uses /home/x/y → -home-x-y (slashes to hyphens)
  return p.replace(/\//g, '-');
}

function findNativeTranscripts(worktreePath) {
  if (!worktreePath) return [];
  const encoded = encodeWorktreePath(worktreePath);
  const dir = path.join(os.homedir(), '.claude', 'projects', encoded);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => {
      const fp = path.join(dir, f);
      const stat = fs.statSync(fp);
      return { path: fp, name: f, mtime: stat.mtime, size: stat.size };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

// ─── extract dialog from JSONL (drop tool I/O bulk) ────────────────────

function extractDialog(jsonlPath) {
  const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n');
  const out = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    const msg = entry.message || entry;
    const role = msg.role || entry.type;

    if (role === 'user') {
      const content = msg.content;
      const text = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.filter(c => c.type === 'text' || typeof c === 'string')
              .map(c => c.text || c).join('\n')
          : '';
      if (text.trim()) out.push(`USER: ${text.trim()}`);
    } else if (role === 'assistant') {
      const content = msg.content;
      if (Array.isArray(content)) {
        const texts = content.filter(c => c.type === 'text').map(c => c.text);
        if (texts.length) out.push(`ASSISTANT: ${texts.join('\n').trim()}`);
      } else if (typeof content === 'string') {
        out.push(`ASSISTANT: ${content.trim()}`);
      }
    }
    // tool_use, tool_result, system: skipped — they dominate bytes without
    // adding much narrative context
  }
  return out.join('\n\n');
}

// ─── topic filtering ───────────────────────────────────────────────────

function keywordScore(text, topic) {
  if (!topic) return 1;
  const t = topic.toLowerCase();
  const lc = text.toLowerCase();
  let score = 0;
  let idx = 0;
  while ((idx = lc.indexOf(t, idx)) !== -1) {
    score++;
    idx += t.length;
  }
  // normalize per 10K chars to avoid favoring large transcripts
  return score / Math.max(1, lc.length / 10_000);
}

function llmRelevanceScore(text, topic) {
  // Use `claude -p` for headless scoring. Keep prompt focused; truncate input
  // to first/last 5K chars each (10K total) so we don't blow LLM budget.
  const slice = text.length > 12_000
    ? text.slice(0, 6_000) + '\n\n[...truncated...]\n\n' + text.slice(-6_000)
    : text;
  const prompt = [
    `Score how strongly this conversation transcript relates to the topic: "${topic}"`,
    `Reply with ONLY a single integer 0-10 (0 = not related, 10 = entirely about it).`,
    `Do not explain. Just the integer.`,
    `---`,
    slice,
  ].join('\n');

  try {
    const result = spawnSync('claude', ['-p', prompt], {
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status !== 0) return null;
    const out = (result.stdout || '').trim();
    const m = out.match(/\b(\d{1,2})\b/);
    if (!m) return null;
    const score = parseInt(m[1], 10);
    return Math.min(10, Math.max(0, score));
  } catch {
    return null;
  }
}

function filterByTopic(transcriptList, topic, opts = {}) {
  if (!topic) return transcriptList.map(t => ({ ...t, score: null, justification: null }));

  const useLLM = opts.useLLM !== false; // default true
  const threshold = opts.threshold || 6; // 0-10

  // Cheap pre-filter: keyword must appear at least once
  const candidates = transcriptList.filter(t => keywordScore(t.dialog, topic) > 0);

  if (!useLLM) {
    return candidates
      .map(t => ({ ...t, score: keywordScore(t.dialog, topic) * 10, llm: false }))
      .sort((a, b) => b.score - a.score);
  }

  const scored = [];
  for (const t of candidates) {
    const llmScore = llmRelevanceScore(t.dialog, topic);
    if (llmScore === null) {
      // LLM unavailable — fall back to keyword on this one
      scored.push({ ...t, score: keywordScore(t.dialog, topic) * 10, llm: false });
    } else if (llmScore >= threshold) {
      scored.push({ ...t, score: llmScore, llm: true });
    }
  }
  return scored.sort((a, b) => b.score - a.score);
}

// ─── time filtering ────────────────────────────────────────────────────

function parseSince(since) {
  if (!since) return null;
  const m = String(since).trim().match(/^(\d+)([dhwm])$/);
  if (!m) throw new Error(`Invalid --since: ${since}. Use like "7d", "24h", "2w", "1m".`);
  const n = parseInt(m[1], 10);
  const unitMs = { h: 3600e3, d: 86400e3, w: 604800e3, m: 2629800e3 }[m[2]];
  return new Date(Date.now() - n * unitMs);
}

// ─── load session with native history ──────────────────────────────────

function loadSessionWithHistory(sessionIdOrAlias, opts = {}) {
  const budgetTokens = parseBudget(opts.budget);
  const budgetChars = tokensToChars(budgetTokens);
  const noHistory = opts.noHistory === true;
  const topic = opts.topic || null;
  const sinceDate = parseSince(opts.since);

  // Resolve alias → session
  const resolved = aa.resolveAlias(sessionIdOrAlias);
  const sessionId = resolved ? resolved.sessionPath : sessionIdOrAlias;
  const session = sm.getSessionById(sessionId, true);
  if (!session) {
    return { error: `Session not found: ${sessionIdOrAlias}` };
  }

  const meta = sm.parseSessionMetadata(session.content || sm.getSessionContent(session.sessionPath));
  const stats = sm.getSessionStats(session.sessionPath);
  const aliases = aa.getAliasesForSession(session.filename);

  const result = {
    session: {
      filename: session.filename,
      path: session.sessionPath,
      shortId: session.shortId,
      date: session.date,
      meta,
      stats,
      aliases: aliases.map(a => a.name),
      content: session.content || sm.getSessionContent(session.sessionPath),
    },
    history: { transcripts: [], skipped: 0, charsUsed: 0, tokensUsed: 0 },
    budget: { tokens: budgetTokens, chars: budgetChars },
    topic,
  };

  if (noHistory) return result;

  // Worktree resolution order:
  //   1. .tmp metadata `Worktree:` (canonical, set by save-session)
  //   2. process.cwd() if it looks like a real path (manual-written .tmp fallback)
  let worktree = meta.worktree || meta.Worktree;
  if (!worktree) {
    const cwd = process.cwd();
    if (cwd && cwd !== '/') {
      worktree = cwd;
      result.history.warning = `No Worktree in .tmp — falling back to cwd: ${cwd}`;
    } else {
      result.history.warning = 'No Worktree in session metadata and cwd is unusable — cannot locate native transcripts.';
      return result;
    }
  }

  let transcripts = findNativeTranscripts(worktree);
  if (sinceDate) transcripts = transcripts.filter(t => t.mtime >= sinceDate);
  if (transcripts.length === 0) {
    result.history.warning = `No native transcripts under ~/.claude/projects/${encodeWorktreePath(worktree)}/`;
    return result;
  }

  // Extract dialog for each (mtime-desc order from findNativeTranscripts)
  const withDialog = transcripts.map(t => ({ ...t, dialog: extractDialog(t.path) }));

  // Topic filter (or no-op if no topic)
  const filtered = filterByTopic(withDialog, topic, { useLLM: opts.useLLM !== false });

  // Fill to budget
  let charsUsed = 0;
  for (const t of filtered) {
    const cost = t.dialog.length;
    if (charsUsed + cost > budgetChars) {
      result.history.skipped++;
      continue;
    }
    result.history.transcripts.push({
      name: t.name,
      mtime: t.mtime,
      sizeChars: cost,
      score: t.score,
      llm: t.llm,
      dialog: t.dialog,
    });
    charsUsed += cost;
  }
  result.history.charsUsed = charsUsed;
  result.history.tokensUsed = Math.round(charsUsed / CHARS_PER_TOKEN);
  return result;
}

// ─── merge sessions ────────────────────────────────────────────────────

function mergeSessions(sessionIdOrAlias, opts = {}) {
  const topic = opts.topic || null;
  const dryRun = opts.dryRun === true;

  const resolved = aa.resolveAlias(sessionIdOrAlias);
  const target = sm.getSessionById(resolved ? resolved.sessionPath : sessionIdOrAlias, true);
  if (!target) return { error: `Session not found: ${sessionIdOrAlias}` };

  const targetMeta = sm.parseSessionMetadata(target.content || sm.getSessionContent(target.sessionPath));
  const targetProject = targetMeta.project || targetMeta.Project;

  // Find sibling .tmp files: same project, older than target, not the target itself
  const all = sm.getAllSessions({ limit: 500 }).sessions;
  const siblings = [];
  for (const s of all) {
    if (s.filename === target.filename) continue;
    const c = sm.getSessionContent(s.sessionPath);
    const m = sm.parseSessionMetadata(c);
    if (targetProject && (m.project || m.Project) !== targetProject) continue;
    if (topic && !c.toLowerCase().includes(topic.toLowerCase())) continue;
    siblings.push({ session: s, content: c, meta: m });
  }

  // Sort siblings by date ascending (oldest first) so the merged section reads in time order
  siblings.sort((a, b) => a.session.modifiedTime - b.session.modifiedTime);

  if (siblings.length === 0) {
    return { merged: false, reason: 'No sibling sessions found to merge.' };
  }

  // Build the merged content: existing target + appended history block
  const existing = target.content || sm.getSessionContent(target.sessionPath);
  const banner = `\n\n---\n\n# Merged History\n\n*Auto-merged ${new Date().toISOString()} from ${siblings.length} prior session(s)${topic ? ` matching topic "${topic}"` : ''}.*\n`;
  const blocks = siblings.map(s => {
    const header = `\n## From ${s.session.filename}  (${s.session.date})\n`;
    return header + s.content.trim();
  }).join('\n');

  const merged = existing.trimEnd() + banner + blocks + '\n';

  if (!dryRun) {
    sm.writeSessionContent(target.sessionPath, merged);
  }

  return {
    merged: true,
    targetPath: target.sessionPath,
    siblingCount: siblings.length,
    siblings: siblings.map(s => s.session.filename),
    appendedChars: banner.length + blocks.length,
    dryRun,
  };
}

// ─── render to stdout ──────────────────────────────────────────────────

function renderLoadOutput(result) {
  if (result.error) {
    return `ERROR: ${result.error}`;
  }
  const out = [];
  const s = result.session;
  out.push(`# ${s.filename}`);
  out.push(`Path: ${s.path}`);
  if (s.aliases.length) out.push(`Aliases: ${s.aliases.join(', ')}`);
  out.push('');
  out.push('## Session Summary (.tmp)');
  out.push(s.content);
  out.push('');

  const h = result.history;
  out.push('## Native Transcript History');
  out.push(`Budget: ${result.budget.tokens.toLocaleString()} tokens (${result.budget.chars.toLocaleString()} chars)`);
  if (result.topic) out.push(`Topic filter: "${result.topic}"`);
  if (h.warning) out.push(`WARNING: ${h.warning}`);
  out.push(`Included: ${h.transcripts.length}, skipped (over budget): ${h.skipped}`);
  out.push(`Used: ${h.tokensUsed.toLocaleString()} tokens (${h.charsUsed.toLocaleString()} chars)`);
  out.push('');

  for (const t of h.transcripts) {
    out.push('---');
    out.push(`### ${t.name}`);
    out.push(`mtime: ${t.mtime.toISOString()} · size: ${t.sizeChars.toLocaleString()} chars` +
      (t.score !== null ? ` · score: ${t.score.toFixed(1)}${t.llm ? ' (LLM)' : ' (keyword)'}` : ''));
    out.push('');
    out.push(t.dialog);
    out.push('');
  }
  return out.join('\n');
}

// ─── help text ─────────────────────────────────────────────────────────

const HELP = `Sessions — manage Claude Code session history (Frank's extended build)

Default load is context-rich: .tmp summary + native transcripts (up to budget).

  sessions                              List recent sessions
  sessions list [opts]                  List with filters
    --limit N                             max sessions to show (default 50)
    --date YYYY-MM-DD                     filter by date
    --search PATTERN                      substring match on session id
  sessions load <id|alias> [opts]       Load context-rich (default)
    --no-history                          metadata + .tmp summary only
    --topic "<keyword>"                   LLM filter native transcripts
    --budget 500K | 1M | 800000           token budget (default 500K)
    --since 7d | 24h | 2w                 only transcripts modified within window
    --no-llm                              keyword-only filter (skip claude -p)
  sessions merge <id|alias> [opts]      Append sibling sessions into target .tmp
    --topic "<keyword>"                   only merge siblings whose content matches
    --dry-run                             show what would be merged
  sessions info <id|alias>              Show session details
  sessions alias <id> <name>            Create alias
  sessions alias --remove <name>        Remove alias
  sessions aliases                      List all aliases
  sessions help                         This help

Everyday: sessions load <alias>            (full context, default budget)
With topic: sessions load <alias> --topic "frontline licensing"
Merge prior sessions: sessions merge <alias> --topic "frontline"
`;

module.exports = {
  parseBudget,
  parseSince,
  encodeWorktreePath,
  findNativeTranscripts,
  extractDialog,
  filterByTopic,
  loadSessionWithHistory,
  mergeSessions,
  renderLoadOutput,
  HELP,
  // re-export upstream for the slash command's convenience
  upstream: { sm, aa },
};
