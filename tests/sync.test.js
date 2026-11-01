'use strict';

// End-to-end: local git source → pick → sync → local edit refused → force → upstream change → accept → fork/own/unpick.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeTempCtx, makeSourceRepo, commitFiles, write, read, collect } = require('./helpers');
const { cmdSrc, cmdPick, cmdUnpick, cmdFork, cmdOwn } = require('../lib/cmd-pick');
const { cmdSync, cmdDiff, cmdAccept, cmdInstall, cmdStatus } = require('../lib/cmd-sync');
const { loadManifest, findEntry } = require('../lib/manifest');
const { STATES } = require('../lib/state');

function states(ctx) {
  const log = collect();
  const rows = cmdDiff(ctx, [], log);
  return Object.fromEntries(rows.map((r) => [r.dest, r.state]));
}

test('pick/sync/refuse/force/accept/fork/own/unpick flow', () => {
  const { root, ctx } = makeTempCtx();
  const origin = makeSourceRepo(root, 'up', {
    'rules/a.md': 'A1',
    'skills/cat/sk/SKILL.md': 'S1',
  });
  const log = collect();
  cmdSrc(ctx, ['add', 'up', origin], log);
  assert.match(log.text(), /pinned at [0-9a-f]{40}/);

  cmdPick(ctx, ['up', 'rules/a.md', 'skills/cat/sk/'], log);
  let m = loadManifest(ctx);
  assert.equal(findEntry(m, 'skills/sk/').path, 'skills/cat/sk/');

  // first sync copies both (MISSING)
  assert.equal(cmdSync(ctx, [], log), true);
  assert.equal(read(path.join(ctx.claudeHome, 'rules/a.md')), 'A1');
  assert.equal(read(path.join(ctx.claudeHome, 'skills/sk/SKILL.md')), 'S1');
  assert.deepEqual(states(ctx), { 'rules/a.md': STATES.CURRENT, 'skills/sk/': STATES.CURRENT });
  assert.ok(loadManifest(ctx).lastSync);

  // local edit → LOCAL-MODIFIED → sync refuses (returns false, file untouched); dry-run also refuses
  write(path.join(ctx.claudeHome, 'rules/a.md'), 'my edit');
  assert.equal(states(ctx)['rules/a.md'], STATES.LOCAL_MODIFIED);
  assert.equal(cmdSync(ctx, ['--dry-run'], log), false);
  assert.equal(cmdSync(ctx, [], log), false);
  assert.equal(read(path.join(ctx.claudeHome, 'rules/a.md')), 'my edit');
  assert.match(log.text(), /refuse {8}LOCAL-MODIFIED/);

  // --force overwrites
  assert.equal(cmdSync(ctx, ['--force'], log), true);
  assert.equal(read(path.join(ctx.claudeHome, 'rules/a.md')), 'A1');

  // upstream change + src update → UPSTREAM-CHANGED; sync does not copy until accept
  commitFiles(origin, { 'rules/a.md': 'A2', 'skills/cat/sk/ref.md': 'new file' }, 'upstream change');
  cmdSrc(ctx, ['update'], log);
  assert.match(log.text(), /run diff, then accept/);
  assert.deepEqual(states(ctx), { 'rules/a.md': STATES.UPSTREAM_CHANGED, 'skills/sk/': STATES.UPSTREAM_CHANGED });
  assert.equal(cmdSync(ctx, [], log), true);
  assert.equal(read(path.join(ctx.claudeHome, 'rules/a.md')), 'A1', 'not copied before accept');

  // local edit + upstream change → CONFLICT, refused; accept refuses CONFLICT
  write(path.join(ctx.claudeHome, 'rules/a.md'), 'my edit');
  assert.equal(states(ctx)['rules/a.md'], STATES.CONFLICT);
  assert.equal(cmdSync(ctx, [], log), false);
  assert.throws(() => cmdAccept(ctx, ['rules/a.md'], log), /CONFLICT/);
  write(path.join(ctx.claudeHome, 'rules/a.md'), 'A1');

  // accept one dest → copied, hash updated, pin moved to clone HEAD
  cmdAccept(ctx, ['rules/a.md'], log);
  assert.equal(read(path.join(ctx.claudeHome, 'rules/a.md')), 'A2');
  m = loadManifest(ctx);
  const head = require('../lib/sources').headSha(ctx, 'up');
  assert.equal(m.sources.up.sha, head);
  assert.equal(states(ctx)['rules/a.md'], STATES.CURRENT);

  // accept --all picks up the dir entry (new file inside the picked dir)
  cmdAccept(ctx, ['--all'], log);
  assert.equal(read(path.join(ctx.claudeHome, 'skills/sk/ref.md')), 'new file');
  assert.equal(states(ctx)['skills/sk/'], STATES.CURRENT);

  // fork: entry moves to custom with forkedFrom; later upstream change shows FORK-DRIFT
  cmdFork(ctx, ['rules/a.md'], log);
  m = loadManifest(ctx);
  const forked = findEntry(m, 'rules/a.md');
  assert.equal(forked.src, 'custom');
  assert.equal(forked.forkedFrom.src, 'up');
  assert.equal(read(path.join(ctx.customDir, 'rules/a.md')), 'A2');
  commitFiles(origin, { 'rules/a.md': 'A3' }, 'drift');
  cmdSrc(ctx, ['update', 'up'], log);
  const driftRows = cmdDiff(ctx, [], collect());
  assert.ok(driftRows.some((r) => r.dest === 'rules/a.md' && r.drift), 'FORK-DRIFT reported');
  cmdAccept(ctx, ['rules/a.md'], log);
  assert.ok(cmdDiff(ctx, [], collect()).every((r) => r.state === STATES.CURRENT && !r.drift), 'drift accepted');

  // custom edits sync without accept
  write(path.join(ctx.customDir, 'rules/a.md'), 'mine v2');
  assert.equal(states(ctx)['rules/a.md'], STATES.UPSTREAM_CHANGED);
  assert.equal(cmdSync(ctx, [], log), true);
  assert.equal(read(path.join(ctx.claudeHome, 'rules/a.md')), 'mine v2');

  // own: creates under custom, never overwrites
  cmdOwn(ctx, ['rules/frank/new.md'], log);
  assert.ok(fs.existsSync(path.join(ctx.customDir, 'rules/frank/new.md')));
  assert.throws(() => cmdOwn(ctx, ['rules/frank/new.md']), /refusing to overwrite/);
  assert.throws(() => cmdOwn(ctx, ['rules/a.md']), /refusing to overwrite/);

  // deleted upstream: reported, kept
  commitFiles(origin, { 'skills/cat/sk/SKILL.md': 'S2' }, 'x');
  fs.rmSync(path.join(origin, 'skills'), { recursive: true });
  commitFiles(origin, {}, 'delete skill');
  cmdSrc(ctx, ['update', 'up'], log);
  assert.equal(states(ctx)['skills/sk/'], STATES.DELETED_UPSTREAM);
  assert.equal(cmdSync(ctx, [], log), true);
  assert.ok(fs.existsSync(path.join(ctx.claudeHome, 'skills/sk/SKILL.md')), 'kept');

  // unpick removes the installed copy and the entry
  cmdUnpick(ctx, ['skills/sk/'], log);
  assert.ok(!fs.existsSync(path.join(ctx.claudeHome, 'skills/sk')));
  assert.equal(findEntry(loadManifest(ctx), 'skills/sk/'), null);

  cmdStatus(ctx, [], log);
  assert.match(log.text(), /other files under/);
});

