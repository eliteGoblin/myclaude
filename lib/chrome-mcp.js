'use strict';

// chrome-mcp — one shared debug Chrome on 127.0.0.1 that every chrome-devtools MCP client reuses,
// so all Claude sessions share one logged-in profile. Requirements: requirements/features/chrome-mcp-shared.md; usage: mcp_recipes/chrome.md.

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const DEFAULT_PORT = 9222;
const HOST = '127.0.0.1';
const START_TIMEOUT_MS = 15000;
const HELD_GRACE_MS = 5000;
const STOP_TIMEOUT_MS = 10000;
const POLL_MS = 250;
const PROBE_TIMEOUT_MS = 1500;
const RUN_TIMEOUT_MS = 5000;
const CHROME_APP = 'Google Chrome';
const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// Pinned: the server controls a logged-in browser, so upgrades are deliberate (verified 2026-10-25).
const MCP_PACKAGE = 'chrome-devtools-mcp@1.12.0';
const MCP_NAME = 'chrome-devtools';

function config(env = process.env, home = os.homedir()) {
  const raw = env.CHROME_MCP_PORT || String(DEFAULT_PORT);
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`CHROME_MCP_PORT must be an integer 1024-65535, got "${raw}"`);
  }
  const profile = env.CHROME_MCP_PROFILE || path.join(home, '.chrome-mcp-profile');
  if (!path.isAbsolute(profile)) throw new Error(`CHROME_MCP_PROFILE must be an absolute path, got "${profile}"`);
  return { port, url: `http://${HOST}:${port}`, profile, home };
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function run(cmd, args) {
  const r = cp.spawnSync(cmd, args, { encoding: 'utf8', timeout: RUN_TIMEOUT_MS });
  return { status: r.error ? -1 : r.status, stdout: r.stdout || '', stderr: r.stderr || String(r.error || '') };
}

function defaultDeps() {
  return {
    fetchJson,
    run,
    kill: (pid, sig) => process.kill(pid, sig),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    exists: (p) => fs.existsSync(p),
    mkdirp: (p) => fs.mkdirSync(p, { recursive: true }),
    chromeBin: CHROME_BIN,
  };
}

// Returns the /json/version payload when a Chrome DevTools endpoint answers, else null.
async function probe(cfg, deps) {
  const v = await deps.fetchJson(`${cfg.url}/json/version`);
  return v && typeof v.Browser === 'string' ? v : null;
}

// Parses `lsof -nP -iTCP:<port> -sTCP:LISTEN -Fpn` into [{ pid, addr }].
function parseLsof(text) {
  const out = [];
  let pid = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    else if (line.startsWith('n') && pid) out.push({ pid, addr: line.slice(1) });
  }
  return out;
}

function listeners(cfg, deps) {
  const r = deps.run('lsof', ['-nP', `-iTCP:${cfg.port}`, '-sTCP:LISTEN', '-Fpn']);
  return parseLsof(r.stdout);
}

function isLoopback(addr) {
  return addr.startsWith(`${HOST}:`) || addr.startsWith('[::1]:');
}

function exposedAddrs(held) {
  return [...new Set(held.map((l) => l.addr))].filter((a) => !isLoopback(a));
}

function processCommand(pid, deps) {
  return deps.run('ps', ['-o', 'command=', '-p', String(pid)]).stdout.trim();
}

// True only for the shared debug Chrome: real Google Chrome with exactly our profile dir.
function isSharedChrome(command, cfg) {
  const padded = ` ${command} `;
  return padded.includes('Google Chrome.app/') && padded.includes(` --user-data-dir=${cfg.profile} `);
}

function uniquePids(held) {
  return [...new Set(held.map((l) => l.pid))];
}

