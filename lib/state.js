'use strict';

// Three-way state per entry. S = source at clone HEAD, B = recorded hash, D = installed.

const path = require('path');
const { hashPath } = require('./fsutil');
const { isDirPath, entryDest, CUSTOM_SRC } = require('./manifest');
const { sourceRoot } = require('./sources');
const { settingsHashes } = require('./settings');

const STATES = {
  CURRENT: 'CURRENT',
  MISSING: 'MISSING',
  UPSTREAM_CHANGED: 'UPSTREAM-CHANGED',
  LOCAL_MODIFIED: 'LOCAL-MODIFIED',
  CONFLICT: 'CONFLICT',
  CONVERGED: 'CONVERGED',
  DELETED_UPSTREAM: 'DELETED-UPSTREAM',
  FORK_DRIFT: 'FORK-DRIFT',
};

// Pure classification from three hashes (null = absent).
function classify(S, B, D) {
  if (S === null) return STATES.DELETED_UPSTREAM;
  if (D === null) return STATES.MISSING;
  if (S === B && D === B) return STATES.CURRENT;
  if (S !== B && D === B) return STATES.UPSTREAM_CHANGED;
  if (S === B && D !== B) return STATES.LOCAL_MODIFIED;
  if (S !== B && D === S) return STATES.CONVERGED;
  return STATES.CONFLICT;
}

function sourcePathOf(ctx, m, e) {
  return path.join(sourceRoot(ctx, m, e.src), e.path);
}

function installedPathOf(ctx, e) {
  return path.join(ctx.claudeHome, entryDest(e));
}

function sourceHashOf(ctx, m, e) {
  if (e.kind === 'settings') return settingsHashes(ctx, sourcePathOf(ctx, m, e)).sourceHash;
  return hashPath(sourcePathOf(ctx, m, e), isDirPath(e.path));
}

function installedHashOf(ctx, m, e) {
  if (e.kind === 'settings') return settingsHashes(ctx, sourcePathOf(ctx, m, e)).installedHash;
  return hashPath(installedPathOf(ctx, e), isDirPath(e.path));
}

// FORK-DRIFT: the upstream file a custom entry was forked from moved past forkedFrom.hash.
function forkDriftOf(ctx, m, e) {
  if (e.src !== CUSTOM_SRC || !e.forkedFrom) return null;
  const f = e.forkedFrom;
  if (!m.sources[f.src]) return null;
  const current = hashPath(path.join(sourceRoot(ctx, m, f.src), f.path), isDirPath(f.path));
  if (current === null || current === f.hash) return null;
  return { src: f.src, path: f.path, was: f.hash, now: current };
}

function evaluate(ctx, m, e) {
  const S = sourceHashOf(ctx, m, e);
  const B = e.hash || null;
  const D = installedHashOf(ctx, m, e);
  return { entry: e, dest: entryDest(e), S, B, D, state: classify(S, B, D), drift: forkDriftOf(ctx, m, e) };
}

function evaluateAll(ctx, m) {
  return m.entries.map((e) => evaluate(ctx, m, e));
}

module.exports = {
  STATES,
  classify,
  sourcePathOf,
  installedPathOf,
  sourceHashOf,
  installedHashOf,
  forkDriftOf,
  evaluate,
  evaluateAll,
};