test('settings fragments: sync merges, hand edit is LOCAL-MODIFIED, unpick removes owned leaves only', () => {
  const { ctx } = makeTempCtx();
  const log = collect();
  const settingsFile = path.join(ctx.claudeHome, 'settings.json');
  write(settingsFile, JSON.stringify({ model: 'm', permissions: { defaultMode: 'auto', deny: ['Keep'] } }));
  write(path.join(ctx.customDir, 'settings/deny.json'), JSON.stringify({ permissions: { deny: ['Bash(git push --force*)'] }, attribution: { commit: '' } }));
  cmdPick(ctx, ['custom', 'settings/deny.json'], log);
  assert.equal(states(ctx)['settings/deny.json'], STATES.MISSING);
  assert.equal(cmdSync(ctx, [], log), true);
  let live = JSON.parse(read(settingsFile));
  assert.deepEqual(live.permissions, { defaultMode: 'auto', deny: ['Keep', 'Bash(git push --force*)'] });
  assert.deepEqual(live.attribution, { commit: '' });
  assert.deepEqual(loadManifest(ctx).settingsOwned, ['attribution.commit', 'permissions.deny[Bash(git push --force*)]']);
  assert.equal(states(ctx)['settings/deny.json'], STATES.CURRENT);

  // hand edit of an owned leaf → LOCAL-MODIFIED → refused; fragment edit → UPSTREAM-CHANGED → applied
  write(settingsFile, JSON.stringify({ ...live, attribution: { commit: 'hand' } }));
  assert.equal(states(ctx)['settings/deny.json'], STATES.LOCAL_MODIFIED);
  assert.equal(cmdSync(ctx, [], log), false);
  assert.equal(JSON.parse(read(settingsFile)).attribution.commit, 'hand');
  assert.equal(cmdSync(ctx, ['--force'], log), true);
  assert.equal(JSON.parse(read(settingsFile)).attribution.commit, '');
  write(path.join(ctx.customDir, 'settings/deny.json'), JSON.stringify({ permissions: { deny: ['Bash(git push --force*)'] }, attribution: { commit: '', pr: '' } }));
  assert.equal(states(ctx)['settings/deny.json'], STATES.UPSTREAM_CHANGED);
  assert.equal(cmdSync(ctx, [], log), true);
  assert.deepEqual(JSON.parse(read(settingsFile)).attribution, { commit: '', pr: '' });

  cmdUnpick(ctx, ['settings/deny.json'], log);
  live = JSON.parse(read(settingsFile));
  assert.deepEqual(live, { model: 'm', permissions: { defaultMode: 'auto', deny: ['Keep'] } });
  assert.deepEqual(loadManifest(ctx).settingsOwned, []);
});

