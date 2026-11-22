#!/usr/bin/env node
'use strict';

// PreToolUse Bash guard.
// Data destruction asks, except in a project listed as sandbox in ~/.claude/environments.local.json.
// Infrastructure commands ask for production and unlabelled targets.
// A project declares itself in .claude/environment or in the local list. Rules: env-guard-rules.json.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const RULES = require('./env-guard-rules.json');

const DESTRUCTIVE = new RegExp(RULES.destructive, 'i');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const VALID_ENVS = new Set(['sandbox', 'nonprod', 'prod']);
const NONPROD_WORD = /(^|[^a-z0-9])(non-?prod|nonproduction|dev|development|test|staging|stage|sandbox|local)($|[^a-z0-9])/i;
const WRAPPER_VALUE_FLAGS = {
  sudo: ['-u', '-g', '-h', '-p', '-C', '-D', '-R', '-T'], doas: ['-u'], env: ['-u', '-C'], timeout: ['-k', '-s'], nice: ['-n'],
  xargs: ['-I', '-n', '-P', '-L', '-d', '-E', '-s'], command: [], exec: ['-a'], nohup: [], time: [], builtin: [],
};
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const REMOTE_RUNNERS = new Set(['ssh', 'docker', 'podman', 'kubectl']);
const KEYWORDS = new Set(['then', 'do', 'else', 'elif', 'if', 'while', 'until', '{', '}', '!', 'fi', 'done']);

function namesProd(text) {
  const cleaned = String(text).replace(/non-?prod(uction)?/gi, ' ');
  return /(^|[^a-z0-9])(prod|production|live)($|[^a-z0-9])/i.test(cleaned);
}

// ---- Shell parsing ----

function readBalanced(s, start) {
  let depth = 1;
  let quote = '';
  for (let i = start; i < s.length; i += 1) {
    const c = s[i];
    if (c === '\\' && quote !== "'") i += 1;
    else if (quote) { if (c === quote) quote = ''; } else if (c === "'" || c === '"') quote = c;
    else if (c === '(') depth += 1;
    else if (c === ')') { depth -= 1; if (depth === 0) return i; }
  }
  throw new Error('unbalanced substitution');
}

function substitutionsIn(text) {
  const subs = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\\') i += 1;
    else if (text[i] === '$' && text[i + 1] === '(') { const end = readBalanced(text, i + 2); subs.push(text.slice(i + 2, end)); i = end; } else if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end < 0) throw new Error('unbalanced backtick');
      subs.push(text.slice(i + 1, end));
      i = end;
    }
  }
  return subs;
}

function newCommand() { return { words: [], stdinFiles: [], stdinText: [], opaqueStdin: false, op: '', pipedFrom: null }; }

