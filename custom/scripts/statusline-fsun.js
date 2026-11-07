#!/usr/bin/env node
'use strict';

// Sources: Claude Code status line docs (https://code.claude.com/docs/en/statusline): input JSON fields
// model, context_window.used_percentage, rate_limits.{five_hour,seven_day}.{used_percentage,resets_at}.
// Status line command: reads that JSON from stdin, prints one short line, and writes the plan usage cache
// (~/.myclaude/usage-cache.json) that `myclaude usage` reads. Any missing part is left out; never throws.

const fs = require('fs');
const os = require('os');
const path = require('path');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const pct = (x) => Math.round(x);

function resetText(sec) {
  if (num(sec) == null) return '';
  const d = new Date(sec * 1000);
  const h = d.getHours();
  const hour = `${h % 12 || 12}${d.getMinutes() ? `:${String(d.getMinutes()).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()} ${hour}`;
}

function buildLine(input) {
  const parts = [];
  const m = input && input.model;
  const name = m && (m.display_name || m.id);
  if (name) parts.push(String(name));
  const ctx = num(input && input.context_window && input.context_window.used_percentage);
  if (ctx != null) parts.push(`ctx ${pct(ctx)}%`);
  const rl = (input && input.rate_limits) || {};
  const five = num(rl.five_hour && rl.five_hour.used_percentage);
  if (five != null) parts.push(`5h ${pct(five)}%`);
  const week = num(rl.seven_day && rl.seven_day.used_percentage);
  if (week != null) {
    const r = resetText(rl.seven_day.resets_at);
    parts.push(`wk ${pct(week)}%${r ? ` (${r})` : ''}`);
  }
  return parts.join(' · ');
}

function buildCache(input, nowMs) {
  const rl = (input && input.rate_limits) || {};
  const win = (w) => (w && num(w.used_percentage) != null ? { used_percentage: w.used_percentage, resets_at: num(w.resets_at) } : null);
  return {
    version: 1,
    written_at: nowMs,
    session_id: (input && input.session_id) || null,
    five_hour: win(rl.five_hour),
    seven_day: win(rl.seven_day),
  };
}

// Atomic: write a temp file in the same directory, then rename.
function writeCache(file, cache) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache));
  fs.renameSync(tmp, file);
}

function main() {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { /* print an empty line */ }
  process.stdout.write(`${buildLine(input)}\n`);
  const cache = buildCache(input, Date.now());
  // Keep the last good cache when this input has no rate limits (before the first API response).
  if (cache.five_hour || cache.seven_day) {
    try {
      writeCache(process.env.MYCLAUDE_USAGE_CACHE || path.join(os.homedir(), '.myclaude', 'usage-cache.json'), cache);
    } catch { /* a status line must not fail */ }
  }
}

if (require.main === module) main();

module.exports = { buildLine, buildCache, writeCache, resetText };