test('install clones every pinned source on a fresh machine and syncs', () => {
  const { root, ctx } = makeTempCtx();
  const origin = makeSourceRepo(root, 'up', { 'agents/x.md': 'X1' });
  const log = collect();
  cmdSrc(ctx, ['add', 'up', origin], log);
  cmdPick(ctx, ['up', 'agents/x.md'], log);
  const pin = loadManifest(ctx).sources.up.sha;
  commitFiles(origin, { 'agents/x.md': 'X2' }, 'after pin');
  // simulate a new machine: drop the clone and the installed tree
  fs.rmSync(ctx.sourcesDir, { recursive: true, force: true });
  fs.rmSync(ctx.claudeHome, { recursive: true, force: true });
  assert.equal(cmdInstall(ctx, [], log), true);
  assert.equal(read(path.join(ctx.claudeHome, 'agents/x.md')), 'X1', 'installed at the pin, not the tip');
  assert.equal(require('../lib/sources').headSha(ctx, 'up'), pin);
});

test('sync refuses to copy or record from a clone that is not at its pin', () => {
  const { root, ctx } = makeTempCtx();
  const origin = makeSourceRepo(root, 'up', { 'rules/a.md': 'A1' });
  const log = collect();
  cmdSrc(ctx, ['add', 'up', origin], log);
  cmdPick(ctx, ['up', 'rules/a.md'], log);
  assert.equal(cmdSync(ctx, [], log), true);
  // move the clone HEAD past the pin, then delete the installed copy (MISSING)
  commitFiles(origin, { 'rules/a.md': 'A2-tip' }, 'past pin');
  cmdSrc(ctx, ['update', 'up'], log);
  fs.rmSync(path.join(ctx.claudeHome, 'rules/a.md'));
  assert.equal(cmdSync(ctx, [], log), false, 'copy from an unpinned clone is refused');
  assert.ok(!fs.existsSync(path.join(ctx.claudeHome, 'rules/a.md')), 'tip content was not installed');
  assert.match(log.text(), /not at its pin/);
  // install restores the clone to the pin, then the copy is the pinned content
  assert.equal(cmdInstall(ctx, [], log), true);
  assert.equal(read(path.join(ctx.claudeHome, 'rules/a.md')), 'A1', 'pinned content installed, not the tip');
  // accept moves the pin to the reviewed HEAD; sync then copies normally
  cmdSrc(ctx, ['update', 'up'], log);
  cmdAccept(ctx, ['--all'], log);
  assert.equal(cmdSync(ctx, [], log), true);
  assert.equal(read(path.join(ctx.claudeHome, 'rules/a.md')), 'A2-tip');
});

