'use strict';

// Manifest v2: load, save, paths (ctx), dest mapping, entry lookup, v1 migration.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readJson, writeJson, hashFile } = require('./fsutil');

const MANIFEST_VERSION = 2;
const CUSTOM_SRC = 'custom';
const RESERVED_DEST_PREFIX = 'skills/synced/';

const DEFAULT_SOURCES = {
  ecc: { repo: 'https://github.com/affaan-m/everything-claude-code.git', ref: 'main' },
  karpathy: { repo: 'https://github.com/forrestchang/andrej-karpathy-skills.git', ref: 'main' },
  mattpocock: { repo: 'https://github.com/mattpocock/skills.git', ref: 'main' },
};

// ctx = every absolute path the tool touches. Built once from env so tests can redirect it.
function buildCtx(overrides = {}) {
  const home = process.env.HOME || os.homedir();
  const repoRoot = overrides.repoRoot || path.resolve(__dirname, '..');
  return {
    repoRoot,
    manifestPath: path.join(repoRoot, 'manifest.json'),
    customDir: path.join(repoRoot, CUSTOM_SRC),
    claudeHome: overrides.claudeHome || process.env.MYCLAUDE_CLAUDE_HOME || path.join(home, '.claude'),
    sourcesDir: overrides.sourcesDir || process.env.MYCLAUDE_SOURCES_DIR || path.join(home, '.myclaude', 'sources'),
  };
}

function emptyManifest() {
  return {
    version: MANIFEST_VERSION,
    sources: { [CUSTOM_SRC]: { local: true } },
    entries: [],
    settingsOwned: [],
    lastSync: null,
  };
}

function loadManifest(ctx) {
  const m = readJson(ctx.manifestPath, null);
  if (!m) return emptyManifest();
  if (m.version !== MANIFEST_VERSION) {
    throw new Error(`manifest.json is not v${MANIFEST_VERSION} (found version=${m.version}). Run: myclaude.js migrate-v1 --ecc-sha <sha>`);
  }
  if (!m.sources) m.sources = {};
  if (!m.sources[CUSTOM_SRC]) m.sources[CUSTOM_SRC] = { local: true };
  if (!Array.isArray(m.entries)) m.entries = [];
  if (!Array.isArray(m.settingsOwned)) m.settingsOwned = [];
  return m;
}

function saveManifest(ctx, m) {
  const sorted = {
    ...m,
    entries: [...m.entries].sort((a, b) => (a.src + a.path).localeCompare(b.src + b.path)),
  };
  writeJson(ctx.manifestPath, sorted);
}

function isDirPath(p) {
  return p.endsWith('/');
}

function isSettingsPath(p) {
  return p.startsWith('settings/') && p.endsWith('.json');
}

// dest rule: skills/<category>/<name>/ → skills/<name>/ (user scope is flat); every other path 1:1.
// `as` replaces the last path segment (file name or skill dir name).
function destFor(srcPath, as) {
  let dest = srcPath;
  if (srcPath.startsWith('skills/') && isDirPath(srcPath)) {
    const segs = srcPath.replace(/\/$/, '').split('/');
    dest = `skills/${segs[segs.length - 1]}/`;
  }
  if (as) {
    const dir = isDirPath(dest);
    const segs = dest.replace(/\/$/, '').split('/');
    segs[segs.length - 1] = as;
    dest = segs.join('/') + (dir ? '/' : '');
  }
  return dest;
}

function entryDest(e) {
  return e.dest || e.path;
}

function findEntry(m, dest) {
  const norm = dest.replace(/\/$/, '');
  return m.entries.find((e) => entryDest(e).replace(/\/$/, '') === norm) || null;
}

// Two dests overlap when one is a directory entry and the other lives inside it.
function destsOverlap(a, b) {
  if (a === b) return false;
  return (isDirPath(a) && b.startsWith(a)) || (isDirPath(b) && a.startsWith(b));
}

