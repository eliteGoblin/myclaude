'use strict';

// Commands that compare and apply: diff, accept, sync, install, status, migrate-v1.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { walk, copyFile, copyDirMirror, readJson, writeJson } = require('./fsutil');
const {
  CUSTOM_SRC, loadManifest, saveManifest, isDirPath, entryDest, findEntry, findDestOverlap, migrateV1,
} = require('./manifest');
const src = require('./sources');
const { STATES, evaluate, evaluateAll, sourcePathOf, installedPathOf } = require('./state');
const settings = require('./settings');
const router = require('./cmd-router');

const MANAGED_DIRS = ['agents', 'commands', 'rules', 'skills', 'scripts'];
// Paths the Claude app owns inside MANAGED_DIRS. myclaude never writes them and status does not report them.
const NEVER_TOUCH_PREFIXES = ['skills/synced/', 'skills/.trash/'];

function fmt(r) {
  const drift = r.drift ? `  ${STATES.FORK_DRIFT}: ${r.drift.src}:${r.drift.path} ${r.drift.was} -> ${r.drift.now}` : '';
  return `  ${r.state.padEnd(17)} ${r.entry.src.padEnd(11)} ${r.dest}${drift}`;
}

// ─── diff ────────────────────────────────────────────────────────────

function unifiedDiff(labelA, fileA, labelB, fileB) {
  try {
    return execFileSync('git', ['diff', '--no-index', '--no-color', `--src-prefix=${labelA}/`, `--dst-prefix=${labelB}/`, fileA, fileB], { encoding: 'utf8' });
  } catch (err) {
    return err.stdout || String(err.message);
  }
}

function contentDiff(ctx, m, r) {
  const e = r.entry;
  if (e.kind === 'settings') {
    const { fragment } = settings.settingsHashes(ctx, sourcePathOf(ctx, m, e));
    const live = settings.project(settings.loadSettings(ctx), fragment);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myclaude-'));
    writeJson(path.join(tmp, 'installed.json'), settings.canonical(live));
    writeJson(path.join(tmp, 'source.json'), settings.canonical(fragment));
    return unifiedDiff('installed', path.join(tmp, 'installed.json'), 'source', path.join(tmp, 'source.json'));
  }
  return unifiedDiff('installed', installedPathOf(ctx, e), 'source', sourcePathOf(ctx, m, e));
}

function cmdDiff(ctx, args, log) {
  const content = args.includes('--content');
  const filter = args.find((a) => !a.startsWith('--'));
  const m = loadManifest(ctx);
  const results = evaluateAll(ctx, m).filter((r) => !filter || r.entry.src === filter || r.dest.replace(/\/$/, '') === filter.replace(/\/$/, ''));
  const interesting = results.filter((r) => r.state !== STATES.CURRENT || r.drift);
  for (const r of interesting) {
    log(fmt(r));
    if (content && r.state !== STATES.MISSING && r.state !== STATES.DELETED_UPSTREAM) log(contentDiff(ctx, m, r));
  }
  const counts = {};
  for (const r of results) counts[r.state] = (counts[r.state] || 0) + 1;
  log(`\n${results.length} entries: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}${interesting.some((r) => r.drift) ? `, ${interesting.filter((r) => r.drift).length} ${STATES.FORK_DRIFT}` : ''}`);
  return results;
}

// ─── apply one entry (copy source -> installed, record hash) ─────────

function applyEntry(ctx, m, r) {
  const e = r.entry;
  if (e.kind === 'settings') return; // applied in one pass by applySettings
  const from = sourcePathOf(ctx, m, e);
  const to = installedPathOf(ctx, e);
  if (isDirPath(e.path)) copyDirMirror(from, to);
  else copyFile(from, to);
}

function applySettings(ctx, m) {
  const fragments = m.entries.filter((e) => e.kind === 'settings').map((e) => sourcePathOf(ctx, m, e));
  const { merged, owned, stale } = settings.applyFragments(ctx, fragments, m.settingsOwned);
  settings.saveSettings(ctx, merged);
  return { ...m, settingsOwned: owned, stale };
}

// ─── accept ──────────────────────────────────────────────────────────