test('sync --force first prints the list of entries it will overwrite', () => {
  const { root, ctx } = makeTempCtx();
  const origin = makeSourceRepo(root, 'up', { 'rules/a.md': 'A1', 'rules/b.md': 'B1' });
  const log = collect();
  cmdSrc(ctx, ['add', 'up', origin], log);
  cmdPick(ctx, ['up', 'rules/a.md', 'rules/b.md'], log);
  cmdSync(ctx, [], log);
  write(path.join(ctx.claudeHome, 'rules/a.md'), 'hand edit');
  const forceLog = collect();
  assert.equal(cmdSync(ctx, ['--force'], forceLog), true);
  const text = forceLog.text();
  assert.match(text, /--force will overwrite 1 LOCAL-MODIFIED\/CONFLICT entry:/);
  assert.match(text, /LOCAL-MODIFIED {4}rules\/a\.md/);
  assert.equal(read(path.join(ctx.claudeHome, 'rules/a.md')), 'A1');
});

test('overlapping dests are rejected at pick/own time and refused by sync', () => {
  const { root, ctx } = makeTempCtx();
  const origin = makeSourceRepo(root, 'up', { 'skills/cat/sk/SKILL.md': 'S1', 'rules/frank/x.md': 'X1' });
  const log = collect();
  cmdSrc(ctx, ['add', 'up', origin], log);
  cmdPick(ctx, ['up', 'skills/cat/sk/'], log);
  // a file inside a managed dir: own refuses
  assert.throws(() => cmdOwn(ctx, ['skills/sk/extra.md'], log), /overlaps entry skills\/sk\//);
  // a dir pick over an existing file entry is also refused
  cmdPick(ctx, ['up', 'rules/frank/x.md'], log);
  assert.throws(() => cmdPick(ctx, ['up', 'rules/'], log), /overlaps entry rules\/frank\/x\.md/);
  const m = loadManifest(ctx);
  // a manifest already carrying an overlap (edited by hand) is refused by sync
  m.entries.push(require('../lib/manifest').makeEntry({ src: 'up', path: 'skills/cat/sk/notes.md', dest: 'skills/sk/notes.md', hash: null }));
  require('../lib/manifest').saveManifest(ctx, m);
  assert.throws(() => cmdSync(ctx, [], log), /manage overlapping paths/);
});

test('unpick refuses a LOCAL-MODIFIED entry unless --force', () => {
  const { root, ctx } = makeTempCtx();
  const origin = makeSourceRepo(root, 'up', { 'rules/a.md': 'A1' });
  const log = collect();
  cmdSrc(ctx, ['add', 'up', origin], log);
  cmdPick(ctx, ['up', 'rules/a.md'], log);
  cmdSync(ctx, [], log);
  write(path.join(ctx.claudeHome, 'rules/a.md'), 'local edit');
  assert.throws(() => cmdUnpick(ctx, ['rules/a.md'], log), /LOCAL-MODIFIED.*--force/);
  assert.equal(read(path.join(ctx.claudeHome, 'rules/a.md')), 'local edit', 'edit kept');
  cmdUnpick(ctx, ['rules/a.md', '--force'], log);
  assert.ok(!fs.existsSync(path.join(ctx.claudeHome, 'rules/a.md')));
  assert.equal(findEntry(loadManifest(ctx), 'rules/a.md'), null);
});

test('fork records forkedFrom.hash from the entry base, not the clone HEAD', () => {
  const { root, ctx } = makeTempCtx();
  const origin = makeSourceRepo(root, 'up', { 'rules/a.md': 'A1' });
  const log = collect();
  cmdSrc(ctx, ['add', 'up', origin], log);
  cmdPick(ctx, ['up', 'rules/a.md'], log);
  cmdSync(ctx, [], log);
  const base = findEntry(loadManifest(ctx), 'rules/a.md').hash;
  commitFiles(origin, { 'rules/a.md': 'A2' }, 'ahead of base');
  cmdSrc(ctx, ['update', 'up'], log);
  cmdFork(ctx, ['rules/a.md'], log);
  const forked = findEntry(loadManifest(ctx), 'rules/a.md');
  assert.equal(forked.forkedFrom.hash, base, 'base hash, so the A1->A2 upstream move still surfaces');
  assert.ok(cmdDiff(ctx, [], collect()).some((r) => r.dest === 'rules/a.md' && r.drift), 'FORK-DRIFT visible');
});

