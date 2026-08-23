'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { makeTempCtx, write } = require('./helpers');
const {
  loadManifest, saveManifest, emptyManifest, destFor, makeEntry, findEntry, validateDest, migrateV1,
} = require('../lib/manifest');
const { readJson } = require('../lib/fsutil');

test('manifest save/load round-trips and sorts entries by src+path', () => {
  const { ctx } = makeTempCtx();
  const m = emptyManifest();
  m.entries.push(makeEntry({ src: 'ecc', path: 'rules/b.md', hash: 'bbb' }));
  m.entries.push(makeEntry({ src: 'ecc', path: 'rules/a.md', hash: 'aaa' }));
  m.sources.ecc = { repo: 'x', ref: 'main', sha: null };
  saveManifest(ctx, m);
  const loaded = loadManifest(ctx);
  assert.equal(loaded.version, 2);
  assert.deepEqual(loaded.entries.map((e) => e.path), ['rules/a.md', 'rules/b.md']);
  assert.deepEqual(loaded.sources.custom, { local: true });
  assert.deepEqual(loaded.settingsOwned, []);
});

test('loadManifest refuses a v1 manifest', () => {
  const { ctx } = makeTempCtx();
  write(ctx.manifestPath, JSON.stringify({ upstream: [], custom: [] }));
  assert.throws(() => loadManifest(ctx), /migrate-v1/);
});

test('dest mapping: skills/<category>/<name>/ flattens, others 1:1, --as renames last segment', () => {
  assert.equal(destFor('skills/engineering/tdd/'), 'skills/tdd/');
  assert.equal(destFor('skills/karpathy-guidelines/'), 'skills/karpathy-guidelines/');
  assert.equal(destFor('skills/engineering/tdd/', 'mp-tdd'), 'skills/mp-tdd/');
  assert.equal(destFor('rules/common/security.md'), 'rules/common/security.md');
  assert.equal(destFor('agents/code-reviewer.md', 'reviewer.md'), 'agents/reviewer.md');
  assert.equal(destFor('skills/a/SKILL.md'), 'skills/a/SKILL.md');
});

test('makeEntry records dest only when it differs and marks settings fragments', () => {
  const flat = makeEntry({ src: 'mattpocock', path: 'skills/productivity/grilling/', hash: 'h' });
  assert.equal(flat.dest, 'skills/grilling/');
  const plain = makeEntry({ src: 'ecc', path: 'agents/x.md', hash: 'h' });
  assert.equal(plain.dest, undefined);
  const frag = makeEntry({ src: 'custom', path: 'settings/hooks.json' });
  assert.equal(frag.kind, 'settings');
  assert.equal(frag.hash, null);
});

test('validateDest refuses collisions across sources and the reserved prefix', () => {
  const m = emptyManifest();
  m.entries.push(makeEntry({ src: 'ecc', path: 'skills/tdd/', hash: 'h' }));
  assert.throws(() => validateDest(m, 'skills/tdd/', 'mattpocock'), /already provided by source ecc/);
  assert.throws(() => validateDest(m, 'skills/tdd/', 'ecc'), /already picked/);
  assert.throws(() => validateDest(m, 'skills/synced/x/', 'ecc'), /reserved/);
  validateDest(m, 'skills/mp-tdd/', 'mattpocock');
  assert.ok(findEntry(m, 'skills/tdd'));
});

test('migrateV1 maps upstream/bible/custom, resolves the duplicate as a custom fork, registers mattpocock', () => {
  const { ctx } = makeTempCtx();
  write(path.join(ctx.customDir, 'commands/sessions.md'), 'custom version');
  write(path.join(ctx.customDir, 'rules/frank/p.md'), 'repo p');
  write(path.join(ctx.claudeHome, 'rules/frank/p.md'), 'installed p');
  const v1 = {
    upstream: ['agents/a.md', 'commands/sessions.md'],
    bible: ['skills/karpathy-guidelines/SKILL.md'],
    custom: ['commands/sessions.md', 'rules/frank/p.md'],
    hashes: { 'agents/a.md': 'aaaaaaaaaaaa', 'commands/sessions.md': '87d9eccf2c89' },
    lastSync: '2026-08-07T06:12:02.754Z',
  };
  const sha = '4130457d674d2180c5af2c5f634f3cae4cbc6c4f';
  const m = migrateV1(ctx, v1, { eccSha: sha });
  assert.equal(m.version, 2);
  assert.equal(m.sources.ecc.sha, sha);
  assert.match(m.sources.mattpocock.repo, /mattpocock\/skills/);
  assert.equal(m.sources.karpathy.sha, null);
  const byPath = Object.fromEntries(m.entries.map((e) => [`${e.src}:${e.path}`, e]));
  assert.equal(byPath['ecc:agents/a.md'].hash, 'aaaaaaaaaaaa');
  assert.equal(byPath['ecc:commands/sessions.md'], undefined);
  assert.deepEqual(byPath['custom:commands/sessions.md'].forkedFrom, { src: 'ecc', path: 'commands/sessions.md', hash: '87d9eccf2c89' });
  assert.equal(byPath['karpathy:skills/karpathy-guidelines/SKILL.md'].hash, null);
  // custom base = installed copy when present (what v1 last synced), else the repo file
  const { hashFile } = require('../lib/fsutil');
  assert.equal(byPath['custom:rules/frank/p.md'].hash, hashFile(path.join(ctx.claudeHome, 'rules/frank/p.md')));
  assert.equal(byPath['custom:commands/sessions.md'].hash, hashFile(path.join(ctx.customDir, 'commands/sessions.md')));
  assert.equal(m.lastSync, v1.lastSync);
  assert.throws(() => migrateV1(ctx, v1, { eccSha: 'short' }), /40-char/);
  saveManifest(ctx, m);
  assert.equal(readJson(ctx.manifestPath).version, 2);
});
