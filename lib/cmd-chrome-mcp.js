'use strict';

// `myclaude chrome-mcp <start|stop|status|doctor|setup|mcp>` — command layer over lib/chrome-mcp.js.

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const core = require('./chrome-mcp');
const { doctor } = require('./chrome-mcp-doctor');

const HELP = `myclaude chrome-mcp — one shared debug Chrome for every chrome-devtools MCP client

  start            start the shared Chrome on 127.0.0.1:<port>; does nothing if one already answers
  stop             quit only the shared Chrome (checks its --user-data-dir first)
  status           running or not, pid, Chrome version, tabs, bound address (exit 1 when down)
  doctor [--fix]   check endpoint, bind, node, Chrome, npx cache, MCP config; --fix clears a broken npx cache
  setup            register the user-level MCP entry: claude mcp add -s user chrome-devtools -- <this> mcp
  mcp              MCP server entry point: start if needed, then run ${core.MCP_PACKAGE} (stdout is MCP)

Env: CHROME_MCP_PORT (default ${core.DEFAULT_PORT}), CHROME_MCP_PROFILE (default ~/.chrome-mcp-profile)
Other Macs: ssh -N -L ${core.DEFAULT_PORT}:127.0.0.1:${core.DEFAULT_PORT} <this-mac>; never bind the port to the LAN.
`;

const MYCLAUDE_JS = path.join(__dirname, '..', 'myclaude.js');

function npxPath() {
  const sibling = path.join(path.dirname(process.execPath), 'npx');
  return fs.existsSync(sibling) ? sibling : 'npx';
}

function npxCacheDir(env = process.env) {
  return path.join(env.npm_config_cache || path.join(os.homedir(), '.npm'), '_npx');
}

// Runs chrome-devtools-mcp attached to our stdio; resolves with its exit code.
function runMcpServer(cfg) {
  return new Promise((resolve) => {
    const child = cp.spawn(npxPath(), ['-y', core.MCP_PACKAGE, '--browserUrl', cfg.url], { stdio: 'inherit' });
    const forward = (sig) => child.kill(sig);
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, forward);
    child.on('error', (err) => {
      process.stderr.write(`[chrome-mcp] could not run ${npxPath()}: ${err.message}\n`);
      resolve(1);
    });
    child.on('exit', (code, signal) => resolve(code !== null ? code : 128 + (os.constants.signals[signal] || 0)));
  });
}

const CLAUDE_TIMEOUT_MS = 60000;

function claude(args) {
  const r = cp.spawnSync('claude', ['mcp', ...args], { encoding: 'utf8', timeout: CLAUDE_TIMEOUT_MS });
  return { ok: !r.error && r.status === 0, text: `${r.stderr || ''}${r.stdout || ''}${r.error ? r.error.message : ''}`.trim() };
}

function currentUserEntry() {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8'));
    return (json.mcpServers && json.mcpServers[core.MCP_NAME]) || null;
  } catch {
    return null;
  }
}

// Replaces the user-level entry; if the add fails, the previous entry is put back.
function setup(log) {
  const entry = [process.execPath, MYCLAUDE_JS, 'chrome-mcp', 'mcp'];
  const previous = currentUserEntry();
  if (previous) {
    const removed = claude(['remove', '-s', 'user', core.MCP_NAME]);
    if (!removed.ok) {
      log(`error: claude mcp remove failed: ${removed.text}`);
      return false;
    }
  }
  const added = claude(['add', '-s', 'user', core.MCP_NAME, '--', ...entry]);
  if (added.ok) {
    log(`${previous ? 'replaced' : 'added'} user-level ${core.MCP_NAME}: ${entry.join(' ')}`);
    return true;
  }
  log(`error: claude mcp add failed: ${added.text}`);
  if (previous) {
    const restored = claude(['add-json', '-s', 'user', core.MCP_NAME, JSON.stringify(previous)]);
    log(restored.ok ? 'restored the previous entry' : `error: could not restore the previous entry: ${restored.text}`);
  }
  return false;
}

async function dispatch(sub, args, cfg, deps) {
  const out = (line) => process.stdout.write(`${line}\n`);
  const err = (line) => process.stderr.write(`[chrome-mcp] ${line}\n`);
  switch (sub) {
    case 'start': return core.start(cfg, deps, out);
    case 'stop': return core.stop(cfg, deps, out);
    case 'status': return core.status(cfg, deps, out);
    case 'setup': return setup(out);
    case 'doctor':
      return doctor(cfg, deps, out, {
        fix: args.includes('--fix'),
        npxDir: npxCacheDir(),
        claudeJsonPath: path.join(os.homedir(), '.claude.json'),
      });
    case 'mcp':
      // stdout belongs to the MCP protocol: log only to stderr here.
      if (!(await core.start(cfg, deps, err))) return 1;
      return runMcpServer(cfg);
    default:
      return null;
  }
}

async function main(argv) {
  const [sub, ...args] = argv;
  if (!sub || sub === 'help' || sub === '--help') {
    process.stdout.write(HELP);
    return 0;
  }
  try {
    const result = await dispatch(sub, args, core.config(), core.defaultDeps());
    if (result === null) {
      process.stderr.write(`unknown chrome-mcp command: ${sub}\n\n${HELP}`);
      return 2;
    }
    if (typeof result === 'number') return result;
    return result ? 0 : 1;
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    return 1;
  }
}

module.exports = { main, HELP };
