'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { makeTempCtx, write } = require('./helpers');
const {
  deepMerge, leavesOf, removeLeaves, project, hashValue, applyFragments, settingsHashes, itemIdentity,
} = require('../lib/settings');
const { readJson } = require('../lib/fsutil');

const stopHook = { hooks: [{ type: 'command', command: 'node gate.js' }] };
const startHook = { matcher: 'startup', hooks: [{ type: 'command', command: 'node hint.js', timeout: 10 }] };

test('deepMerge: objects recurse, scalars from fragment win, unrelated keys survive', () => {
  const live = { model: 'opus', permissions: { defaultMode: 'auto' }, attribution: { commit: 'old', pr: 'x' } };
  const merged = deepMerge(live, { attribution: { commit: '' } }, { permissions: { deny: ['Bash(rm -rf *)'] } });
  assert.equal(merged.model, 'opus');
  assert.equal(merged.permissions.defaultMode, 'auto');
  assert.deepEqual(merged.permissions.deny, ['Bash(rm -rf *)']);
  assert.deepEqual(merged.attribution, { commit: '', pr: 'x' });
  assert.deepEqual(live.attribution, { commit: 'old', pr: 'x' }, 'input not mutated');
});

test('deepMerge: hooks and permission arrays union by identity, never duplicate, replace in place', () => {
  const live = { hooks: { Stop: [stopHook, { hooks: [{ type: 'command', command: 'other' }] }] }, permissions: { deny: ['A', 'B'] } };
  const updatedStart = { ...startHook, hooks: [{ ...startHook.hooks[0], timeout: 30 }] };
  const merged = deepMerge(live, { hooks: { Stop: [stopHook], SessionStart: [startHook] } }, { hooks: { SessionStart: [updatedStart] }, permissions: { deny: ['B', 'C'] } });
  assert.equal(merged.hooks.Stop.length, 2);
  assert.equal(merged.hooks.SessionStart.length, 1);
  assert.equal(merged.hooks.SessionStart[0].hooks[0].timeout, 30);
  assert.deepEqual(merged.permissions.deny, ['A', 'B', 'C']);
  assert.equal(itemIdentity('hooks.Stop', stopHook), 'matcher=|cmd=node gate.js');
  assert.equal(itemIdentity('permissions.deny', 'Bash(x)'), 'Bash(x)');
});

test('leavesOf lists scalar paths and array identities; non-identity arrays are one leaf', () => {
  const leaves = leavesOf({ attribution: { commit: '', pr: '' }, hooks: { Stop: [stopHook] }, permissions: { deny: ['X'] }, list: [1, 2] });
  assert.deepEqual(leaves, ['attribution.commit', 'attribution.pr', 'hooks.Stop[matcher=|cmd=node gate.js]', 'permissions.deny[X]', 'list']);
});

test('removeLeaves deletes exactly the owned leaves and prunes emptied parents', () => {
  const live = { model: 'm', attribution: { commit: '', pr: 'keep' }, hooks: { Stop: [stopHook], SessionStart: [startHook] }, permissions: { deny: ['X', 'Y'] } };
  const out = removeLeaves(live, ['attribution.commit', 'hooks.Stop[matcher=|cmd=node gate.js]', 'permissions.deny[X]', 'missing.key']);
  assert.deepEqual(out.attribution, { pr: 'keep' });
  assert.equal(out.hooks.Stop, undefined);
  assert.equal(out.hooks.SessionStart.length, 1);
  assert.deepEqual(out.permissions.deny, ['Y']);
  assert.equal(out.model, 'm');
  const all = removeLeaves(out, ['attribution.pr', 'hooks.SessionStart[matcher=startup|cmd=node hint.js]', 'permissions.deny[Y]']);
  assert.deepEqual(all, { model: 'm' });
});

test('project + hashValue give the three-way D side for a fragment', () => {
  const fragment = { attribution: { commit: '' }, hooks: { Stop: [stopHook] } };
  const same = project({ model: 'm', attribution: { commit: '', pr: 'x' }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'other' }] }, stopHook] } }, fragment);
  assert.equal(hashValue(same), hashValue(fragment));
  const edited = project({ attribution: { commit: 'hand-edit' }, hooks: { Stop: [stopHook] } }, fragment);
  assert.notEqual(hashValue(edited), hashValue(fragment));
  assert.deepEqual(leavesOf(project({}, fragment)), [], 'nothing owned present → empty projection');
});

test('applyFragments merges into the live file, tracks owned leaves, removes leaves no fragment owns any more', () => {
  const { ctx } = makeTempCtx();
  const settingsFile = path.join(ctx.claudeHome, 'settings.json');
  write(settingsFile, JSON.stringify({ model: 'm', hooks: { Stop: [stopHook] }, attribution: { commit: 'old' } }));
  const hooksFrag = path.join(ctx.customDir, 'settings/hooks.json');
  const attrFrag = path.join(ctx.customDir, 'settings/attribution.json');
  write(hooksFrag, JSON.stringify({ hooks: { SessionStart: [startHook] } }));
  write(attrFrag, JSON.stringify({ attribution: { commit: '', pr: '' } }));

  const first = applyFragments(ctx, [hooksFrag, attrFrag], []);
  assert.deepEqual(first.owned, ['attribution.commit', 'attribution.pr', 'hooks.SessionStart[matcher=startup|cmd=node hint.js]']);
  assert.deepEqual(first.stale, []);
  assert.equal(first.merged.model, 'm');
  assert.equal(first.merged.hooks.Stop.length, 1, 'unowned hook kept');
  assert.deepEqual(first.merged.attribution, { commit: '', pr: '' });

  // the fragment hash pair: live file not yet written → D differs; after write → equal
  const { saveSettings } = require('../lib/settings');
  saveSettings(ctx, first.merged);
  const h = settingsHashes(ctx, attrFrag);
  assert.equal(h.sourceHash, h.installedHash);
  assert.ok(require('fs').existsSync(`${settingsFile}.bak`), 'backup written');

  // drop the attribution fragment: its leaves are stale and removed, Stop hook untouched
  const second = applyFragments(ctx, [hooksFrag], first.owned);
  assert.deepEqual(second.stale, ['attribution.commit', 'attribution.pr']);
  assert.equal(second.merged.attribution, undefined);
  assert.equal(second.merged.hooks.Stop.length, 1);
  assert.equal(readJson(settingsFile).model, 'm');
});