function parse(script) {
  const items = [];
  const subs = [];
  let cmd = newCommand();
  let word = null;
  let redirect = '';
  let pendingHeredocs = [];
  const startWord = () => { if (!word) word = { text: '', dynamic: false, quoted: false }; };
  const endWord = () => {
    if (!word) return;
    const w = word;
    word = null;
    if (redirect === '<') cmd.stdinFiles.push(w);
    else if (redirect === '<<<') cmd.stdinText.push(w);
    else if (redirect === '<<' || redirect === '<<-') pendingHeredocs.push({ delim: w.text, strip: redirect === '<<-', expand: !w.quoted, cmd });
    else if (!redirect) cmd.words.push(w);
    redirect = '';
  };
  const endCommand = (op) => {
    endWord();
    cmd.op = op;
    const previous = cmd;
    items.push({ type: 'cmd', cmd: previous });
    cmd = newCommand();
    if (op === '|' || op === '|&') cmd.pipedFrom = previous;
  };
  const readSub = (i) => {
    const end = readBalanced(script, i + 2);
    subs.push(script.slice(i + 2, end));
    startWord();
    word.dynamic = true;
    word.text += '$()';
    return end;
  };
  const readBacktick = (i) => {
    const end = script.indexOf('`', i + 1);
    if (end < 0) throw new Error('unbalanced backtick');
    subs.push(script.slice(i + 1, end));
    startWord();
    word.dynamic = true;
    word.text += '$()';
    return end;
  };
  let i = 0;
  while (i < script.length) {
    const c = script[i];
    const next = script[i + 1];
    if (c === '\\') { if (next !== '\n') { startWord(); word.text += next || ''; word.quoted = true; } i += 2; } else if (c === "'") {
      const end = script.indexOf("'", i + 1);
      if (end < 0) throw new Error('unterminated quote');
      startWord(); word.quoted = true; word.text += script.slice(i + 1, end); i = end + 1;
    } else if (c === '"') {
      startWord(); word.quoted = true; i += 1;
      while (i < script.length && script[i] !== '"') {
        if (script[i] === '\\') { word.text += script[i + 1] || ''; i += 2; } else if (script[i] === '$' && script[i + 1] === '(') i = readSub(i) + 1;
        else if (script[i] === '`') i = readBacktick(i) + 1;
        else { if (script[i] === '$') word.dynamic = true; word.text += script[i]; i += 1; }
      }
      if (i >= script.length) throw new Error('unterminated quote');
      i += 1;
    } else if (c === '$' && next === '(') { i = readSub(i) + 1; } else if (c === '`') { i = readBacktick(i) + 1; } else if (c === '$') { startWord(); word.dynamic = true; word.text += c; i += 1; } else if (c === '#' && !word) {
      while (i < script.length && script[i] !== '\n') i += 1;
    } else if (c === '\n') {
      endCommand('\n');
      i += 1;
      for (const h of pendingHeredocs) {
        const lines = [];
        let closed = false;
        while (i < script.length) {
          let eol = script.indexOf('\n', i);
          if (eol < 0) eol = script.length;
          const line = script.slice(i, eol);
          i = eol + 1;
          if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) { closed = true; break; }
          lines.push(line);
        }
        if (!closed) i = script.length;
        const body = lines.join('\n');
        h.cmd.stdinText.push({ text: body, dynamic: h.expand && /\$|`/.test(body), quoted: true });
        if (h.expand) subs.push(...substitutionsIn(body));
      }
      pendingHeredocs = [];
    } else if (c === ' ' || c === '\t') { endWord(); i += 1; } else if (c === ';') { endCommand(';'); i += next === ';' ? 2 : 1; } else if (c === '&' && next === '&') { endCommand('&&'); i += 2; } else if (c === '|' && next === '|') { endCommand('||'); i += 2; } else if (c === '|' && next === '&') { endCommand('|&'); i += 2; } else if (c === '|') { endCommand('|'); i += 1; } else if (c === '&' && next === '>') { endWord(); redirect = '>'; i += script[i + 2] === '>' ? 3 : 2; } else if (c === '&') { endCommand('&'); i += 1; } else if (c === '(') { endCommand(';'); items.push({ type: 'open' }); i += 1; } else if (c === ')') { endCommand(';'); items.push({ type: 'close' }); i += 1; } else if ((c === '<' || c === '>') && next === '(') {
      const end = readBalanced(script, i + 2);
      subs.push(script.slice(i + 2, end));
      if (c === '<') { if (redirect === '<') { cmd.opaqueStdin = true; redirect = ''; } else { startWord(); word.dynamic = true; word.text += '$()'; } }
      i = end + 1;
    } else if (c === '<' || c === '>') {
      if (word && /^\d+$/.test(word.text) && !word.quoted) word = null;
      endWord();
      if (c === '>') { redirect = '>'; i += next === '>' ? 2 : 1; if (script[i] === '&') i += 1; } else if (script.startsWith('<<<', i)) { redirect = '<<<'; i += 3; } else if (script.startsWith('<<-', i)) { redirect = '<<-'; i += 3; } else if (next === '<') { redirect = '<<'; i += 2; } else { redirect = '<'; i += 1; }
    } else { startWord(); word.text += c; i += 1; }
  }
  endCommand('');
  return { items: items.filter((x) => x.type !== 'cmd' || x.cmd.words.length || x.cmd.stdinText.length || x.cmd.stdinFiles.length), subs };
}

// ---- Environment ----

function real(p) { try { return fs.realpathSync(p); } catch { return path.resolve(p); } }
function within(dir, root) { return dir === root || dir.startsWith(root.endsWith(path.sep) ? root : root + path.sep); }

function registry(home) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'environments.local.json'), 'utf8'));
    return Object.entries(data).filter(([p, v]) => path.isAbsolute(p) && VALID_ENVS.has(v)).map(([p, v]) => [real(p), v]);
  } catch { return []; }
}

function listedEnv(cwd, home) {
  if (!cwd || !path.isAbsolute(cwd)) return null;
  const dir = real(cwd);
  const matches = registry(home).filter(([p]) => within(dir, p)).sort((a, b) => b[0].length - a[0].length);
  return matches.length ? matches[0][1] : null;
}

function declaredEnv(cwd, home = os.homedir()) {
  if (!cwd || !path.isAbsolute(cwd)) return 'unlabelled';
  const dir = real(cwd);
  const realHome = real(home);
  let fileValue = null;
  for (let d = dir; d !== path.dirname(d) && d !== realHome; d = path.dirname(d)) {
    let raw;
    try { raw = fs.readFileSync(path.join(d, '.claude', 'environment'), 'utf8'); } catch { continue; }
    const v = raw.trim().toLowerCase();
    fileValue = VALID_ENVS.has(v) ? v : 'unlabelled';
    break;
  }
  const listValue = listedEnv(cwd, home);
  if (fileValue === 'prod' || listValue === 'prod') return 'prod';
  return fileValue || listValue || 'unlabelled';
}

// Only the machine-local list can switch off data prompts: a cloned repo controls its own
// .claude/environment file, so that file alone must not disable them.
function dataPromptsOff(cwd, home) {
  return declaredEnv(cwd, home) === 'sandbox' && listedEnv(cwd, home) === 'sandbox';
}

function quiet(cmd, args, cwd) {
  try { return execFileSync(cmd, args, { cwd: cwd || undefined, encoding: 'utf8', timeout: 1000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}

function ambientTargets(tool, cwd, home) {
  const out = [];
  const read = (f) => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return ''; } };
  if ((tool === 'terraform' || tool === 'tofu') && cwd) out.push(read(path.join(cwd, '.terraform', 'environment')));
  if (tool === 'kubectl' || tool === 'helm') out.push(quiet('kubectl', ['config', 'current-context'], cwd));
  if (tool === 'gcloud') {
    const active = read(path.join(home, '.config', 'gcloud', 'active_config')) || 'default';
    const m = read(path.join(home, '.config', 'gcloud', 'configurations', `config_${active}`)).match(/^project\s*=\s*(.+)$/m);
    if (m) out.push(m[1]);
  }
  return out.filter(Boolean);
}

// ---- Classification ----

function flagValues(words, flags) {
  const out = [];
  words.forEach((w, i) => {
    for (const f of flags) {
      if (w.text === f && words[i + 1]) out.push(words[i + 1]);
      else if (f.startsWith('--') && w.text.startsWith(`${f}=`)) out.push({ ...w, text: w.text.slice(f.length + 1) });
      else if (!f.startsWith('--') && w.text.length > 2 && w.text.startsWith(f)) out.push({ ...w, text: w.text.slice(2) });
    }
  });
  return out;
}

function isTempPath(file, cwd) {
  if (!file || file.includes('..')) return false;
  const abs = path.isAbsolute(file) ? file : (cwd ? path.join(cwd, file) : null);
  if (!abs) return false;
  const roots = ['/tmp', '/private/tmp', '/var/folders', '/private/var/folders', os.tmpdir(), real(os.tmpdir())];
  const resolved = path.join(real(path.dirname(abs)), path.basename(abs));
  return roots.some((r) => resolved !== r && within(resolved, r));
}

function targetIsLocal(tool, rule, args, env, cwd, remote) {
  if (remote) return false;
  if (tool === 'sqlite3') {
    const db = args.find((w) => !w.text.startsWith('-'));
    if (!db) return true;
    if (db.dynamic) return false;
    return db.text === ':memory:' || isTempPath(db.text, cwd);
  }
  if (tool === 'bq') return false;
  const hosts = [];
  for (const v of flagValues(args, rule.host || [])) { if (v.dynamic) return false; hosts.push(v.text); }
  for (const w of args) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(w.text)) {
      if (w.dynamic) return false;
      try { hosts.push(new URL(w.text).hostname); } catch { return false; }
    }
    const m = w.text.match(/(?:^|\s)host=([^\s]+)/);
    if (m) { if (w.dynamic) return false; hosts.push(m[1]); }
  }
  if (tool === 'psql' && env.PGHOST !== undefined) hosts.push(env.PGHOST);
  else if (tool === 'psql' && process.env.PGHOST) hosts.push(process.env.PGHOST);
  return hosts.length > 0 && hosts.every((h) => LOCAL_HOSTS.has(h.toLowerCase()));
}

function readSqlFile(word, cwd) {
  if (word.dynamic) return null;
  try {
    const f = path.isAbsolute(word.text) ? word.text : path.join(cwd || '.', word.text);
    if (fs.statSync(f).size > 1024 * 1024) return null;
    return fs.readFileSync(f, 'utf8');
  } catch { return null; }
}

function sqlPayload(tool, rule, args, cmd, cwd) {
  const parts = [];
  let opaque = cmd.opaqueStdin;
  const addFile = (w) => { const t = readSqlFile(w, cwd); if (t === null) opaque = true; else parts.push(t); };
  for (const v of flagValues(args, rule.sql || [])) { if (v.dynamic) opaque = true; parts.push(v.text); }
  for (const v of flagValues(args, rule.file || [])) addFile(v);
  if (rule.positional || tool === 'bq') {
    const valueFlags = new Set(rule.value || []);
    let firstPositional = true;
    for (let i = 0; i < args.length; i += 1) {
      const w = args[i];
      if (valueFlags.has(w.text)) { i += 1; } else if (!w.text.startsWith('-')) {
        const isDb = tool === 'sqlite3' && firstPositional;
        firstPositional = false;
        if (!isDb) { if (w.dynamic) opaque = true; parts.push(w.text); }
      }
    }
  }
  for (const w of cmd.stdinText) { if (w.dynamic) opaque = true; parts.push(w.text); }
  for (const w of cmd.stdinFiles) addFile(w);
  if (cmd.pipedFrom) {
    const src = cmd.pipedFrom.words;
    const name = src[0] ? path.basename(src[0].text) : '';
    if (name === 'echo' || name === 'printf') { for (const w of src.slice(1)) { if (w.dynamic) opaque = true; parts.push(w.text); } } else if (name === 'cat' && src.length > 1) src.slice(1).filter((w) => !w.text.startsWith('-')).forEach(addFile);
    else if (name === 'cat' && (cmd.pipedFrom.stdinText.length || cmd.pipedFrom.stdinFiles.length)) {
      cmd.pipedFrom.stdinText.forEach((w) => { if (w.dynamic) opaque = true; parts.push(w.text); });
      cmd.pipedFrom.stdinFiles.forEach(addFile);
    } else opaque = true;
  }
  const text = parts.join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*--.*$/gm, ' ');
  return { text, opaque };
}

function matchWord(word, pattern) { return pattern.endsWith('*') ? word.startsWith(pattern.slice(0, -1)) : word === pattern; }

function forcePushInfo(args, cwd) {
  const texts = args.map((w) => w.text);
  const pushIdx = texts.indexOf('push');
  const rest = pushIdx >= 0 ? args.slice(pushIdx + 1) : [];
  const flags = rest.filter((w) => w.text.startsWith('-')).map((w) => w.text);
  const positional = [];
  for (let i = 0; i < rest.length; i += 1) {
    if (['--repo', '-o', '--push-option', '--receive-pack', '--exec'].includes(rest[i].text)) i += 1;
    else if (!rest[i].text.startsWith('-')) positional.push(rest[i]);
  }
  const refspecs = positional.slice(1);
  const deleteFlag = flags.some((f) => f === '--delete' || /^-[a-zA-Z]*d/.test(f));
  const force = flags.some((f) => f === '--force' || f.startsWith('--force-with-lease') || f === '--force-if-includes' || /^-[a-zA-Z]*f/.test(f)) || refspecs.some((r) => r.text.startsWith('+'));
  const del = deleteFlag || refspecs.some((r) => r.text.startsWith(':'));
  const wide = flags.some((f) => ['--mirror', '--all', '--branches', '--tags'].includes(f));
  if (!force && !del && !wide) return null;
  let branches = refspecs.map((r) => (r.dynamic ? '*' : r.text.replace(/^\+/, '').split(':').pop().replace(/^refs\/heads\//, '')));
  if (deleteFlag) branches = refspecs.map((r) => (r.dynamic ? '*' : r.text.replace(/^refs\/heads\//, '')));
  if (branches.includes('HEAD') || !branches.length) {
    const current = quiet('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd) || '*';
    branches = branches.length ? branches.map((b) => (b === 'HEAD' ? current : b)) : [current];
  }
  const protectedRef = wide || branches.some((b) => b === '*' || b === 'HEAD' || b === 'main' || b === 'master' || b.startsWith('release/'));
  return { protectedRef };
}

function gitFinding(args, cwd) {
  const texts = args.map((w) => w.text);
  if (texts.includes('push')) {
    const info = forcePushInfo(args, cwd);
    if (!info) return null;
    return info.protectedRef ? { cls: 'protected', why: 'force or delete push to a protected branch' } : { cls: 'infra', why: 'force or delete push' };
  }
  if (texts.includes('reset') && texts.includes('--hard')) return { cls: 'infra', why: 'git reset --hard' };
  if (texts.includes('branch') && texts.some((t) => t === '-D' || (t === '--delete' && texts.includes('--force')))) return { cls: 'infra', why: 'git branch -D' };
  return null;
}

function infraFinding(tool, args) {
  const texts = args.map((w) => w.text);
  if (tool === 'rm' && texts.some((t) => /^-[a-zA-Z]*[rR]/.test(t) || t === '--recursive')) return 'recursive rm';
  if (tool === 'find' && (texts.includes('-delete') || texts.some((t, i) => ['-exec', '-execdir'].includes(t) && path.basename(texts[i + 1] || '') === 'rm'))) return 'find delete';
  if (tool === 'gh' && texts[0] === 'release' && texts[1] === 'create') return 'gh release create';
  const words = RULES.infraCommands[tool];
  if (words && texts.some((t) => words.some((p) => matchWord(t, p)))) return `${tool} ${texts.find((t) => words.some((p) => matchWord(t, p)))}`;
  return null;
}

function targetLabel(tool, args, env, cwd, home) {
  const values = flagValues(args, RULES.targetFlags).map((w) => w.text);
  for (const k of RULES.targetEnv) { const v = env[k] ?? process.env[k]; if (v) values.push(v); }
  if (!values.length) values.push(...ambientTargets(tool, cwd, home));
  if (values.some(namesProd)) return 'prod';
  return values.length && values.every((v) => NONPROD_WORD.test(v)) ? 'nonprod' : 'none';
}

function unwrap(words, env) {
  let rest = words.slice();
  for (;;) {
    while (rest.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[0].text)) {
      const eq = rest[0].text.indexOf('=');
      env[rest[0].text.slice(0, eq)] = rest[0].dynamic ? '$dynamic' : rest[0].text.slice(eq + 1);
      rest = rest.slice(1);
    }
    while (rest.length && KEYWORDS.has(rest[0].text)) rest = rest.slice(1);
    if (!rest.length) return rest;
    const name = path.basename(rest[0].text);
    if (!(name in WRAPPER_VALUE_FLAGS)) return rest;
    if (name === 'env' && rest.some((w) => w.text === '-S' || w.text.startsWith('--split-string'))) throw new Error('env -S is not parsed');
    const valueFlags = WRAPPER_VALUE_FLAGS[name];
    let i = 1;
    while (i < rest.length) {
      const t = rest[i].text;
      if (valueFlags.includes(t)) i += 2;
      else if (t.startsWith('-')) i += 1;
      else if (name === 'timeout' && /^\d/.test(t)) i += 1;
      else break;
    }
    rest = rest.slice(i);
  }
}

function classify(script, state, depth = 0) {
  if (depth > 6) throw new Error('nesting too deep');
  const { items, subs } = parse(script);
  const findings = [];
  for (const s of subs) findings.push(...classify(s, { ...state, env: { ...state.env } }, depth + 1));
  const stack = [];
  let cwd = state.cwd;
  for (const item of items) {
    if (item.type === 'open') { stack.push(cwd); continue; }
    if (item.type === 'close') { if (stack.length) cwd = stack.pop(); continue; }
    const { cmd } = item;
    const env = { ...state.env };
    const argv = unwrap(cmd.words, env);
    if (!argv.length) continue;
    const tool = path.basename(argv[0].text);
    const args = argv.slice(1);
    const inlineTargets = RULES.targetEnv.filter((k) => env[k] !== undefined).map((k) => `${k}=${env[k]}`);
    const text = [...inlineTargets, ...argv.map((w) => w.text)].join(' ');
    if (tool === 'cd' || tool === 'pushd') {
      const target = args.find((w) => !w.text.startsWith('-'));
      let nextCwd = null;
      if (target && !target.dynamic && cwd) {
        const candidate = path.resolve(cwd, target.text.replace(/^~(?=\/|$)/, state.home));
        if (fs.existsSync(candidate)) nextCwd = real(candidate);
      }
      if (cmd.op === '&&' || cmd.op === ';' || cmd.op === '\n') cwd = nextCwd;
      else if (cmd.op === '||') cwd = null;
      continue;
    }
    if (SHELLS.has(tool)) {
      const idx = args.findIndex((w) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(w.text));
      if (idx >= 0 && args[idx + 1]) {
        if (args[idx + 1].dynamic) findings.push({ cls: 'infra', cwd, why: 'shell command that cannot be read', text });
        findings.push(...classify(args[idx + 1].text, { ...state, cwd, env }, depth + 1));
      } else {
        for (const w of cmd.stdinText) findings.push(...classify(w.text, { ...state, cwd, env }, depth + 1));
        if (cmd.pipedFrom || cmd.stdinFiles.length) findings.push({ cls: 'infra', cwd, why: 'script on stdin that cannot be read', text });
      }
      continue;
    }
    if (tool === 'eval') { findings.push(...classify(args.map((w) => w.text).join(' '), { ...state, cwd, env }, depth + 1)); continue; }
    if (REMOTE_RUNNERS.has(tool) && (tool === 'ssh' || args.some((w) => w.text === 'exec' || w.text === 'run'))) {
      const clientAt = args.findIndex((w) => RULES.clients[path.basename(w.text)] || SHELLS.has(path.basename(w.text)));
      const joined = clientAt >= 0 ? args.slice(clientAt).map((w) => (/\s/.test(w.text) ? `'${w.text.replace(/'/g, `'\\''`)}'` : w.text)).join(' ') : args.filter((w) => /\s/.test(w.text)).map((w) => w.text).join('; ');
      if (joined) findings.push(...classify(joined, { ...state, cwd, env, remote: true }, depth + 1));
      if (tool !== 'kubectl') continue;
    }
    let effectiveCwd = cwd;
    const chdir = args.find((w) => w.text.startsWith('-chdir='));
    if (chdir && cwd) effectiveCwd = chdir.dynamic ? null : path.resolve(cwd, chdir.text.slice(7));
    if (tool === 'git') {
      const c = args.findIndex((w) => w.text === '-C');
      if (c >= 0 && args[c + 1] && cwd) effectiveCwd = args[c + 1].dynamic ? null : path.resolve(cwd, args[c + 1].text);
      const f = gitFinding(args, effectiveCwd);
      if (f) findings.push({ ...f, cwd: effectiveCwd, tool, args, env, text });
      continue;
    }
    const rule = RULES.clients[tool];
    if (rule || (tool === 'bq' && args.some((w) => w.text === 'query'))) {
      const r = rule || {};
      const payload = sqlPayload(tool, r, args, cmd, cwd);
      const destructive = DESTRUCTIVE.test(payload.text);
      if ((destructive || payload.opaque) && !targetIsLocal(tool, r, args, env, cwd, state.remote)) {
        findings.push({ cls: 'data', cwd, text, why: destructive ? `destructive statement sent to ${tool}` : `${tool} input that cannot be read` });
      }
      continue;
    }
    const texts = args.map((w) => w.text);
    const dataRule = RULES.dataCommands.find(([t, ...sub]) => t === tool && sub.every((s) => texts.includes(s)));
    if (dataRule) { findings.push({ cls: 'data', cwd, text, why: dataRule.join(' ') }); continue; }
    const why = infraFinding(tool, args);
    if (why) findings.push({ cls: 'infra', why, cwd: effectiveCwd, tool, args, env, text });
  }
  return findings;
}

