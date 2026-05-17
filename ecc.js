#!/usr/bin/env node
'use strict';

/**
 * ecc.js — Frank's lightweight ECC manager
 *
 * Cherry-pick files from upstream ECC repo, create your own,
 * track everything, detect upstream changes.
 *
 * Three sources, one install target (~/.claude/):
 *   - upstream : files cherry-picked from the ECC fork repo
 *   - bible    : skills cherry-picked from the claude-bible repo
 *                (forrestchang/andrej-karpathy-skills, default ~/claude-bible,
 *                 override with CLAUDE_BIBLE_DIR)
 *   - custom   : your own rules/skills/commands/agents under fsun_config/custom/
 *
 * Commands:
 *   node fsun_config/ecc.js pick <path> [path...]   Add upstream file(s) to install
 *   node fsun_config/ecc.js unpick <path> [path...]  Remove file(s) from install
 *   node fsun_config/ecc.js sync                     Copy all tracked files to ~/.claude/
 *   node fsun_config/ecc.js diff                     Show upstream changes since last sync
 *   node fsun_config/ecc.js ls                       List installed files
 *   node fsun_config/ecc.js ls upstream              List all available upstream files
 *   node fsun_config/ecc.js bible ls                 List skills available in claude-bible
 *   node fsun_config/ecc.js bible pick <path>        Track a claude-bible path
 *   node fsun_config/ecc.js bible unpick <path>      Stop tracking a claude-bible path
 *   node fsun_config/ecc.js bible update             git pull the claude-bible repo
 *   node fsun_config/ecc.js agents [--opus]          List/upgrade agent models
 *   node fsun_config/ecc.js own <path>               Create a new custom file
 *   node fsun_config/ecc.js status                   Verify installed vs tracked
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const SCRIPT_DIR = __dirname;
const MANIFEST_PATH = path.join(SCRIPT_DIR, 'manifest.json');
const HOME = process.env.HOME || require('os').homedir();
const ECC_ROOT = path.dirname(SCRIPT_DIR);
const CLAUDE_HOME = path.join(HOME, '.claude');
const CUSTOM_DIR = path.join(SCRIPT_DIR, 'custom');
const BIBLE_DIR = process.env.CLAUDE_BIBLE_DIR || path.join(HOME, 'claude-bible');

// ─── helpers ────────────────────────────────────────────────────────

function hash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 12);
}

function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return { upstream: [], bible: [], custom: [], hashes: {}, lastSync: null };
  }
  const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  // Backfill keys added after the manifest was first written.
  if (!Array.isArray(m.bible)) m.bible = [];
  if (!Array.isArray(m.custom)) m.custom = [];
  return m;
}

function saveManifest(m) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n');
}

function isUpstreamFile(relPath) {
  return fs.existsSync(path.join(ECC_ROOT, relPath));
}

function category(relPath) {
  const first = relPath.split('/')[0];
  if (['rules', 'agents', 'commands', 'skills', 'hooks', 'scripts'].includes(first)) return first;
  return 'other';
}

// ─── pick: add upstream files ───────────────────────────────────────

function pick(paths) {
  const m = loadManifest();
  let added = 0;

  for (let p of paths) {
    // Support glob-like: "rules/golang/" means all files in that dir
    const fullPath = path.join(ECC_ROOT, p);
    let filesToAdd = [];

    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      // Recursively add all files in directory
      function walk(dir, prefix) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const rel = path.join(prefix, e.name);
          if (e.isDirectory()) walk(path.join(dir, e.name), rel);
          else filesToAdd.push(rel);
        }
      }
      walk(fullPath, p.replace(/\/$/, ''));
    } else if (fs.existsSync(fullPath)) {
      filesToAdd.push(p);
    } else {
      console.log(`  NOT FOUND: ${p}`);
      continue;
    }

    for (const f of filesToAdd) {
      if (m.upstream.includes(f)) {
        console.log(`  ALREADY TRACKED: ${f}`);
        continue;
      }
      m.upstream.push(f);
      console.log(`  + ${f}`);
      added++;
    }
  }

  m.upstream.sort();
  saveManifest(m);
  console.log(`\nAdded ${added} file(s). Run 'sync' to copy to ~/.claude/`);
}

// ─── unpick: remove files ───────────────────────────────────────────

function unpick(paths) {
  const m = loadManifest();
  let removed = 0;

  for (const p of paths) {
    // Support directory unpick
    const before = m.upstream.length;
    m.upstream = m.upstream.filter(f => f !== p && !f.startsWith(p.replace(/\/?$/, '/')));
    const diff = before - m.upstream.length;

    if (diff > 0) {
      // Delete from ~/.claude/
      const dest = path.join(CLAUDE_HOME, p);
      if (fs.existsSync(dest)) {
        if (fs.statSync(dest).isDirectory()) {
          fs.rmSync(dest, { recursive: true });
        } else {
          fs.rmSync(dest);
        }
      }
      console.log(`  - ${p} (${diff} file${diff > 1 ? 's' : ''})`);
      removed += diff;
    } else {
      console.log(`  NOT TRACKED: ${p}`);
    }

    // Also clean from hashes
    for (const key of Object.keys(m.hashes)) {
      if (key === p || key.startsWith(p.replace(/\/?$/, '/'))) {
        delete m.hashes[key];
      }
    }
  }

  saveManifest(m);
  console.log(`\nRemoved ${removed} file(s).`);
}

// ─── sync: copy tracked files to ~/.claude/ ─────────────────────────

function sync(dryRun) {
  const m = loadManifest();
  let copied = 0;
  let unchanged = 0;
  let missing = 0;

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Syncing ${m.upstream.length} upstream + ${m.bible.length} bible + ${m.custom.length} custom files\n`);

  // Upstream files
  for (const relPath of m.upstream) {
    const src = path.join(ECC_ROOT, relPath);
    const dest = path.join(CLAUDE_HOME, relPath);

    if (!fs.existsSync(src)) {
      console.log(`  MISSING: ${relPath} (deleted upstream?)`);
      missing++;
      continue;
    }

    const srcH = hash(src);
    const destH = hash(dest);

    if (srcH === destH) {
      unchanged++;
      m.hashes[relPath] = srcH;
      continue;
    }

    console.log(`  ${destH ? 'UPDATE' : 'COPY'}: ${relPath}`);
    if (!dryRun) {
      ensureDir(dest);
      fs.copyFileSync(src, dest);
    }
    m.hashes[relPath] = srcH;
    copied++;
  }

  // Bible files (cherry-picked from the claude-bible repo)
  for (const relPath of m.bible) {
    const src = path.join(BIBLE_DIR, relPath);
    const dest = path.join(CLAUDE_HOME, relPath);

    if (!fs.existsSync(src)) {
      console.log(`  MISSING BIBLE: ${relPath} (run 'bible update'?)`);
      missing++;
      continue;
    }

    const srcH = hash(src);
    const destH = hash(dest);

    if (srcH === destH) {
      unchanged++;
      m.hashes[relPath] = srcH;
      continue;
    }

    console.log(`  ${destH ? 'UPDATE' : 'COPY'} (bible): ${relPath}`);
    if (!dryRun) {
      ensureDir(dest);
      fs.copyFileSync(src, dest);
    }
    m.hashes[relPath] = srcH;
    copied++;
  }

  // Custom files
  for (const relPath of m.custom) {
    const src = path.join(CUSTOM_DIR, relPath);
    const dest = path.join(CLAUDE_HOME, relPath);

    if (!fs.existsSync(src)) {
      console.log(`  MISSING CUSTOM: ${relPath}`);
      missing++;
      continue;
    }

    const srcH = hash(src);
    const destH = hash(dest);

    if (srcH === destH) {
      unchanged++;
      continue;
    }

    console.log(`  ${destH ? 'UPDATE' : 'COPY'} (custom): ${relPath}`);
    if (!dryRun) {
      ensureDir(dest);
      fs.copyFileSync(src, dest);
    }
    copied++;
  }

  m.lastSync = new Date().toISOString();
  if (!dryRun) saveManifest(m);
  console.log(`\n${copied} copied, ${unchanged} unchanged, ${missing} missing`);
}

// ─── diff: show upstream changes ────────────────────────────────────

function diff() {
  const m = loadManifest();
  if (!m.lastSync) {
    console.log('No previous sync. Run sync first.');
    return;
  }

  console.log(`Last sync: ${m.lastSync}\n`);
  let changed = 0;

  for (const relPath of m.upstream) {
    const src = path.join(ECC_ROOT, relPath);
    const currentH = hash(src);
    const prevH = m.hashes[relPath] || null;

    if (!currentH && prevH) {
      console.log(`  DELETED upstream: ${relPath}`);
      changed++;
    } else if (currentH && !prevH) {
      console.log(`  NEW (no hash): ${relPath}`);
      changed++;
    } else if (currentH !== prevH) {
      console.log(`  CHANGED: ${relPath}`);
      changed++;
    }
  }

  if (changed === 0) {
    console.log('No upstream changes in your tracked files.');
  } else {
    console.log(`\n${changed} file(s) changed. Run 'sync' to update.`);
  }
}

// ─── ls: list files ─────────────────────────────────────────────────

function ls(mode) {
  if (mode === 'upstream') {
    // List all available upstream files by category
    const dirs = ['rules', 'agents', 'commands', 'skills'];
    for (const dir of dirs) {
      const full = path.join(ECC_ROOT, dir);
      if (!fs.existsSync(full)) continue;
      console.log(`\n--- ${dir}/ ---`);
      function walk(d, prefix) {
        for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          const rel = path.join(prefix, e.name);
          if (e.isDirectory()) walk(path.join(d, e.name), rel);
          else console.log(`  ${rel}`);
        }
      }
      walk(full, dir);
    }
    return;
  }

  const m = loadManifest();

  // Group by category
  const groups = {};
  for (const f of m.upstream) {
    const cat = category(f);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(f);
  }

  for (const [cat, files] of Object.entries(groups).sort()) {
    console.log(`\n--- ${cat} (${files.length}) ---`);
    for (const f of files) console.log(`  ${f}`);
  }

  if (m.custom.length > 0) {
    console.log(`\n--- custom (${m.custom.length}) ---`);
    for (const f of m.custom) console.log(`  ${f}`);
  }

  console.log(`\nTotal: ${m.upstream.length} upstream + ${m.custom.length} custom`);
}

// ─── agents: list/upgrade models ────────────────────────────────────

function agents(upgradeModel) {
  const agentsDir = path.join(CLAUDE_HOME, 'agents');
  if (!fs.existsSync(agentsDir)) {
    console.log('No agents installed.');
    return;
  }

  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')).sort();
  let upgraded = 0;

  for (const file of files) {
    const full = path.join(agentsDir, file);
    const content = fs.readFileSync(full, 'utf8');
    const modelMatch = content.match(/^model:\s*(\S+)/m);
    const model = modelMatch ? modelMatch[1] : '(none)';
    const name = file.replace('.md', '');

    if (upgradeModel && model !== upgradeModel) {
      const newContent = content.replace(/^model:\s*\S+/m, `model: ${upgradeModel}`);
      fs.writeFileSync(full, newContent);
      console.log(`  ${name}: ${model} -> ${upgradeModel}`);
      upgraded++;
    } else {
      console.log(`  ${name}: ${model}`);
    }
  }

  if (upgradeModel) console.log(`\nUpgraded ${upgraded} agent(s) to ${upgradeModel}.`);
}

// ─── own: create custom file ────────────────────────────────────────

function own(relPath) {
  const m = loadManifest();
  const customSrc = path.join(CUSTOM_DIR, relPath);

  if (m.custom.includes(relPath)) {
    console.log(`Already tracked: ${relPath}`);
    console.log(`Edit: ${customSrc}`);
    return;
  }

  ensureDir(customSrc);

  // Create a starter template based on type
  const cat = category(relPath);
  let template = '';
  if (cat === 'rules') {
    template = `# ${path.basename(relPath, '.md')}\n\n> Custom rule — describe what Claude should always follow.\n\n## Guidelines\n\n- \n`;
  } else if (cat === 'commands') {
    template = `---\ndescription: Describe what this command does\n---\n\n# ${path.basename(relPath, '.md')}\n\n`;
  } else if (cat === 'skills') {
    template = `# ${path.basename(path.dirname(relPath))}\n\n## When to Use\n\n## How It Works\n\n## Examples\n\n`;
  } else if (cat === 'agents') {
    template = `---\nname: ${path.basename(relPath, '.md')}\ndescription: \ntools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"]\nmodel: opus\n---\n\n# ${path.basename(relPath, '.md')}\n\n`;
  } else {
    template = `# ${path.basename(relPath, '.md')}\n\n`;
  }

  fs.writeFileSync(customSrc, template);
  m.custom.push(relPath);
  m.custom.sort();
  saveManifest(m);

  console.log(`Created: ${customSrc}`);
  console.log(`Edit it, then run 'sync' to install to ~/.claude/${relPath}`);
}

// ─── bible: manage the claude-bible skills repo ─────────────────────

function bibleWalk(dir, prefix, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const rel = path.join(prefix, e.name);
    if (e.isDirectory()) bibleWalk(path.join(dir, e.name), rel, out);
    else out.push(rel);
  }
}

function bible(args) {
  const [sub, ...rest] = args;

  if (!fs.existsSync(BIBLE_DIR)) {
    console.log(`claude-bible not found at ${BIBLE_DIR}`);
    console.log('Clone it first:');
    console.log('  git clone https://github.com/forrestchang/andrej-karpathy-skills.git ' + BIBLE_DIR);
    console.log('Or set CLAUDE_BIBLE_DIR to its location.');
    return;
  }

  if (sub === 'update') {
    console.log(`Updating claude-bible (${BIBLE_DIR})...`);
    const outBuf = execFileSync('git', ['-C', BIBLE_DIR, 'pull', '--ff-only'], { encoding: 'utf8' });
    console.log(outBuf.trim());
    return;
  }

  if (sub === 'ls' || !sub) {
    const skillsRoot = path.join(BIBLE_DIR, 'skills');
    if (!fs.existsSync(skillsRoot)) {
      console.log(`No skills/ directory in ${BIBLE_DIR}`);
      return;
    }
    const m = loadManifest();
    const tracked = new Set(m.bible);
    const files = [];
    bibleWalk(skillsRoot, 'skills', files);
    console.log(`\n--- claude-bible skills (${BIBLE_DIR}) ---`);
    for (const f of files.sort()) {
      console.log(`  ${tracked.has(f) ? '*' : ' '} ${f}`);
    }
    console.log(`\n  * = tracked. Add with: bible pick <path>`);
    return;
  }

  if (sub === 'pick') {
    if (rest.length === 0) { console.log('Usage: bible pick <path> [path...]'); return; }
    const m = loadManifest();
    let added = 0;
    for (const p of rest) {
      const full = path.join(BIBLE_DIR, p);
      const filesToAdd = [];
      if (!fs.existsSync(full)) { console.log(`  NOT FOUND: ${p}`); continue; }
      if (fs.statSync(full).isDirectory()) bibleWalk(full, p.replace(/\/$/, ''), filesToAdd);
      else filesToAdd.push(p);
      for (const f of filesToAdd) {
        if (m.bible.includes(f)) { console.log(`  ALREADY TRACKED: ${f}`); continue; }
        m.bible.push(f);
        console.log(`  + ${f}`);
        added++;
      }
    }
    m.bible.sort();
    saveManifest(m);
    console.log(`\nAdded ${added} bible file(s). Run 'sync' to copy to ~/.claude/`);
    return;
  }

  if (sub === 'unpick') {
    if (rest.length === 0) { console.log('Usage: bible unpick <path> [path...]'); return; }
    const m = loadManifest();
    let removed = 0;
    for (const p of rest) {
      const before = m.bible.length;
      m.bible = m.bible.filter(f => f !== p && !f.startsWith(p.replace(/\/?$/, '/')));
      const n = before - m.bible.length;
      if (n > 0) {
        const dest = path.join(CLAUDE_HOME, p);
        if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
        for (const key of Object.keys(m.hashes)) {
          if (key === p || key.startsWith(p.replace(/\/?$/, '/'))) delete m.hashes[key];
        }
        console.log(`  - ${p} (${n} file${n > 1 ? 's' : ''})`);
        removed += n;
      } else {
        console.log(`  NOT TRACKED: ${p}`);
      }
    }
    saveManifest(m);
    console.log(`\nRemoved ${removed} bible file(s).`);
    return;
  }

  console.log(`Unknown bible subcommand: ${sub}`);
  console.log('Use: bible ls | bible pick <path> | bible unpick <path> | bible update');
}

// ─── status: verify installed ───────────────────────────────────────

function status() {
  const m = loadManifest();
  let installed = 0;
  let missing = 0;
  let extra = 0;

  const allTracked = new Set([...m.upstream, ...m.bible, ...m.custom]);

  for (const relPath of allTracked) {
    const dest = path.join(CLAUDE_HOME, relPath);
    if (fs.existsSync(dest)) {
      installed++;
    } else {
      console.log(`  MISSING: ${relPath}`);
      missing++;
    }
  }

  console.log(`\n${installed} installed, ${missing} missing`);
  console.log(`${m.upstream.length} upstream, ${m.bible.length} bible, ${m.custom.length} custom tracked`);
}

// ─── CLI ────────────────────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case 'pick':
    if (rest.length === 0) { console.log('Usage: pick <path> [path...]'); break; }
    pick(rest);
    break;

  case 'unpick':
    if (rest.length === 0) { console.log('Usage: unpick <path> [path...]'); break; }
    unpick(rest);
    break;

  case 'sync':
    sync(rest.includes('--dry-run'));
    break;

  case 'diff':
    diff();
    break;

  case 'ls':
    ls(rest[0]);
    break;

  case 'agents':
    agents(rest.includes('--opus') ? 'opus' : null);
    break;

  case 'bible':
    bible(rest);
    break;

  case 'own':
    if (rest.length === 0) { console.log('Usage: own <relative-path>'); break; }
    own(rest[0]);
    break;

  case 'status':
    status();
    break;

  default:
    console.log(`
ecc.js — Frank's ECC manager

Commands:
  pick <path> [path...]    Cherry-pick upstream file(s) or dir(s) to track
  unpick <path> [path...]  Stop tracking and remove from ~/.claude/
  sync                     Copy all tracked files to ~/.claude/ (--dry-run)
  diff                     Show upstream changes since last sync
  ls                       List tracked files
  ls upstream              List ALL available upstream files
  bible ls                 List skills available in claude-bible
  bible pick <path>        Track a claude-bible path
  bible unpick <path>      Stop tracking a claude-bible path
  bible update             git pull the claude-bible repo
  agents                   List agent models
  agents --opus            Upgrade all agents to opus
  own <path>               Create a custom file (rules/commands/skills/agents)
  status                   Verify installed vs tracked

Sources: upstream (ECC fork) + bible (~/claude-bible) + custom (fsun_config/custom/)

Examples:
  node fsun_config/ecc.js pick rules/golang/          # add all Go rules
  node fsun_config/ecc.js pick agents/go-reviewer.md  # add one agent
  node fsun_config/ecc.js unpick rules/web/            # remove web rules
  node fsun_config/ecc.js bible pick skills/karpathy-guidelines/  # add a bible skill
  node fsun_config/ecc.js own rules/frank/node-prefs.md  # create custom rule
  node fsun_config/ecc.js agents --opus                # upgrade all to opus
  node fsun_config/ecc.js sync                         # install to ~/.claude/
`);
}