function acceptOne(ctx, m, r, log) {
  const e = r.entry;
  if (r.state === STATES.UPSTREAM_CHANGED) {
    applyEntry(ctx, m, r);
    e.hash = r.S;
    log(`  accepted ${e.src}:${r.dest} -> ${r.S}`);
  } else if (r.drift) {
    e.forkedFrom = { ...e.forkedFrom, hash: r.drift.now };
    log(`  accepted fork drift ${r.dest} (forkedFrom.hash -> ${r.drift.now})`);
  } else {
    throw new Error(`${r.dest} is ${r.state}; accept applies only to ${STATES.UPSTREAM_CHANGED} or ${STATES.FORK_DRIFT}`);
  }
  return e.src;
}

function cmdAccept(ctx, args, log) {
  const m = loadManifest(ctx);
  const all = args.includes('--all');
  const dest = args.find((a) => !a.startsWith('--'));
  if (!all && !dest) throw new Error('usage: accept <dest> | accept --all');
  const results = evaluateAll(ctx, m);
  const targets = all
    ? results.filter((r) => r.state === STATES.UPSTREAM_CHANGED || r.drift)
    : results.filter((r) => r.entry === findEntry(m, dest));
  if (!all && targets.length === 0) throw new Error(`not picked: ${dest}`);
  const touched = new Set();
  for (const r of targets) touched.add(acceptOne(ctx, m, r, log));
  let next = m;
  if (targets.some((r) => r.entry.kind === 'settings')) next = applySettings(ctx, m);
  // Move the pin of every touched remote source to the clone HEAD that was accepted.
  for (const name of touched) {
    if (name !== CUSTOM_SRC && src.isCloned(ctx, name)) next.sources[name].sha = src.headSha(ctx, name);
  }
  delete next.stale;
  saveManifest(ctx, next);
  log(`${targets.length} accepted`);
}

// ─── sync ────────────────────────────────────────────────────────────

function planAction(r, force) {
  switch (r.state) {
    case STATES.CURRENT: return 'skip';
    case STATES.MISSING: return 'copy';
    case STATES.CONVERGED: return 'record';
    case STATES.UPSTREAM_CHANGED: return r.entry.src === CUSTOM_SRC ? 'copy' : 'needs-accept';
    case STATES.LOCAL_MODIFIED:
    case STATES.CONFLICT: return force ? 'copy' : 'refuse';
    case STATES.DELETED_UPSTREAM: return 'report';
    default: return 'skip';
  }
}

function cmdSync(ctx, args, log) {
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const m = loadManifest(ctx);
  const atPin = {};
  for (const name of Object.keys(m.sources)) {
    src.requireReadable(ctx, m, name);
    const s = m.sources[name];
    atPin[name] = Boolean(s.local) || !s.sha || src.headSha(ctx, name) === s.sha;
  }
  const overlap = findDestOverlap(m);
  if (overlap) throw new Error(`entries ${overlap[0]} and ${overlap[1]} manage overlapping paths; unpick one before sync`);
  const results = evaluateAll(ctx, m);
  const counts = { copy: 0, record: 0, refuse: 0, 'needs-accept': 0, report: 0, skip: 0 };
  if (force && !dryRun) {
    const clobber = results.filter((r) => planAction(r, false) === 'refuse');
    if (clobber.length) {
      log(`--force will overwrite ${clobber.length} ${STATES.LOCAL_MODIFIED}/${STATES.CONFLICT} entr${clobber.length === 1 ? 'y' : 'ies'}:`);
      for (const r of clobber) log(`  ${r.state.padEnd(17)} ${r.dest}`);
    }
  }
  let settingsRefused = false;
  for (const r of results) {
    let action = planAction(r, force);
    // A copy or hash record from a clone that is not at its pin would silently install unreviewed content.
    if ((action === 'copy' || action === 'record') && !atPin[r.entry.src]) action = 'refuse-unpinned';
    counts[action === 'refuse-unpinned' ? 'refuse' : action]++;
    if (action === 'skip') continue;
    if (action === 'refuse-unpinned') {
      log(`  refuse        ${fmt(r).trim()}  (clone of ${r.entry.src} is not at its pin; 'accept' the change or 'install' to restore the pin)`);
      continue;
    }
    log(`  ${action.padEnd(13)} ${fmt(r).trim()}`);
    if (action === 'refuse' && r.entry.kind === 'settings') settingsRefused = true;
    if (dryRun || action === 'refuse' || action === 'needs-accept' || action === 'report') continue;
    if (action === 'copy' && r.entry.kind !== 'settings') applyEntry(ctx, m, r);
    r.entry.hash = r.S;
  }
  let next = m;
  // The settings file is rewritten as one merge of every fragment; a refused fragment blocks the whole merge.
  if (!dryRun && !settingsRefused && m.entries.some((e) => e.kind === 'settings')) {
    next = applySettings(ctx, m);
    if (next.stale.length) log(`  removed ${next.stale.length} stale owned settings leaves`);
    delete next.stale;
  }
  log(`\n${dryRun ? '[dry-run] ' : ''}${counts.copy} copied, ${counts.record} recorded, ${counts.skip} current, ${counts['needs-accept']} awaiting accept, ${counts.report} deleted upstream, ${counts.refuse} refused`);
  if (counts.refuse) log("refused entries are LOCAL-MODIFIED or CONFLICT: run 'diff --content', then 'fork <dest>' to keep the local edit or 'sync --force' to overwrite it (a partially copied directory left by an interrupted sync also shows here; 'sync --force' repairs it)");
  if (!dryRun) {
    next.lastSync = new Date().toISOString();
    saveManifest(ctx, next);
    router.writeSourcesFile(ctx, next, log);
  }
  return counts.refuse === 0;
}

