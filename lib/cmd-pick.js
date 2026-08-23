'use strict';

// Commands that edit the manifest's sources and entries: src, ls, pick, unpick, fork, own.

const fs = require('fs');
const path = require('path');
const { walk, hashPath, copyFile, copyDirMirror, removePath, ensureParent } = require('./fsutil');
const {
  CUSTOM_SRC, loadManifest, saveManifest, isDirPath, destFor, entryDest, findEntry, validateDest, makeEntry,
} = require('./manifest');
const src = require('./sources');
const { STATES, evaluate, sourcePathOf, installedPathOf, sourceHashOf } = require('./state');
const { loadFragment, leavesOf, removeLeaves, loadSettings, saveSettings } = require('./settings');

// ─── src ─────────────────────────────────────────────────────────────

function cmdSrc(ctx, args, log) {
  const [sub, name, repo, ...rest] = args;
  let m = loadManifest(ctx);
  if (sub === 'ls' || !sub) {
    for (const [n, s] of Object.entries(m.sources)) {
      const count = m.entries.filter((e) => e.src === n).length;
      const where = s.local ? ctx.customDir : `${s.repo} @ ${s.sha || '(unpinned)'}${s.dir ? ` dir=${s.dir}` : ''}`;
      log(`  ${n.padEnd(12)} ${String(count).padStart(3)} entries  ${where}${!s.local && !src.isCloned(ctx, n) ? '  [not cloned]' : ''}`);
    }
    return;
  }
  if (sub === 'add') {
    if (!name || !repo) throw new Error('usage: src add <name> <repo-url> [--ref <ref>] [--dir <subdir>]');
    const opt = (flag) => { const i = rest.indexOf(flag); return i >= 0 ? rest[i + 1] : undefined; };
    m = src.addSource(m, name, repo, { ref: opt('--ref'), dir: opt('--dir') });
    src.ensureClone(ctx, m, name);
    m.sources[name].sha = src.headSha(ctx, name);
    saveManifest(ctx, m);
    log(`added source ${name} pinned at ${m.sources[name].sha}`);
    return;
  }
  if (sub === 'rm') {
    if (!name) throw new Error('usage: src rm <name>');
    m = src.removeSource(m, name);
    saveManifest(ctx, m);
    log(`removed source ${name} (clone left at ${src.cloneDir(ctx, name)})`);
    return;
  }
  if (sub === 'update') {
    const names = name ? [name] : Object.keys(m.sources).filter((n) => !m.sources[n].local);
    for (const n of names) {
      const sha = src.updateClone(ctx, m, n);
      const pin = m.sources[n].sha;
      log(`  ${n.padEnd(12)} HEAD ${sha}${pin && pin !== sha ? `  (pin ${pin.slice(0, 12)}; run diff, then accept)` : pin ? '  (at pin)' : ''}`);
      if (!pin) { m.sources[n].sha = sha; saveManifest(ctx, m); }
    }
    return;
  }
  throw new Error(`unknown src subcommand: ${sub}`);
}

// ─── ls ──────────────────────────────────────────────────────────────

function cmdLs(ctx, args, log) {
  const [name, prefix] = args;
  const m = loadManifest(ctx);
  if (!name) {
    for (const e of m.entries) log(`  ${e.src.padEnd(12)} ${entryDest(e)}${e.forkedFrom ? `  (forked from ${e.forkedFrom.src}:${e.forkedFrom.path})` : ''}`);
    log(`\n${m.entries.length} entries`);
    return;
  }
  src.requireReadable(ctx, m, name);
  const root = src.sourceRoot(ctx, m, name);
  const picked = new Set(m.entries.filter((e) => e.src === name).map((e) => e.path.replace(/\/$/, '')));
  const pickedDir = (f) => [...picked].some((p) => f.startsWith(`${p}/`));
  for (const f of walk(root)) {
    if (prefix && !f.startsWith(prefix)) continue;
    log(`  ${picked.has(f) || pickedDir(f) ? '*' : ' '} ${f}`);
  }
  log('\n  * = picked');
}

// ─── pick / unpick ───────────────────────────────────────────────────

function cmdPick(ctx, args, log) {
  const asIdx = args.indexOf('--as');
  const as = asIdx >= 0 ? args[asIdx + 1] : undefined;
  const positional = asIdx >= 0 ? args.filter((a, i) => i !== asIdx && i !== asIdx + 1) : args;
  const [name, ...paths] = positional;
  if (!name || paths.length === 0) throw new Error('usage: pick <src> <path> [path...] [--as <name>]');
  if (as && paths.length > 1) throw new Error('--as applies to exactly one path');
  const m = loadManifest(ctx);
  src.requireReadable(ctx, m, name);
  const root = src.sourceRoot(ctx, m, name);
  for (const p of paths) {
    const full = path.join(root, p);
    if (!fs.existsSync(full)) throw new Error(`not found in ${name}: ${p}`);
    const isDir = fs.statSync(full).isDirectory();
    const normPath = isDir ? `${p.replace(/\/$/, '')}/` : p;
    const dest = destFor(normPath, as);
    validateDest(m, dest, name);
    const entry = makeEntry({ src: name, path: normPath, dest });
    entry.hash = sourceHashOf(ctx, m, entry);
    m.entries.push(entry);
    log(`  + ${name}:${normPath} -> ${dest}`);
  }
  saveManifest(ctx, m);
  log("run 'sync' to install");
}