// First overlapping dest pair among non-settings entries, or null.
function findDestOverlap(m) {
  const dests = m.entries.filter((e) => e.kind !== 'settings').map(entryDest);
  for (let i = 0; i < dests.length; i++) {
    for (let j = i + 1; j < dests.length; j++) {
      if (destsOverlap(dests[i], dests[j])) return [dests[i], dests[j]];
    }
  }
  return null;
}

function validateDest(m, dest, src) {
  if (dest.startsWith(RESERVED_DEST_PREFIX)) throw new Error(`dest ${dest} is reserved (${RESERVED_DEST_PREFIX})`);
  const existing = findEntry(m, dest);
  if (existing && existing.src !== src) {
    throw new Error(`dest ${dest} already provided by source ${existing.src} (use --as <name>)`);
  }
  if (existing) throw new Error(`already picked: ${dest}`);
  for (const e of m.entries) {
    if (e.kind === 'settings') continue;
    const d = entryDest(e);
    if (destsOverlap(d, dest)) throw new Error(`dest ${dest} overlaps entry ${d}; a directory entry and a file inside it cannot both be managed`);
  }
}

function makeEntry({ src, path: p, dest, hash, forkedFrom }) {
  const e = { src, path: p };
  const d = dest || destFor(p);
  if (d !== p) e.dest = d;
  e.hash = hash || null;
  if (isSettingsPath(p)) e.kind = 'settings';
  if (forkedFrom) e.forkedFrom = forkedFrom;
  return e;
}

// ─── v1 → v2 migration ───────────────────────────────────────────────
// v1 = { upstream[], bible[], custom[], hashes{path:hash}, lastSync }.
// upstream → src ecc, bible → src karpathy, custom → src custom.
// v1 copied custom files verbatim and kept no base hash, so the installed copy is the last synced
// base: custom hash = installed file hash when present, else the repo file hash.
// A path present in both upstream and custom becomes a custom entry with forkedFrom ecc.
function migrateV1(ctx, v1, { eccSha, karpathySha }) {
  if (v1.version === MANIFEST_VERSION) throw new Error('manifest is already v2');
  if (!/^[0-9a-f]{40}$/.test(eccSha || '')) throw new Error('--ecc-sha <40-char sha> is required');
  const hashes = v1.hashes || {};
  const customSet = new Set(v1.custom || []);
  const m = emptyManifest();
  m.sources = {
    ecc: { ...DEFAULT_SOURCES.ecc, sha: eccSha },
    karpathy: { ...DEFAULT_SOURCES.karpathy, sha: karpathySha || null },
    mattpocock: { ...DEFAULT_SOURCES.mattpocock, sha: null },
    [CUSTOM_SRC]: { local: true },
  };
  for (const p of v1.upstream || []) {
    if (customSet.has(p)) continue; // resolved below as a custom fork
    m.entries.push(makeEntry({ src: 'ecc', path: p, hash: hashes[p] || null }));
  }
  for (const p of v1.bible || []) {
    m.entries.push(makeEntry({ src: 'karpathy', path: p, hash: hashes[p] || null }));
  }
  for (const p of customSet) {
    const forkedFrom = (v1.upstream || []).includes(p) ? { src: 'ecc', path: p, hash: hashes[p] || null } : undefined;
    const hash = hashFile(path.join(ctx.claudeHome, p)) || hashFile(path.join(ctx.customDir, p));
    m.entries.push(makeEntry({ src: CUSTOM_SRC, path: p, hash, forkedFrom }));
  }
  m.lastSync = v1.lastSync || null;
  return m;
}

function manifestExists(ctx) {
  return fs.existsSync(ctx.manifestPath);
}

module.exports = {
  MANIFEST_VERSION,
  CUSTOM_SRC,
  DEFAULT_SOURCES,
  buildCtx,
  emptyManifest,
  loadManifest,
  saveManifest,
  manifestExists,
  isDirPath,
  isSettingsPath,
  destFor,
  entryDest,
  findEntry,
  validateDest,
  destsOverlap,
  findDestOverlap,
  makeEntry,
  migrateV1,
};
