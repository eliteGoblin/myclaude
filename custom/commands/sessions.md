---
description: Manage Claude Code session history (Frank's extended build — context-rich load by default).
---

# Sessions Command (Frank's extended build)

Manage Claude Code sessions in `~/.claude/session-data/`. Default `load` is **context-rich**: combines the `.tmp` summary with Claude-native JSONL transcripts under `~/.claude/projects/<encoded-cwd>/`, up to a token budget.

Routes all logic through `~/.claude/scripts/lib/session-manager-fsun.js` (custom overlay; upstream untouched).

## Usage

```
/sessions                             # list recent sessions
/sessions list [opts]                 # list with filters
/sessions load <id|alias> [opts]      # context-rich load (default)
/sessions merge <id|alias> [opts]     # append siblings into target .tmp
/sessions info <id|alias>             # session details
/sessions alias <id> <name>           # create alias
/sessions alias --remove <name>       # remove alias
/sessions aliases                     # list aliases
/sessions help                        # full reference
```

### Load flags
- `--no-history`            metadata + .tmp summary only (the upstream behavior)
- `--topic "<keyword>"`     LLM filter native transcripts (uses `claude -p`)
- `--budget 500K | 1M`      token budget (default 500K, accepts K/M shorthand or raw int)
- `--since 7d | 24h | 2w`   only transcripts modified within window
- `--no-llm`                keyword-only filter (skip LLM)

### Merge flags
- `--topic "<keyword>"`     only merge siblings whose content matches
- `--dry-run`               preview without writing

---

## Help

```bash
node -e "
const fsun = require(require('os').homedir() + '/.claude/scripts/lib/session-manager-fsun');
console.log(fsun.HELP);
"
```

## List

```bash
node -e "
const sm = require(require('os').homedir() + '/.claude/scripts/lib/session-manager');
const aa = require(require('os').homedir() + '/.claude/scripts/lib/session-aliases');
const path = require('path');

const args = process.argv.slice(1);
const opts = { limit: 50 };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit') opts.limit = parseInt(args[++i], 10);
  else if (args[i] === '--date') opts.date = args[++i];
  else if (args[i] === '--search') opts.search = args[++i];
}

const result = sm.getAllSessions(opts);
const aliasMap = {};
for (const a of aa.listAliases()) aliasMap[a.sessionPath] = a.name;

console.log('Sessions (showing ' + result.sessions.length + ' of ' + result.total + '):');
console.log('');
console.log('ID        Date        Time     Branch       Worktree           Alias');
console.log('────────────────────────────────────────────────────────────────────');
for (const s of result.sessions) {
  const meta = sm.parseSessionMetadata(sm.getSessionContent(s.sessionPath));
  const id = s.shortId === 'no-id' ? '(none)' : s.shortId.slice(0, 14);
  const time = s.modifiedTime.toTimeString().slice(0, 5);
  const branch = (meta.branch || '-').slice(0, 12);
  const worktree = meta.worktree ? path.basename(meta.worktree).slice(0, 18) : '-';
  console.log(id.padEnd(14) + ' ' + s.date + '  ' + time + '   ' + branch.padEnd(12) + ' ' + worktree.padEnd(18) + ' ' + (aliasMap[s.filename] || ''));
}
" "$@"
```

## Load (context-rich by default)

```bash
node -e "
const fsun = require(require('os').homedir() + '/.claude/scripts/lib/session-manager-fsun');
const args = process.argv.slice(1);
const id = args[0];
if (!id) { console.error('Usage: sessions load <id|alias> [--no-history] [--topic K] [--budget 500K] [--since 7d] [--no-llm]'); process.exit(1); }
const opts = {};
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--no-history') opts.noHistory = true;
  else if (args[i] === '--no-llm') opts.useLLM = false;
  else if (args[i] === '--topic') opts.topic = args[++i];
  else if (args[i] === '--budget') opts.budget = args[++i];
  else if (args[i] === '--since') opts.since = args[++i];
}
const result = fsun.loadSessionWithHistory(id, opts);
process.stdout.write(fsun.renderLoadOutput(result));
" "$@"
```

## Merge

```bash
node -e "
const fsun = require(require('os').homedir() + '/.claude/scripts/lib/session-manager-fsun');
const args = process.argv.slice(1);
const id = args[0];
if (!id) { console.error('Usage: sessions merge <id|alias> [--topic K] [--dry-run]'); process.exit(1); }
const opts = {};
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--topic') opts.topic = args[++i];
  else if (args[i] === '--dry-run') opts.dryRun = true;
}
const r = fsun.mergeSessions(id, opts);
if (r.error) { console.error('ERROR: ' + r.error); process.exit(1); }
if (!r.merged) { console.log(r.reason); process.exit(0); }
console.log((r.dryRun ? '[DRY RUN] ' : '') + 'Merged ' + r.siblingCount + ' sibling(s) into ' + r.targetPath);
console.log('Appended ~' + r.appendedChars.toLocaleString() + ' chars from:');
for (const f of r.siblings) console.log('  - ' + f);
" "$@"
```

## Info

```bash
node -e "
const sm = require(require('os').homedir() + '/.claude/scripts/lib/session-manager');
const aa = require(require('os').homedir() + '/.claude/scripts/lib/session-aliases');
const id = process.argv[1];
const resolved = aa.resolveAlias(id);
const sid = resolved ? resolved.sessionPath : id;
const session = sm.getSessionById(sid, true);
if (!session) { console.log('Session not found: ' + id); process.exit(1); }
const stats = sm.getSessionStats(session.sessionPath);
const aliases = aa.getAliasesForSession(session.filename);
console.log('Session Information');
console.log('Filename: ' + session.filename);
console.log('Path:     ' + session.sessionPath);
console.log('Date:     ' + session.date);
console.log('Modified: ' + session.modifiedTime.toISOString().slice(0, 19).replace('T', ' '));
console.log('Project:  ' + (session.metadata.project || '-'));
console.log('Branch:   ' + (session.metadata.branch || '-'));
console.log('Worktree: ' + (session.metadata.worktree || '-'));
console.log('Lines:    ' + stats.lineCount);
console.log('Size:     ' + sm.getSessionSize(session.sessionPath));
if (aliases.length) console.log('Aliases:  ' + aliases.map(a => a.name).join(', '));
" "$@"
```

## Alias

```bash
node -e "
const sm = require(require('os').homedir() + '/.claude/scripts/lib/session-manager');
const aa = require(require('os').homedir() + '/.claude/scripts/lib/session-aliases');
const args = process.argv.slice(1);
if (args[0] === '--remove') {
  const r = aa.deleteAlias(args[1]); if (r.success) console.log('Removed: ' + args[1]); else console.log('Error: ' + r.error);
} else {
  const session = sm.getSessionById(args[0]);
  if (!session) { console.log('Session not found: ' + args[0]); process.exit(1); }
  const r = aa.setAlias(args[1], session.filename);
  if (r.success) console.log('Alias: ' + args[1] + ' -> ' + session.filename); else console.log('Error: ' + r.error);
}
" "$@"
```

## Aliases

```bash
node -e "
const aa = require(require('os').homedir() + '/.claude/scripts/lib/session-aliases');
const aliases = aa.listAliases();
console.log('Session Aliases (' + aliases.length + '):');
for (const a of aliases) console.log('  ' + a.name.padEnd(20) + ' -> ' + a.sessionPath);
"
```

## Notes

- **Subdirectories supported** in `~/.claude/session-data/` (e.g. `usage/2026-...-session.tmp`) — upstream walker handles flat dir today; recursive walk planned (see fsun_config/docs/sessions-extended.md).
- **LLM topic filter** shells out to `claude -p` per candidate transcript. If `claude` is unavailable or fails, falls back to keyword scoring with a warning.
- **Token budget** is approximate (4 chars/token English estimate). Tune via `--budget` if you hit context limits.
- **Aliases** are stored in `~/.claude/session-aliases.json` (upstream).