function cmdUnpick(ctx, args, log) {
  const force = args.includes('--force');
  const dests = args.filter((a) => !a.startsWith('--'));
  if (dests.length === 0) throw new Error('usage: unpick <dest> [dest...] [--force]');
  const m = loadManifest(ctx);
  for (const d of dests) {
    const e = findEntry(m, d);
    if (!e) throw new Error(`not picked: ${d}`);
    if (e.kind !== 'settings' && !force) {
      const { state } = evaluate(ctx, m, e);
      if (state === STATES.LOCAL_MODIFIED || state === STATES.CONFLICT) {
        throw new Error(`${d} is ${state}; unpick would delete the only copy of the local edits. 'fork ${d}' keeps them, 'unpick ${d} --force' deletes them`);
      }
    }
    if (e.kind === 'settings') {
      const leaves = leavesOf(loadFragment(sourcePathOf(ctx, m, e)));
      const otherOwned = m.entries.filter((x) => x !== e && x.kind === 'settings').flatMap((x) => leavesOf(loadFragment(sourcePathOf(ctx, m, x))));
      const toRemove = leaves.filter((l) => !otherOwned.includes(l));
      saveSettings(ctx, removeLeaves(loadSettings(ctx), toRemove));
      m.settingsOwned = m.settingsOwned.filter((l) => !toRemove.includes(l));
      log(`  - ${entryDest(e)} (removed ${toRemove.length} owned settings leaves)`);
    } else {
      removePath(installedPathOf(ctx, e));
      log(`  - ${entryDest(e)} (removed from ${ctx.claudeHome})`);
    }
    m.entries = m.entries.filter((x) => x !== e);
  }
  saveManifest(ctx, m);
}

// ─── fork: move a picked entry into custom/ with provenance ──────────

function cmdFork(ctx, args, log) {
  const [d] = args;
  if (!d) throw new Error('usage: fork <dest>');
  const m = loadManifest(ctx);
  const e = findEntry(m, d);
  if (!e) throw new Error(`not picked: ${d}`);
  if (e.src === CUSTOM_SRC) throw new Error(`${d} is already custom`);
  if (e.kind === 'settings') throw new Error('settings fragments cannot be forked; edit the fragment in custom/settings');
  const dest = entryDest(e);
  const customPath = path.join(ctx.customDir, dest);
  if (fs.existsSync(customPath)) throw new Error(`custom/${dest} already exists`);
  const isDir = isDirPath(e.path);
  // The fork keeps what is installed (it may carry local edits); fall back to the source.
  const installed = installedPathOf(ctx, e);
  const from = fs.existsSync(installed) ? installed : sourcePathOf(ctx, m, e);
  if (isDir) copyDirMirror(from, customPath);
  else copyFile(from, customPath);
  // Base = the entry's recorded hash (what was last reviewed), not the clone HEAD, so
  // upstream commits between the base and an updated clone still surface as FORK-DRIFT.
  const forkedFrom = { src: e.src, path: e.path, hash: e.hash || sourceHashOf(ctx, m, e) };
  const entry = makeEntry({ src: CUSTOM_SRC, path: dest, hash: hashPath(customPath, isDir), forkedFrom });
  m.entries = m.entries.filter((x) => x !== e).concat(entry);
  saveManifest(ctx, m);
  log(`forked ${e.src}:${e.path} -> custom/${dest} (forkedFrom.hash ${forkedFrom.hash})`);
}

// ─── own: create a new custom file ──────────────────────────────────

const TEMPLATES = {
  rules: (n) => `# ${n}\n\n> Custom rule.\n\n## Guidelines\n\n- \n`,
  commands: (n) => `---\ndescription: Describe what this command does\n---\n\n# ${n}\n\n`,
  skills: (n) => `---\nname: ${n}\ndescription: \n---\n\n# ${n}\n\n## When to Use\n\n## How It Works\n\n## Examples\n\n`,
  agents: (n) => `---\nname: ${n}\ndescription: \ntools: Read, Grep, Glob, Bash\nmodel: opus\n---\n\n# ${n}\n\n`,
  settings: () => '{\n}\n',
};

function cmdOwn(ctx, args, log) {
  const [p] = args;
  if (!p || isDirPath(p)) throw new Error('usage: own <file path under custom/>');
  const m = loadManifest(ctx);
  const customPath = path.join(ctx.customDir, p);
  if (fs.existsSync(customPath)) throw new Error(`refusing to overwrite existing file: custom/${p}`);
  validateDest(m, destFor(p), CUSTOM_SRC);
  const kind = p.split('/')[0];
  const base = kind === 'skills' ? p.split('/')[1] : path.basename(p, path.extname(p));
  ensureParent(customPath);
  fs.writeFileSync(customPath, (TEMPLATES[kind] || ((n) => `# ${n}\n\n`))(base));
  m.entries.push(makeEntry({ src: CUSTOM_SRC, path: p, hash: null }));
  saveManifest(ctx, m);
  log(`created custom/${p}; edit it, then run 'sync'`);
}

module.exports = { cmdSrc, cmdLs, cmdPick, cmdUnpick, cmdFork, cmdOwn };