function chromeArgs(cfg) {
  return [
    `--remote-debugging-port=${cfg.port}`,
    `--remote-debugging-address=${HOST}`,
    `--user-data-dir=${cfg.profile}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
}

async function waitFor(check, timeoutMs, deps) {
  const deadline = deps.now() + timeoutMs;
  while (deps.now() < deadline) {
    if (await check()) return true;
    await deps.sleep(POLL_MS);
  }
  return check();
}

function reportRunning(cfg, deps, version, log) {
  log(`already running: ${cfg.url} (${version.Browser})`);
  const pids = uniquePids(listeners(cfg, deps));
  if (pids.length && !pids.every((pid) => isSharedChrome(processCommand(pid, deps), cfg))) {
    log(`  warning: the process on port ${cfg.port} is not the shared Chrome (profile ${cfg.profile})`);
  }
  return true;
}

// The port is held but DevTools does not answer: give a Chrome that is still starting a short grace.
async function waitForHeldPort(cfg, deps, log) {
  const version = await waitFor(async () => Boolean(await probe(cfg, deps)), HELD_GRACE_MS, deps);
  if (version) return reportRunning(cfg, deps, await probe(cfg, deps), log);
  log(`error: port ${cfg.port} is held by pid ${listeners(cfg, deps)[0]?.pid ?? '?'}, which is not a Chrome DevTools endpoint`);
  return false;
}

async function launch(cfg, deps, log) {
  if (!deps.exists(deps.chromeBin)) {
    log(`error: Google Chrome not found at ${deps.chromeBin}`);
    return false;
  }
  deps.mkdirp(cfg.profile);
  const r = deps.run('open', ['-na', CHROME_APP, '--args', ...chromeArgs(cfg)]);
  if (r.status !== 0) {
    log(`error: could not launch Chrome: ${r.stderr.trim()}`);
    return false;
  }
  if (!(await waitFor(async () => Boolean(await probe(cfg, deps)), START_TIMEOUT_MS, deps))) {
    log(`error: Chrome did not answer on ${cfg.url}/json/version within ${START_TIMEOUT_MS / 1000}s`);
    return false;
  }
  const exposed = exposedAddrs(listeners(cfg, deps));
  if (exposed.length) {
    log(`error: Chrome listens on ${exposed.join(', ')}, not loopback only; run: myclaude chrome-mcp stop`);
    return false;
  }
  log(`started: ${cfg.url} (profile ${cfg.profile})`);
  return true;
}

async function start(cfg, deps, log) {
  const running = await probe(cfg, deps);
  if (running) return reportRunning(cfg, deps, running, log);
  if (listeners(cfg, deps).length > 0) return waitForHeldPort(cfg, deps, log);
  return launch(cfg, deps, log);
}

async function stop(cfg, deps, log) {
  const pids = uniquePids(listeners(cfg, deps));
  if (pids.length === 0) {
    log(`not running on ${cfg.url}`);
    return true;
  }
  const foreign = pids.filter((pid) => !isSharedChrome(processCommand(pid, deps), cfg));
  if (foreign.length) {
    log(`refused: pid ${foreign.join(', ')} on port ${cfg.port} is not the shared Chrome (profile ${cfg.profile}); not stopping`);
    return false;
  }
  for (const pid of pids) deps.kill(pid, 'SIGTERM');
  const down = await waitFor(() => listeners(cfg, deps).length === 0, STOP_TIMEOUT_MS, deps);
  if (!down) {
    log(`error: port ${cfg.port} is still in use ${STOP_TIMEOUT_MS / 1000}s after SIGTERM to pid ${pids.join(', ')}`);
    return false;
  }
  log(`stopped: pid ${pids.join(', ')}`);
  return true;
}

async function status(cfg, deps, log) {
  const v = await probe(cfg, deps);
  if (!v) {
    log(`not running: nothing answers on ${cfg.url} (run: myclaude chrome-mcp start)`);
    return false;
  }
  const held = listeners(cfg, deps);
  const pages = (await deps.fetchJson(`${cfg.url}/json/list`)) || [];
  const tabs = Array.isArray(pages) ? pages.filter((p) => p.type === 'page').length : 0;
  const addrs = [...new Set(held.map((l) => l.addr))];
  log(`running: ${cfg.url}`);
  log(`  pid      ${held.length ? uniquePids(held).join(', ') : 'unknown'}`);
  log(`  chrome   ${v.Browser}`);
  log(`  tabs     ${tabs}`);
  log(`  bound    ${addrs.join(', ') || 'unknown'}`);
  const exposed = exposedAddrs(held);
  if (exposed.length) log(`  warning: not loopback-only (${exposed.join(', ')}); the debug port has no authentication`);
  return exposed.length === 0;
}

module.exports = {
  DEFAULT_PORT, HOST, MCP_PACKAGE, MCP_NAME,
  config, defaultDeps, probe, parseLsof, listeners, isLoopback, exposedAddrs, processCommand, isSharedChrome, chromeArgs,
  start, stop, status,
};
