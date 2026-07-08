---
description: Alias-first session management (Frank's extended build) — switch projects by alias; session IDs stay hidden.
---

# Sessions Command (Frank's extended build, alias-first)

Aliases are the primary handle: **one alias = one project/topic**, owning many
sessions (N:1, tracked in `~/.claude/session-registry.json`). Session IDs are
an implementation detail — shown only in `list --verbose`. New sessions are
auto-assigned to their folder's alias; a folder with two aliases stays a
manual decision (both candidates are listed).

Logic routes through `~/.claude/scripts/lib/session-registry-fsun.js` and
`session-manager-fsun.js` (custom overlay; upstream untouched).

## Usage

```
/sessions                              # overview: current alias, alias table, unassigned
/sessions switch <alias> [opts]        # context-rich load of the WHOLE alias
/sessions alias create <name> [path]   # create alias for a folder (default: cwd)
/sessions assign <alias> <file...>     # assign session file(s) to an alias
/sessions rename <old> <new>           # rename an alias (memberships follow)
/sessions unalias <name>               # remove alias (its sessions become unassigned)
/sessions list [--verbose]             # raw session files (legacy view)
/sessions load <id|alias> [opts]       # legacy single-session load
/sessions merge <id|alias> [opts]      # physically append siblings (archival)
/sessions info <id|alias>              # session file details
/sessions help                         # full reference
```

### Switch/load flags
- `--no-history`            summaries only, skip native transcripts
- `--topic "<keyword>"`     LLM filter native transcripts (uses `claude -p`)
- `--budget 500K | 1M`      token budget (default 500K)
- `--since 7d | 24h | 2w`   only transcripts modified within window
- `--no-llm`                keyword-only filter (skip LLM)

---

## Overview (default, no args)

Show current folder's alias, the alias table, and unassigned sessions that
need a decision. Suggest creating aliases for unassigned groups (suggested
name = folder name) and ASK the user to confirm or rename — never create
silently.

```bash
node -e "
const reg = require(require('os').homedir() + '/.claude/scripts/lib/session-registry-fsun');
const cur = reg.currentAliases(process.cwd());
console.log('Current folder alias: ' + (cur.length ? cur.join(', ') : '(none — create one with: sessions alias create <name>)'));
console.log('');
const o = reg.aliasOverview();
console.log('ALIAS                PROJECT                          LAST ACTIVE  SESSIONS');
console.log('--------------------------------------------------------------------------');
for (const r of o.rows) {
  const proj = require('path').basename(r.worktree).slice(0, 32);
  console.log(r.alias.padEnd(20) + ' ' + proj.padEnd(32) + ' ' + String(r.lastActive).padEnd(12) + ' ' + r.sessions);
}
if (o.autoAssigned) console.log('\n(auto-assigned ' + o.autoAssigned + ' new session(s) to their folder alias)');
if (o.unassignedGroups.length) {
  console.log('\nUNASSIGNED - needs your decision:');
  for (const g of o.unassignedGroups) {
    const hint = g.candidates && g.candidates.length
      ? 'folder has multiple aliases: ' + g.candidates.join(', ') + ' — pick one with: sessions assign <alias> <file>'
      : 'suggest: sessions alias create ' + g.suggested + ' \"' + g.worktree + '\"';
    console.log('  ' + g.worktree + '  (' + g.files.length + ' session(s))');
    console.log('    -> ' + hint);
  }
}
"
```

## Switch (context-rich load of an alias)

```bash
node -e "
const reg = require(require('os').homedir() + '/.claude/scripts/lib/session-registry-fsun');
const args = process.argv.slice(1);
const name = args[0];
if (!name) { console.error('Usage: sessions switch <alias> [--topic K] [--budget 500K] [--since 7d] [--no-history] [--no-llm]'); process.exit(1); }
const opts = {};
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--no-history') opts.noHistory = true;
  else if (args[i] === '--no-llm') opts.useLLM = false;
  else if (args[i] === '--topic') opts.topic = args[++i];
  else if (args[i] === '--budget') opts.budget = args[++i];
  else if (args[i] === '--since') opts.since = args[++i];
}
reg.syncRegistry();
process.stdout.write(reg.renderAliasLoad(reg.loadAliasContext(name, opts)));
" "$@"
```

## Alias create / assign / rename / unalias

```bash
node -e "
const reg = require(require('os').homedir() + '/.claude/scripts/lib/session-registry-fsun');
const args = process.argv.slice(1);
const verb = args[0];
let r;
if (verb === 'create')       r = reg.createAlias(args[1], args[2]);
else if (verb === 'assign')  { r = {}; for (const f of args.slice(2)) { r = reg.assignSession(f, args[1]); if (r.error) break; console.log('assigned: ' + f + ' -> ' + args[1]); } }
else if (verb === 'rename')  r = reg.renameAlias(args[1], args[2]);
else if (verb === 'unalias') r = reg.removeAlias(args[1]);
else { console.error('Usage: create <name> [path] | assign <alias> <file...> | rename <old> <new> | unalias <name>'); process.exit(1); }
if (r.error) { console.error('ERROR: ' + r.error); process.exit(1); }
if (r.created) console.log('Created alias ' + r.created + ' -> ' + r.worktree + ' (new sessions there auto-assign)');
if (r.renamed) console.log('Renamed ' + r.renamed + ' -> ' + r.to);
if (r.removed) console.log('Removed ' + r.removed + ' (' + r.sessionsUnassigned + ' session(s) now unassigned; files untouched)');
" "$@"
```

## List (legacy raw view)

Plain `list` groups by alias; `--verbose` adds IDs/filenames.

```bash
node -e "
const sm = require(require('os').homedir() + '/.claude/scripts/lib/session-manager');
const reg = require(require('os').homedir() + '/.claude/scripts/lib/session-registry-fsun');
const verbose = process.argv.includes('--verbose');
const { registry } = reg.syncRegistry();
const result = sm.getAllSessions({ limit: 100 });
for (const s of result.sessions) {
  const alias = registry.sessions[s.filename] || '(unassigned)';
  const id = verbose ? '  [' + s.filename + ']' : '';
  console.log(s.date + '  ' + alias.padEnd(20) + id);
}
" "$@"
```

## Legacy: load / merge / info by id

`load <id|alias>` (single session), `merge <id|alias> [--topic K] [--dry-run]`
(physical append, archival use), and `info <id|alias>` keep working exactly as
before via `session-manager-fsun.js`:

```bash
node -e "
const fsun = require(require('os').homedir() + '/.claude/scripts/lib/session-manager-fsun');
const args = process.argv.slice(1);
const verb = args[0]; const id = args[1];
if (verb === 'load') {
  const opts = {};
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--no-history') opts.noHistory = true;
    else if (args[i] === '--no-llm') opts.useLLM = false;
    else if (args[i] === '--topic') opts.topic = args[++i];
    else if (args[i] === '--budget') opts.budget = args[++i];
    else if (args[i] === '--since') opts.since = args[++i];
  }
  process.stdout.write(fsun.renderLoadOutput(fsun.loadSessionWithHistory(id, opts)));
} else if (verb === 'merge') {
  const opts = {};
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--topic') opts.topic = args[++i];
    else if (args[i] === '--dry-run') opts.dryRun = true;
  }
  const r = fsun.mergeSessions(id, opts);
  if (r.error) { console.error('ERROR: ' + r.error); process.exit(1); }
  if (!r.merged) { console.log(r.reason); process.exit(0); }
  console.log((r.dryRun ? '[DRY RUN] ' : '') + 'Merged ' + r.siblingCount + ' sibling(s) into ' + r.targetPath);
} else if (verb === 'info') {
  const sm = fsun.upstream.sm;
  const session = sm.getSessionById(id, true);
  if (!session) { console.log('Session not found: ' + id); process.exit(1); }
  const stats = sm.getSessionStats(session.sessionPath);
  console.log('Filename: ' + session.filename);
  console.log('Path:     ' + session.sessionPath);
  console.log('Date:     ' + session.date);
  console.log('Lines:    ' + stats.lineCount);
  console.log('Size:     ' + sm.getSessionSize(session.sessionPath));
}
" "$@"
```

## Help

```bash
node -e "
const fsun = require(require('os').homedir() + '/.claude/scripts/lib/session-manager-fsun');
console.log(fsun.HELP);
"
```

## Notes

- **Registry** `~/.claude/session-registry.json` is bookkeeping only — removing
  an alias or a registry entry never deletes session files.
- **Auto-assign** runs on every overview/switch: sessions whose folder maps to
  exactly ONE alias join it silently; ambiguous or unknown folders are surfaced
  for a human decision (suggested name = folder name).
- **Retention**: pruning is disabled via `ECC_SESSION_RETENTION_DAYS=off` in
  settings.json; cleanup is manual and should be confirmed with Frank first.
- **LLM topic filter** shells out to `claude -p`; falls back to keyword scoring.
- Upstream `session-aliases.json` (1:1 file aliases) still exists but is
  superseded by the registry for day-to-day use.
