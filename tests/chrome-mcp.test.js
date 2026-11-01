'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('../lib/chrome-mcp');
const doc = require('../lib/chrome-mcp-doctor');

const CFG = core.config({}, '/Users/t');
const PROFILE_CMD = `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9222 --user-data-dir=${CFG.profile} --no-first-run`;
const VERSION = { Browser: 'Chrome/156.0.8078.48' };

// Fake world: `up` says whether Chrome answers; `lsof` is the listener list; calls are recorded.
function fakeDeps(state = {}) {
  const world = { up: false, lsof: [], psCommand: PROFILE_CMD, upAfterLaunch: true, downAfterKill: true, launchAddr: '127.0.0.1:9222', ...state };
  const calls = { run: [], kill: [] };
  let clock = 0;
  const deps = {
    chromeBin: '/chrome',
    exists: () => world.chromeExists !== false,
    mkdirp: () => {},
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    kill: (pid, sig) => {
      calls.kill.push([pid, sig]);
      if (world.downAfterKill) { world.up = false; world.lsof = []; }
    },
    fetchJson: async (url) => {
      if (!world.up) return null;
      if (url.endsWith('/json/version')) return VERSION;
      if (url.endsWith('/json/list')) return [{ type: 'page' }, { type: 'page' }, { type: 'service_worker' }];
      return null;
    },
    run: (cmd, args) => {
      calls.run.push([cmd, ...args]);
      if (cmd === 'lsof') return { status: 0, stdout: world.lsof.map((l) => `p${l.pid}\nn${l.addr}`).join('\n') };
      if (cmd === 'ps') return { status: 0, stdout: `${(world.psByPid && world.psByPid[args.at(-1)]) || world.psCommand}\n` };
      if (cmd.endsWith('/node')) return { status: 0, stdout: `${world.nodeVersion || 'v20.19.5'}\n` };
      if (cmd === 'open') {
        if (world.upAfterLaunch) { world.up = true; world.lsof = [{ pid: 4242, addr: world.launchAddr }]; }
        return { status: 0, stdout: '', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: 'unexpected' };
    },
  };
  return { deps, world, calls };
}

function capture() {
  const lines = [];
  return { log: (l) => lines.push(l), lines };
}

test('config: default port 9222 on loopback, profile under home', () => {
  assert.equal(CFG.port, 9222);
  assert.equal(CFG.url, 'http://127.0.0.1:9222');
  assert.equal(CFG.profile, '/Users/t/.chrome-mcp-profile');
});

test('config: rejects a port that is not an integer in 1024-65535', () => {
  assert.throws(() => core.config({ CHROME_MCP_PORT: '80' }, '/h'), /1024-65535/);
  assert.throws(() => core.config({ CHROME_MCP_PORT: 'abc' }, '/h'), /1024-65535/);
});

test('start: when Chrome already answers, says "already running" and launches nothing', async () => {
  const { deps, calls } = fakeDeps({ up: true, lsof: [{ pid: 1, addr: '127.0.0.1:9222' }] });
  const { log, lines } = capture();
  assert.equal(await core.start(CFG, deps, log), true);
  assert.match(lines[0], /^already running/);
  assert.equal(calls.run.filter((c) => c[0] === 'open').length, 0);
});

test('start: when down, launches real Google Chrome with loopback bind and the dedicated profile', async () => {
  const { deps, calls } = fakeDeps();
  const { log, lines } = capture();
  assert.equal(await core.start(CFG, deps, log), true);
  const open = calls.run.find((c) => c[0] === 'open');
  assert.deepEqual(open.slice(0, 4), ['open', '-na', 'Google Chrome', '--args']);
  assert.ok(open.includes('--remote-debugging-port=9222'));
  assert.ok(open.includes('--remote-debugging-address=127.0.0.1'));
  assert.ok(open.includes(`--user-data-dir=${CFG.profile}`));
  assert.match(lines.at(-1), /^started/);
});

test('start: fails with a clear message when Chrome never answers within the timeout', async () => {
  const { deps } = fakeDeps({ upAfterLaunch: false });
  const { log, lines } = capture();
  assert.equal(await core.start(CFG, deps, log), false);
  assert.match(lines.at(-1), /did not answer .* within 15s/);
});

test('start: does not launch when the port is held by something that is not DevTools', async () => {
  const { deps, calls } = fakeDeps({ lsof: [{ pid: 77, addr: '127.0.0.1:9222' }] });
  const { log, lines } = capture();
  assert.equal(await core.start(CFG, deps, log), false);
  assert.match(lines[0], /held by pid 77/);
  assert.equal(calls.run.filter((c) => c[0] === 'open').length, 0);
});

test('stop: refuses to kill a process that is not the shared Chrome profile', async () => {
  const { deps, calls } = fakeDeps({
    up: true,
    lsof: [{ pid: 9, addr: '127.0.0.1:9222' }],
    psCommand: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9222',
  });
  const { log, lines } = capture();
  assert.equal(await core.stop(CFG, deps, log), false);
  assert.match(lines[0], /^refused/);
  assert.equal(calls.kill.length, 0);
});

test('stop: sends SIGTERM to the shared Chrome and waits until the port is free', async () => {
  const { deps, calls } = fakeDeps({ up: true, lsof: [{ pid: 4242, addr: '127.0.0.1:9222' }] });
  const { log, lines } = capture();
  assert.equal(await core.stop(CFG, deps, log), true);
  assert.deepEqual(calls.kill, [[4242, 'SIGTERM']]);
  assert.match(lines.at(-1), /^stopped: pid 4242/);
});

test('stop: reports an error when the process keeps the port after the timeout', async () => {
  const { deps } = fakeDeps({ up: true, lsof: [{ pid: 4242, addr: '127.0.0.1:9222' }], downAfterKill: false });
  const { log, lines } = capture();
  assert.equal(await core.stop(CFG, deps, log), false);
  assert.match(lines.at(-1), /still in use 10s after SIGTERM to pid 4242/);
});

test('stop: nothing running is success with no kill', async () => {
  const { deps, calls } = fakeDeps();
  const { log } = capture();
  assert.equal(await core.stop(CFG, deps, log), true);
  assert.equal(calls.kill.length, 0);
});

test('isSharedChrome: matches the exact profile token, not a longer path with the same prefix', () => {
  assert.equal(core.isSharedChrome(PROFILE_CMD, CFG), true);
  assert.equal(core.isSharedChrome(PROFILE_CMD.replace(CFG.profile, `${CFG.profile}2`), CFG), false);
  assert.equal(core.isSharedChrome(`/usr/bin/chromium --user-data-dir=${CFG.profile}`, CFG), false);
});

test('status: down returns false; up reports pid, version, page tabs, and bound address', async () => {
  const down = fakeDeps();
  assert.equal(await core.status(CFG, down.deps, capture().log), false);
  const up = fakeDeps({ up: true, lsof: [{ pid: 4242, addr: '127.0.0.1:9222' }] });
  const { log, lines } = capture();
  assert.equal(await core.status(CFG, up.deps, log), true);
  const text = lines.join('\n');
  assert.match(text, /pid {6}4242/);
  assert.match(text, /chrome {3}Chrome\/156/);
  assert.match(text, /tabs {5}2/);
  assert.match(text, /bound {4}127\.0\.0\.1:9222/);
});

test('status: warns and fails when the port listens beyond loopback', async () => {
  const { deps } = fakeDeps({ up: true, lsof: [{ pid: 1, addr: '*:9222' }] });
  const { log, lines } = capture();
  assert.equal(await core.status(CFG, deps, log), false);
  assert.match(lines.join('\n'), /not loopback-only/);
});

test('nodeMeetsMinimum follows chrome-devtools-mcp engines', () => {
  for (const v of ['v20.19.0', 'v20.19.5', 'v22.12.0', 'v23.0.0', 'v24.1.0']) assert.equal(doc.nodeMeetsMinimum(v), true, v);
  for (const v of ['v18.20.0', 'v20.18.9', 'v21.7.0', 'v22.11.0', '']) assert.equal(doc.nodeMeetsMinimum(v), false, v);
});

function makeNpx() {
  const npxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npx-test-'));
  const entry = (hash, files) => {
    for (const [rel, body] of Object.entries(files)) {
      const p = path.join(npxDir, hash, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, body);
    }
    return path.join(npxDir, hash);
  };
  return { npxDir, entry };
}

test('doctor --fix removes only the broken chrome-devtools-mcp npx entry', async () => {
  const { npxDir, entry } = makeNpx();
  const pkg = JSON.stringify({ bin: { 'chrome-devtools-mcp': 'build/index.js' } });
  const good = entry('aaaaaaaaaaaaaaaa', { 'node_modules/chrome-devtools-mcp/package.json': pkg, 'node_modules/chrome-devtools-mcp/build/index.js': '' });
  const leftover = entry('bbbbbbbbbbbbbbbb', { 'node_modules/.chrome-devtools-mcp-x1y2/file': '' });
  const noBin = entry('cccccccccccccccc', { 'node_modules/chrome-devtools-mcp/package.json': pkg });
  const other = entry('dddddddddddddddd', { 'node_modules/left-pad/package.json': '{}' });
  const problems = Object.fromEntries(doc.scanNpxCache(npxDir).map((e) => [e.dir, e.problem]));
  assert.equal(problems[good], '');
  assert.match(problems[leftover], /ENOTEMPTY/);
  assert.match(problems[noBin], /bin file missing/);
  assert.equal(other in problems, false);

  const claudeJsonPath = path.join(npxDir, 'claude.json');
  fs.writeFileSync(claudeJsonPath, JSON.stringify({ mcpServers: { 'chrome-devtools': { command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest', '--browserUrl', CFG.url] } } }));
  const { deps } = fakeDeps({ up: true, lsof: [{ pid: 1, addr: '127.0.0.1:9222' }] });
  const { log } = capture();
  assert.equal(await doc.doctor(CFG, deps, log, { fix: true, npxDir, claudeJsonPath, nodeVersion: 'v20.19.5' }), true);
  assert.equal(fs.existsSync(good), true);
  assert.equal(fs.existsSync(other), true);
  assert.equal(fs.existsSync(leftover), false);
  assert.equal(fs.existsSync(noBin), false);
});

test('removeNpxEntry refuses a path outside the npx dir or without a 16-hex name', () => {
  const { npxDir, entry } = makeNpx();
  const odd = entry('not-a-hash', { x: '' });
  assert.throws(() => doc.removeNpxEntry(odd, npxDir), /refusing/);
  assert.throws(() => doc.removeNpxEntry('/tmp/aaaaaaaaaaaaaaaa', npxDir), /refusing/);
  assert.equal(fs.existsSync(odd), true);
});

test('mcpConfigFindings: user entry on the shared URL or the wrapper is ok; own-Chrome project overrides are listed', () => {
  const npxEntry = { command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest', '--browserUrl', CFG.url] };
  const wrapper = { command: '/n/node', args: ['/r/myclaude.js', 'chrome-mcp', 'mcp'] };
  const own = { command: 'npx', args: ['chrome-devtools-mcp@latest'] };
  const json = {
    mcpServers: { 'chrome-devtools': wrapper },
    projects: { '/p/a': { mcpServers: { 'chrome-devtools': own } }, '/p/b': { mcpServers: { 'chrome-devtools': npxEntry } }, '/p/c': {} },
  };
  const f = doc.mcpConfigFindings(json, CFG);
  assert.equal(f.userOk, true);
  assert.deepEqual(f.overrides, ['/p/a']);
  assert.equal(doc.mcpConfigFindings({}, CFG).userOk, false);
  assert.equal(doc.entryUsesSharedChrome({ command: 'npx', args: [`--browserUrl=${CFG.url}`] }, CFG), true);
});

test('config: rejects a relative CHROME_MCP_PROFILE', () => {
  assert.throws(() => core.config({ CHROME_MCP_PROFILE: 'rel/profile' }, '/h'), /absolute path/);
});

test('isLoopback: IPv4 and IPv6 loopback pass; wildcard and LAN addresses do not', () => {
  for (const a of ['127.0.0.1:9222', '[::1]:9222']) assert.equal(core.isLoopback(a), true, a);
  for (const a of ['*:9222', '192.168.4.25:9222', '[::]:9222']) assert.equal(core.isLoopback(a), false, a);
});

test('status: IPv4 + IPv6 loopback listeners are not reported as exposed', async () => {
  const { deps } = fakeDeps({ up: true, lsof: [{ pid: 1, addr: '127.0.0.1:9222' }, { pid: 1, addr: '[::1]:9222' }] });
  const { log, lines } = capture();
  assert.equal(await core.status(CFG, deps, log), true);
  assert.doesNotMatch(lines.join('\n'), /warning/);
});

test('start: reusing a Chrome with a different profile still succeeds but warns', async () => {
  const { deps } = fakeDeps({ up: true, lsof: [{ pid: 5, addr: '127.0.0.1:9222' }], psCommand: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=/other' });
  const { log, lines } = capture();
  assert.equal(await core.start(CFG, deps, log), true);
  assert.match(lines.join('\n'), /warning: the process on port 9222 is not the shared Chrome/);
});

test('start: a held port whose DevTools endpoint comes up within the grace counts as running', async () => {
  const { deps, world, calls } = fakeDeps({ lsof: [{ pid: 4242, addr: '127.0.0.1:9222' }] });
  const origSleep = deps.sleep;
  deps.sleep = async (ms) => { await origSleep(ms); world.up = true; };
  const { log, lines } = capture();
  assert.equal(await core.start(CFG, deps, log), true);
  assert.match(lines[0], /^already running/);
  assert.equal(calls.run.filter((c) => c[0] === 'open').length, 0);
});

test('start: fails when the launched Chrome listens beyond loopback', async () => {
  const { deps } = fakeDeps({ launchAddr: '*:9222' });
  const { log, lines } = capture();
  assert.equal(await core.start(CFG, deps, log), false);
  assert.match(lines.at(-1), /not loopback only/);
});

test('stop: refuses when any listener on the port is not the shared Chrome, and kills nothing', async () => {
  const { deps, calls } = fakeDeps({
    up: true,
    lsof: [{ pid: 4242, addr: '127.0.0.1:9222' }, { pid: 99, addr: '[::1]:9222' }],
    psByPid: { 99: '/usr/bin/other --listen 9222' },
  });
  const { log, lines } = capture();
  assert.equal(await core.stop(CFG, deps, log), false);
  assert.match(lines[0], /refused: pid 99/);
  assert.equal(calls.kill.length, 0);
});

test('checkEntryNode: fails when the MCP entry interpreter is older than the engines minimum', () => {
  const { npxDir } = makeNpx();
  const nodePath = path.join(npxDir, 'node');
  fs.writeFileSync(nodePath, '');
  const old = fakeDeps({ nodeVersion: 'v18.20.0' });
  const { log, lines } = capture();
  assert.equal(doc.checkEntryNode(nodePath, old.deps, log), false);
  assert.match(lines[0], /v18\.20\.0/);
  assert.equal(doc.checkEntryNode(nodePath, fakeDeps().deps, capture().log), true);
  assert.equal(doc.checkEntryNode('npx', old.deps, capture().log), true);
});
