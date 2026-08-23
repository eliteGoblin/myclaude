'use strict';

// Test fixtures: isolated repo root, claude home, sources dir, and a local git source.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { buildCtx, emptyManifest, saveManifest } = require('../lib/manifest');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function makeTempCtx() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'myclaude-test-'));
  const ctx = buildCtx({
    repoRoot: path.join(root, 'repo'),
    claudeHome: path.join(root, 'claude'),
    sourcesDir: path.join(root, 'sources'),
  });
  fs.mkdirSync(ctx.customDir, { recursive: true });
  fs.mkdirSync(ctx.claudeHome, { recursive: true });
  saveManifest(ctx, emptyManifest());
  return { root, ctx };
}

// A local bare-ish git repo that acts as a remote source with the given files.
function makeSourceRepo(root, name, files) {
  const dir = path.join(root, `${name}-origin`);
  fs.mkdirSync(dir, { recursive: true });
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.email', 't@example.com'], dir);
  git(['config', 'user.name', 'test'], dir);
  commitFiles(dir, files, 'initial');
  return dir;
}

function commitFiles(dir, files, message) {
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', message], dir);
  return git(['rev-parse', 'HEAD'], dir);
}

function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function collect() {
  const lines = [];
  const log = (l) => lines.push(l);
  log.lines = lines;
  log.text = () => lines.join('\n');
  return log;
}

module.exports = { git, makeTempCtx, makeSourceRepo, commitFiles, write, read, collect };
