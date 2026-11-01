'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { makeTempCtx, makeSourceRepo, commitFiles, write } = require('./helpers');
const { STATES, classify, evaluate } = require('../lib/state');
const { loadManifest, saveManifest, makeEntry } = require('../lib/manifest');
const { addSource, ensureClone, updateClone } = require('../lib/sources');
const { hashFile } = require('../lib/fsutil');

test('classify covers every three-way state', () => {
  assert.equal(classify('s', 's', 's'), STATES.CURRENT);
  assert.equal(classify('s', 's', null), STATES.MISSING);
  assert.equal(classify('s2', 's', 's'), STATES.UPSTREAM_CHANGED);
  assert.equal(classify('s', 's', 'd'), STATES.LOCAL_MODIFIED);
  assert.equal(classify('s2', 's', 'd'), STATES.CONFLICT);
  assert.equal(classify('s2', 's', 's2'), STATES.CONVERGED);
  assert.equal(classify(null, 's', 's'), STATES.DELETED_UPSTREAM);
  assert.equal(classify(null, 's', null), STATES.DELETED_UPSTREAM);
  // no recorded base: installed equals source → converged; otherwise conflict (never silently trusted)
  assert.equal(classify('s', null, 's'), STATES.CONVERGED);
  assert.equal(classify('s', null, 'd'), STATES.CONFLICT);
});

test('evaluate reads source/installed hashes for files, dirs, and reports FORK-DRIFT', () => {
  const { root, ctx } = makeTempCtx();
  const origin = makeSourceRepo(root, 'up', {
    'rules/a.md': 'A1',
    'skills/cat/sk/SKILL.md': 'S1',
    'skills/cat/sk/ref.md': 'R1',
  });
  let m = addSource(loadManifest(ctx), 'up', origin);
  ensureClone(ctx, m, 'up');
  const file = makeEntry({ src: 'up', path: 'rules/a.md', hash: hashFile(path.join(origin, 'rules/a.md')) });
  const dir = makeEntry({ src: 'up', path: 'skills/cat/sk/', hash: null });
  const fork = makeEntry({
    src: 'custom', path: 'rules/a.md', hash: null, forkedFrom: { src: 'up', path: 'rules/a.md', hash: file.hash },
  });
  m.entries.push(file, dir);
  saveManifest(ctx, m);

  assert.equal(evaluate(ctx, m, file).state, STATES.MISSING);
  write(path.join(ctx.claudeHome, 'rules/a.md'), 'A1');
  assert.equal(evaluate(ctx, m, file).state, STATES.CURRENT);
  write(path.join(ctx.claudeHome, 'rules/a.md'), 'edited');
  assert.equal(evaluate(ctx, m, file).state, STATES.LOCAL_MODIFIED);

  // directory entry: installed dir hashed as a whole, dest flattened to skills/sk/
  assert.equal(evaluate(ctx, m, dir).dest, 'skills/sk/');
  write(path.join(ctx.claudeHome, 'skills/sk/SKILL.md'), 'S1');
  write(path.join(ctx.claudeHome, 'skills/sk/ref.md'), 'R1');
  const d = evaluate(ctx, m, dir);
  assert.equal(d.state, STATES.CONVERGED);
  assert.equal(d.S, d.D);

  // upstream moves: UPSTREAM-CHANGED for the file entry, FORK-DRIFT for the custom fork
  write(path.join(ctx.claudeHome, 'rules/a.md'), 'A1');
  commitFiles(origin, { 'rules/a.md': 'A2' }, 'change a');
  updateClone(ctx, m, 'up');
  assert.equal(evaluate(ctx, m, file).state, STATES.UPSTREAM_CHANGED);
  write(path.join(ctx.customDir, 'rules/a.md'), 'mine');
  const f = evaluate(ctx, m, fork);
  assert.ok(f.drift, 'drift expected');
  assert.equal(f.drift.was, file.hash);
  assert.equal(f.drift.now, hashFile(path.join(ctx.sourcesDir, 'up', 'rules/a.md')));

  // deleted upstream
  const gone = makeEntry({ src: 'up', path: 'rules/nope.md', hash: 'x' });
  assert.equal(evaluate(ctx, m, gone).state, STATES.DELETED_UPSTREAM);
});