function decide(input, home = os.homedir()) {
  if (!input || typeof input !== 'object') return { ask: true, reason: 'malformed hook input' };
  if (input.tool_name && input.tool_name !== 'Bash') return { ask: false };
  const command = input.tool_input && input.tool_input.command;
  const cwd = typeof input.cwd === 'string' ? input.cwd : null;
  if (typeof command !== 'string') return { ask: true, reason: 'malformed hook input' };
  let findings;
  try {
    findings = classify(command, { cwd: cwd && path.isAbsolute(cwd) ? real(cwd) : null, env: {}, home, remote: false });
  } catch (err) {
    if (declaredEnv(cwd, home) === 'sandbox') return { ask: false };
    return { ask: true, reason: `could not parse the command (${err.message})` };
  }
  for (const f of findings) {
    if (f.cls === 'protected') return { ask: true, reason: f.why };
    if (f.cls !== 'data') continue;
    if (namesProd(f.text)) return { ask: true, reason: `data destruction on a production target: ${f.why}` };
    if (!dataPromptsOff(f.cwd, home)) return { ask: true, reason: `data destruction: ${f.why}` };
  }
  for (const f of findings) {
    if (f.cls !== 'infra') continue;
    const declared = declaredEnv(f.cwd, home);
    if (declared === 'prod') return { ask: true, reason: `production project: ${f.why}` };
    if (f.text && namesProd(f.text)) return { ask: true, reason: `command names production: ${f.why}` };
    if (declared === 'sandbox' || declared === 'nonprod') continue;
    const label = f.tool ? targetLabel(f.tool, f.args, f.env, f.cwd, home) : 'none';
    if (label !== 'nonprod') return { ask: true, reason: `unlabelled or production target: ${f.why}. Declare the project in .claude/environment if it is not production.` };
  }
  return { ask: false };
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { raw += d; });
  process.stdin.on('end', () => {
    let result;
    try { result = decide(JSON.parse(raw)); } catch (err) { result = { ask: true, reason: `guard error: ${err.message}` }; }
    if (result.ask) {
      process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: `production-safety: ${result.reason}` } })}\n`);
    }
    process.exit(0);
  });
}

if (require.main === module) main();
module.exports = { decide, declaredEnv, parse, namesProd };
