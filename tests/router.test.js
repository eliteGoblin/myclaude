'use strict';

// Router: provenance table (SOURCES.md) + skill-description trigger check (SKILL-ROUTER.md).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeTempCtx, makeSourceRepo, write, collect } = require('./helpers');
const { cmdSrc, cmdPick, cmdOwn } = require('../lib/cmd-pick');
const { cmdSync } = require('../lib/cmd-sync');
const { cmdRouter } = require('../lib/cmd-router');

function setup() {
  const { root, ctx } = makeTempCtx();
  const log = collect();
  const origin = makeSourceRepo(root, 'up', {
    'skills/cat/good/SKILL.md': '---\nname: good\ndescription: A long enough description that routes with confidence\n---\nbody\n',
    'skills/cat/weak/SKILL.md': '---\nname: weak\ndescription: short\n---\nbody\n',
    'agents/reviewer.md': 'agent\n',
  });
  cmdSrc(ctx, ['add', 'up', origin], log);
  cmdPick(ctx, ['up', 'skills/cat/good/', 'skills/cat/weak/', 'agents/reviewer.md'], log);
  cmdOwn(ctx, ['commands/mine.md'], log);
  return { ctx, log };
}

test('router writes SOURCES.md and SKILL-ROUTER.md with provenance and trigger check', () => {
  const { ctx } = setup();
  const log = collect();
  cmdRouter(ctx, [], log);

  const sources = fs.readFileSync(path.join(ctx.claudeHome, 'skills/SOURCES.md'), 'utf8');
  assert.match(sources, /\| installed \| source repo \| source path \| pinned sha \| kind \|/);
  assert.match(sources, /\| skills\/good\/ \| .* \| up:skills\/cat\/good\/ \| [0-9a-f]{12} \| picked \|/);
  assert.match(sources, /\| agents\/reviewer\.md \| .* \| up:agents\/reviewer\.md \| [0-9a-f]{12} \| picked \|/);
  assert.match(sources, /\| commands\/mine\.md \| .* \| custom:commands\/mine\.md \| - \| custom \|/);

  const routerDoc = fs.readFileSync(path.join(ctx.repoRoot, 'docs/SKILL-ROUTER.md'), 'utf8');
  assert.match(routerDoc, /\| good \| A long enough description that routes with confidence \| ok \|/);
  assert.match(routerDoc, /\| weak \| short \| weak trigger — consider rewriting \|/);
});

test('sync regenerates SOURCES.md and status does not list it as unmanaged', () => {
  const { ctx } = setup();
  const log = collect();
  assert.equal(cmdSync(ctx, [], log), true);
  assert.ok(fs.existsSync(path.join(ctx.claudeHome, 'skills/SOURCES.md')));
  assert.match(log.text(), /wrote .*skills\/SOURCES\.md/);

  const { cmdStatus } = require('../lib/cmd-sync');
  const slog = collect();
  cmdStatus(ctx, [], slog);
  assert.doesNotMatch(slog.text(), /unmanaged.*\n.*SOURCES/);
  assert.match(slog.text(), /other files under .* \(not myclaude.s; never touched\): 0/);
});

test('frontmatter block-scalar descriptions are read and empty ones flagged weak', () => {
  const { ctx } = setup();
  write(path.join(ctx.customDir, 'skills/block/SKILL.md'),
    '---\nname: block\ndescription: >-\n  spans two lines and is definitely\n  long enough to pass the check\n---\nbody\n');
  write(path.join(ctx.customDir, 'skills/empty/SKILL.md'), '---\nname: empty\n---\nbody\n');
  const log = collect();
  const { cmdPick } = require('../lib/cmd-pick');
  cmdPick(ctx, ['custom', 'skills/block/SKILL.md', 'skills/empty/SKILL.md'], log);
  cmdRouter(ctx, [], log);
  const doc = fs.readFileSync(path.join(ctx.repoRoot, 'docs/SKILL-ROUTER.md'), 'utf8');
  assert.match(doc, /\| block \| spans two lines and is definitely long enough to pass the check \| ok \|/);
  assert.match(doc, /\| empty \| \(none\) \| weak trigger — consider rewriting \|/);
});

test('status does not report app-owned paths (skills/synced/, skills/.trash/) as unmanaged', () => {
  const { ctx } = setup();
  assert.equal(cmdSync(ctx, [], collect()), true);
  write(path.join(ctx.claudeHome, 'skills/synced/app-skill/SKILL.md'), 'app\n');
  write(path.join(ctx.claudeHome, 'skills/.trash/old/SKILL.md'), 'old\n');
  write(path.join(ctx.claudeHome, 'skills/stray/SKILL.md'), 'stray\n');
  const { cmdStatus } = require('../lib/cmd-sync');
  const slog = collect();
  cmdStatus(ctx, [], slog);
  assert.match(slog.text(), /other files under .* \(not myclaude.s; never touched\): 1/);
  assert.match(slog.text(), /skills\/stray\/SKILL\.md/);
  assert.doesNotMatch(slog.text(), /skills\/synced\//);
  assert.doesNotMatch(slog.text(), /skills\/\.trash\//);
});