// ─── install / status ────────────────────────────────────────────────

function cmdInstall(ctx, args, log) {
  const m = loadManifest(ctx);
  for (const name of Object.keys(m.sources)) {
    if (m.sources[name].local) continue;
    log(`  clone ${name} @ ${m.sources[name].sha || 'ref tip'}`);
    src.ensureClone(ctx, m, name);
    if (!m.sources[name].sha) m.sources[name].sha = src.headSha(ctx, name);
  }
  saveManifest(ctx, m);
  return cmdSync(ctx, args, log);
}

function cmdStatus(ctx, args, log) {
  const m = loadManifest(ctx);
  log('sources:');
  for (const [n, s] of Object.entries(m.sources)) {
    if (s.local) continue;
    const cloned = src.isCloned(ctx, n);
    const head = cloned ? src.headSha(ctx, n) : null;
    log(`  ${n.padEnd(12)} pin ${s.sha ? s.sha.slice(0, 12) : '(none)'}  clone ${cloned ? (head === s.sha ? 'at pin' : `HEAD ${head.slice(0, 12)} (ahead of pin)`) : 'MISSING'}`);
  }
  log('\nentries:');
  const results = evaluateAll(ctx, m);
  const counts = {};
  for (const r of results) counts[r.state] = (counts[r.state] || 0) + 1;
  for (const [k, v] of Object.entries(counts)) log(`  ${k.padEnd(17)} ${v}`);
  const managed = new Set();
  for (const e of m.entries) {
    if (e.kind === 'settings') continue;
    const d = entryDest(e);
    if (isDirPath(d)) walk(path.join(ctx.claudeHome, d)).forEach((f) => managed.add(`${d}${f}`));
    else managed.add(d);
  }
  // Files in the claude home that myclaude does not own (other layers): listed, never written, moved, or deleted.
  const unmanaged = MANAGED_DIRS.flatMap((d) => walk(path.join(ctx.claudeHome, d)).map((f) => `${d}/${f}`)).filter((f) => !managed.has(f) && f !== 'skills/SOURCES.md' && !NEVER_TOUCH_PREFIXES.some((p) => f.startsWith(p)));
  log(`\nother files under ${ctx.claudeHome}/{${MANAGED_DIRS.join(',')}} (not myclaude's; never touched): ${unmanaged.length}`);
  for (const f of unmanaged) log(`  ${f}`);
  log(`\nsettings owned leaves: ${m.settingsOwned.length}; last sync: ${m.lastSync || 'never'}`);
}

// ─── migrate-v1 ──────────────────────────────────────────────────────

function cmdMigrateV1(ctx, args, log) {
  const opt = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const v1 = readJson(ctx.manifestPath, null);
  if (!v1) throw new Error(`no manifest at ${ctx.manifestPath}`);
  const m = migrateV1(ctx, v1, { eccSha: opt('--ecc-sha'), karpathySha: opt('--karpathy-sha') });
  saveManifest(ctx, m);
  const forks = m.entries.filter((e) => e.forkedFrom).map((e) => e.path);
  log(`migrated ${m.entries.length} entries; sources: ${Object.keys(m.sources).join(', ')}; forks: ${forks.join(', ') || 'none'}`);
  log("next: 'src update' to clone sources, then 'diff'");
}

module.exports = { cmdDiff, cmdAccept, cmdSync, cmdInstall, cmdStatus, cmdMigrateV1, planAction, evaluate, NEVER_TOUCH_PREFIXES };
