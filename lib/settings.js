'use strict';

// Settings fragments: settings/*.json partial objects merged into ~/.claude/settings.json.
// Objects merge recursively. hooks.<Event> and permissions.allow/deny/ask arrays are
// unions keyed by identity. Every other value is a leaf where the fragment wins.
// Owned leaves are tracked as path strings so removal touches exactly those and nothing else.

const fs = require('fs');
const path = require('path');
const { readJson, writeJson, shortHash } = require('./fsutil');

const IDENTITY_ARRAYS = [/^hooks\.[^.]+$/, /^permissions\.(allow|deny|ask)$/];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isIdentityArray(keyPath) {
  return IDENTITY_ARRAYS.some((re) => re.test(keyPath));
}

// hook item identity = matcher + command strings; permission identity = the rule string.
function itemIdentity(keyPath, item) {
  if (keyPath.startsWith('permissions.')) return String(item);
  const matcher = item && item.matcher ? item.matcher : '';
  const cmds = (item && Array.isArray(item.hooks) ? item.hooks : []).map((h) => h.command || h.type || '').join(';');
  return `matcher=${matcher}|cmd=${cmds}`;
}

function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (!isPlainObject(v)) return v;
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = canonical(v[k]);
  return out;
}

function hashValue(v) {
  return shortHash(JSON.stringify(canonical(v)));
}

// All owned leaf paths of a fragment: "a.b.c" for scalars, "hooks.Stop[identity]" for array items.
function leavesOf(fragment, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(fragment)) {
    const kp = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) out.push(...leavesOf(v, kp));
    else if (Array.isArray(v) && isIdentityArray(kp)) out.push(...v.map((item) => `${kp}[${itemIdentity(kp, item)}]`));
    else out.push(kp);
  }
  return out;
}

function mergeInto(target, fragment, prefix = '') {
  const out = { ...target };
  for (const [k, v] of Object.entries(fragment)) {
    const kp = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) {
      out[k] = mergeInto(isPlainObject(out[k]) ? out[k] : {}, v, kp);
    } else if (Array.isArray(v) && isIdentityArray(kp)) {
      const existing = Array.isArray(out[k]) ? out[k] : [];
      const byId = new Map(existing.map((item) => [itemIdentity(kp, item), item]));
      for (const item of v) byId.set(itemIdentity(kp, item), item);
      out[k] = [...byId.values()];
    } else {
      out[k] = v;
    }
  }
  return out;
}

function deepMerge(base, ...fragments) {
  return fragments.reduce((acc, f) => mergeInto(acc, f), base);
}

function parseLeaf(leaf) {
  const m = leaf.match(/^([^[]+)\[(.*)\]$/);
  return m ? { keyPath: m[1], identity: m[2] } : { keyPath: leaf, identity: null };
}

function removeLeaf(obj, leaf) {
  const { keyPath, identity } = parseLeaf(leaf);
  const segs = keyPath.split('.');
  const last = segs.pop();
  const clone = { ...obj };
  let cur = clone;
  const chain = [clone];
  for (const s of segs) {
    if (!isPlainObject(cur[s])) return obj;
    cur[s] = { ...cur[s] };
    cur = cur[s];
    chain.push(cur);
  }
  if (identity === null) {
    delete cur[last];
  } else if (Array.isArray(cur[last])) {
    const kept = cur[last].filter((item) => itemIdentity(keyPath, item) !== identity);
    if (kept.length) cur[last] = kept;
    else delete cur[last];
  }
  // prune parent objects emptied by this removal
  for (let i = chain.length - 1; i > 0; i--) {
    if (Object.keys(chain[i]).length === 0) delete chain[i - 1][segs[i - 1]];
  }
  return clone;
}

function removeLeaves(obj, leaves) {
  return leaves.reduce((acc, leaf) => removeLeaf(acc, leaf), obj);
}

// Projection of live settings onto a fragment's shape: what the live file currently holds
// for the leaves the fragment owns. Hashing it against the fragment gives the D side.
function project(live, fragment, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(fragment)) {
    const kp = prefix ? `${prefix}.${k}` : k;
    const cur = live ? live[k] : undefined;
    if (isPlainObject(v)) out[k] = project(isPlainObject(cur) ? cur : {}, v, kp);
    else if (Array.isArray(v) && isIdentityArray(kp)) {
      const byId = new Map((Array.isArray(cur) ? cur : []).map((item) => [itemIdentity(kp, item), item]));
      out[k] = v.map((item) => byId.get(itemIdentity(kp, item))).filter((item) => item !== undefined);
    } else if (cur !== undefined) out[k] = cur;
  }
  return out;
}

function settingsPath(ctx) {
  return path.join(ctx.claudeHome, 'settings.json');
}

function loadSettings(ctx) {
  return readJson(settingsPath(ctx), {});
}

function saveSettings(ctx, obj) {
  const p = settingsPath(ctx);
  if (fs.existsSync(p)) fs.copyFileSync(p, `${p}.bak`);
  writeJson(p, obj);
}

function loadFragment(fragmentPath) {
  const f = readJson(fragmentPath, null);
  if (!isPlainObject(f)) throw new Error(`settings fragment is not a JSON object: ${fragmentPath}`);
  return f;
}

// Hash pair for the three-way classifier: S = fragment, D = live projection (null when nothing owned is present).
function settingsHashes(ctx, fragmentPath) {
  const fragment = loadFragment(fragmentPath);
  const live = loadSettings(ctx);
  const projected = project(live, fragment);
  const sourceHash = hashValue(fragment);
  const installedHash = leavesOf(projected).length === 0 ? null : hashValue(projected);
  return { sourceHash, installedHash, fragment };
}

// Apply every fragment; remove leaves that were owned before but are owned by no fragment now.
function applyFragments(ctx, fragmentPaths, previouslyOwned) {
  const fragments = fragmentPaths.map(loadFragment);
  const owned = [...new Set(fragments.flatMap((f) => leavesOf(f)))].sort();
  const stale = (previouslyOwned || []).filter((leaf) => !owned.includes(leaf));
  const live = loadSettings(ctx);
  const merged = deepMerge(removeLeaves(live, stale), ...fragments);
  return { merged, owned, stale };
}

module.exports = {
  isIdentityArray,
  itemIdentity,
  canonical,
  hashValue,
  leavesOf,
  deepMerge,
  removeLeaf,
  removeLeaves,
  project,
  settingsPath,
  loadSettings,
  saveSettings,
  loadFragment,
  settingsHashes,
  applyFragments,
};
