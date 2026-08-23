'use strict';

// Source clones under ctx.sourcesDir/<name> (full clones, detached at a sha).
// The pseudo-source `custom` is the repo's custom/ directory.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { CUSTOM_SRC } = require('./manifest');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function cloneDir(ctx, name) {
  return path.join(ctx.sourcesDir, name);
}

// Root directory that entry paths are relative to.
function sourceRoot(ctx, m, name) {
  if (name === CUSTOM_SRC) return ctx.customDir;
  const s = m.sources[name];
  if (!s) throw new Error(`unknown source: ${name}`);
  const dir = cloneDir(ctx, name);
  return s.dir ? path.join(dir, s.dir) : dir;
}

function isCloned(ctx, name) {
  return fs.existsSync(path.join(cloneDir(ctx, name), '.git'));
}

function headSha(ctx, name) {
  return git(['rev-parse', 'HEAD'], cloneDir(ctx, name));
}

// Clone if missing, then detach at the pinned sha (or the ref tip when no pin).
function ensureClone(ctx, m, name) {
  if (name === CUSTOM_SRC) return;
  const s = m.sources[name];
  if (!s) throw new Error(`unknown source: ${name}`);
  const dir = cloneDir(ctx, name);
  if (!isCloned(ctx, name)) {
    fs.mkdirSync(ctx.sourcesDir, { recursive: true });
    git(['clone', '-q', s.repo, dir]);
  }
  if (s.sha) {
    git(['checkout', '-q', '--detach', s.sha], dir);
  } else {
    git(['checkout', '-q', '--detach', `origin/${s.ref || 'main'}`], dir);
  }
}

// Fetch the ref and move the clone HEAD to its tip. The manifest pin is untouched.
function updateClone(ctx, m, name) {
  if (name === CUSTOM_SRC) return null;
  const s = m.sources[name];
  if (!s) throw new Error(`unknown source: ${name}`);
  if (!isCloned(ctx, name)) ensureClone(ctx, m, name);
  const dir = cloneDir(ctx, name);
  git(['fetch', '-q', 'origin', s.ref || 'main'], dir);
  git(['checkout', '-q', '--detach', 'FETCH_HEAD'], dir);
  return headSha(ctx, name);
}

function checkoutSha(ctx, name, sha) {
  git(['checkout', '-q', '--detach', sha], cloneDir(ctx, name));
}

// Validate a source exists and is cloned before reading from it.
function requireReadable(ctx, m, name) {
  if (name === CUSTOM_SRC) return;
  if (!m.sources[name]) throw new Error(`unknown source: ${name}`);
  if (!isCloned(ctx, name)) throw new Error(`source ${name} is not cloned. Run: myclaude.js src update ${name}`);
}

function addSource(m, name, repo, opts = {}) {
  if (m.sources[name]) throw new Error(`source ${name} already exists`);
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`invalid source name: ${name}`);
  return {
    ...m,
    sources: { ...m.sources, [name]: { repo, ref: opts.ref || 'main', sha: opts.sha || null, ...(opts.dir ? { dir: opts.dir } : {}) } },
  };
}

function removeSource(m, name) {
  if (name === CUSTOM_SRC) throw new Error('cannot remove the custom source');
  if (!m.sources[name]) throw new Error(`unknown source: ${name}`);
  const used = m.entries.filter((e) => e.src === name);
  if (used.length) throw new Error(`source ${name} still has ${used.length} picked entries; unpick them first`);
  const sources = { ...m.sources };
  delete sources[name];
  return { ...m, sources };
}

module.exports = {
  git,
  cloneDir,
  sourceRoot,
  isCloned,
  headSha,
  ensureClone,
  updateClone,
  checkoutSha,
  requireReadable,
  addSource,
  removeSource,
};
