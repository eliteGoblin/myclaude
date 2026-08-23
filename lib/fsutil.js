'use strict';

// File-system and hashing helpers. No state, no I/O outside the paths given.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HASH_LEN = 12;

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function shortHash(buf) {
  return sha256(buf).slice(0, HASH_LEN);
}

function hashFile(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  return shortHash(fs.readFileSync(filePath));
}

// Recursive file list under dir, relative POSIX paths, sorted, `.git` skipped.
function walk(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  const out = [];
  const visit = (d, prefix) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) visit(path.join(d, e.name), rel);
      else out.push(rel);
    }
  };
  visit(dir, '');
  return out.sort();
}

// Directory hash = short sha256 over the sorted list of "relpath\0sha256\n".
function hashDir(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  const lines = walk(dir).map((rel) => `${rel}\0${sha256(fs.readFileSync(path.join(dir, rel)))}\n`);
  return shortHash(lines.join(''));
}

// Hash of a path that may be a file or a directory (isDir tells which is expected).
function hashPath(p, isDir) {
  return isDir ? hashDir(p) : hashFile(p);
}

function ensureParent(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function copyFile(src, dest) {
  ensureParent(dest);
  fs.copyFileSync(src, dest);
}

// Mirror src dir into dest dir: copy every file, remove files not in src.
function copyDirMirror(src, dest) {
  const srcFiles = walk(src);
  const keep = new Set(srcFiles);
  for (const rel of srcFiles) copyFile(path.join(src, rel), path.join(dest, rel));
  for (const rel of walk(dest)) {
    if (!keep.has(rel)) fs.rmSync(path.join(dest, rel));
  }
}

function removePath(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function readJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, obj) {
  ensureParent(p);
  fs.writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`);
}

module.exports = {
  sha256,
  shortHash,
  hashFile,
  hashDir,
  hashPath,
  walk,
  ensureParent,
  copyFile,
  copyDirMirror,
  removePath,
  readJson,
  writeJson,
};
