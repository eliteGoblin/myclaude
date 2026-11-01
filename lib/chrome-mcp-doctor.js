'use strict';

// chrome-mcp doctor — checks the endpoint, Node version, npx cache, and MCP config, and can clear a
// corrupted npx cache entry for chrome-devtools-mcp (`--fix`).

const fs = require('fs');
const path = require('path');
const core = require('./chrome-mcp');

const PKG = 'chrome-devtools-mcp';
const NPX_HASH = /^[0-9a-f]{16}$/;

// Mirrors chrome-devtools-mcp 1.12.0 package.json engines: "^20.19.0 || ^22.12.0 || >=23".
function nodeMeetsMinimum(version) {
  const m = /^v?(\d+)\.(\d+)\./.exec(version || '');
  if (!m) return false;
  const [major, minor] = [Number(m[1]), Number(m[2])];
  return (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major >= 23;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function binTargets(pkg) {
  if (typeof pkg.bin === 'string') return [pkg.bin];
  return pkg.bin && typeof pkg.bin === 'object' ? Object.values(pkg.bin) : [];
}

// Returns why one ~/.npm/_npx/<hash> entry for chrome-devtools-mcp is broken, '' if it is fine,
// or null when the entry does not hold chrome-devtools-mcp at all.
function npxEntryProblem(entryDir) {
  const modules = path.join(entryDir, 'node_modules');
  let names;
  try {
    names = fs.readdirSync(modules);
  } catch {
    return null;
  }
  const leftovers = names.filter((n) => n.startsWith(`.${PKG}-`));
  if (!names.includes(PKG) && leftovers.length === 0) return null;
  if (leftovers.length) return `leftover npm temp dir ${leftovers[0]} (causes ENOTEMPTY)`;
  const pkgDir = path.join(modules, PKG);
  const pkg = readJson(path.join(pkgDir, 'package.json'));
  if (!pkg) return 'package.json missing or unreadable';
  const missing = binTargets(pkg).find((b) => !fs.existsSync(path.join(pkgDir, b)));
  return missing ? `bin file missing: ${missing}` : '';
}

function scanNpxCache(npxDir) {
  let entries;
  try {
    entries = fs.readdirSync(npxDir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => NPX_HASH.test(name))
    .map((name) => ({ dir: path.join(npxDir, name), problem: npxEntryProblem(path.join(npxDir, name)) }))
    .filter((e) => e.problem !== null);
}

function entryUsesSharedChrome(entry, cfg) {
  const words = [entry.command, ...(entry.args || [])].map(String);
  const joined = words.join(' ');
  const wrapper = words.includes('chrome-mcp') && words.includes('mcp');
  return wrapper || joined.includes(`--browserUrl ${cfg.url}`) || joined.includes(`--browserUrl=${cfg.url}`);
}

// Reads ~/.claude.json (never writes it): the user-level entry and project-level overrides.
function mcpConfigFindings(claudeJson, cfg) {
  const user = claudeJson && claudeJson.mcpServers && claudeJson.mcpServers[core.MCP_NAME];
  const projects = (claudeJson && claudeJson.projects) || {};
  const overrides = Object.entries(projects)
    .filter(([, p]) => p && p.mcpServers && p.mcpServers[core.MCP_NAME])
    .filter(([, p]) => !entryUsesSharedChrome(p.mcpServers[core.MCP_NAME], cfg))
    .map(([dir]) => dir);
  return { user: user || null, userOk: Boolean(user && entryUsesSharedChrome(user, cfg)), overrides };
}

function removeNpxEntry(dir, npxDir) {
  // Gate: only an existing <npxDir>/<16-hex> directory is ever removed.
  if (path.dirname(dir) !== npxDir || !NPX_HASH.test(path.basename(dir)) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`refusing to remove unexpected path ${dir}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

function checkCache(npxDir, fix, log) {
  const broken = scanNpxCache(npxDir).filter((e) => e.problem);
  if (broken.length === 0) {
    log(`ok    npx cache: no broken ${PKG} entry under ${npxDir}`);
    return true;
  }
  for (const e of broken) {
    if (fix) {
      removeNpxEntry(e.dir, npxDir);
      log(`fixed npx cache: removed ${e.dir} (${e.problem})`);
    } else {
      log(`FAIL  npx cache: ${e.dir}: ${e.problem} (run: myclaude chrome-mcp doctor --fix)`);
    }
  }
  return fix;
}

// The MCP entry runs under its own interpreter (an absolute nvm path after `setup`): check that one.
function checkEntryNode(cmd, deps, log) {
  if (!cmd || path.basename(cmd) !== 'node' || !fs.existsSync(cmd)) return true;
  const version = deps.run(cmd, ['--version']).stdout.trim();
  const ok = nodeMeetsMinimum(version);
  if (!ok) log(`FAIL  mcp config: ${cmd} is ${version || 'unreadable'}; ${PKG} needs ^20.19.0, ^22.12.0, or >=23 (run: myclaude chrome-mcp setup)`);
  return ok;
}

function checkConfig(claudeJsonPath, cfg, deps, log) {
  const found = mcpConfigFindings(readJson(claudeJsonPath), cfg);
  let ok = true;
  if (found.userOk) log(`ok    mcp config: user-level ${core.MCP_NAME} uses ${cfg.url}`);
  else {
    ok = false;
    log(`FAIL  mcp config: user-level ${core.MCP_NAME} ${found.user ? 'does not use' : 'is missing; it should use'} ${cfg.url} (run: myclaude chrome-mcp setup)`);
  }
  for (const dir of found.overrides) {
    ok = false;
    log(`FAIL  mcp config: project override launches its own Chrome: ${dir}`);
    log(`        fix: (cd "${dir}" && claude mcp remove -s local ${core.MCP_NAME})`);
  }
  const cmd = found.user && found.user.command;
  if (cmd && path.isAbsolute(cmd) && !fs.existsSync(cmd)) {
    ok = false;
    log(`FAIL  mcp config: command not found: ${cmd} (run: myclaude chrome-mcp setup)`);
  }
  return checkEntryNode(cmd, deps, log) && ok;
}

async function doctor(cfg, deps, log, opts = {}) {
  const results = [];
  const up = await core.probe(cfg, deps);
  log(up ? `ok    endpoint: ${cfg.url} answers (${up.Browser})` : `FAIL  endpoint: nothing answers on ${cfg.url} (run: myclaude chrome-mcp start)`);
  results.push(Boolean(up));
  const exposed = core.exposedAddrs(core.listeners(cfg, deps));
  log(exposed.length ? `FAIL  bind: port ${cfg.port} listens on ${exposed[0]}; it must be loopback only` : `ok    bind: loopback only`);
  results.push(exposed.length === 0);
  const nodeOk = nodeMeetsMinimum(opts.nodeVersion || process.version);
  log(`${nodeOk ? 'ok   ' : 'FAIL '} node: ${opts.nodeVersion || process.version} (${PKG} needs ^20.19.0, ^22.12.0, or >=23)`);
  results.push(nodeOk);
  const chromeOk = deps.exists(deps.chromeBin);
  log(`${chromeOk ? 'ok   ' : 'FAIL '} chrome: ${deps.chromeBin}`);
  results.push(chromeOk);
  results.push(checkCache(opts.npxDir, Boolean(opts.fix), log));
  results.push(checkConfig(opts.claudeJsonPath, cfg, deps, log));
  return results.every(Boolean);
}

module.exports = { checkEntryNode, nodeMeetsMinimum, npxEntryProblem, scanNpxCache, mcpConfigFindings, entryUsesSharedChrome, removeNpxEntry, doctor };
