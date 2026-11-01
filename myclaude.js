#!/usr/bin/env node
'use strict';

// myclaude.js — pick files from pinned git sources and custom/, install them into ~/.claude,
// and keep a three-way record (source, recorded base, installed) so nothing is overwritten silently.

const { buildCtx } = require('./lib/manifest');
const pick = require('./lib/cmd-pick');
const sync = require('./lib/cmd-sync');
const router = require('./lib/cmd-router');

const HELP = `myclaude.js — personal Claude Code config manager (manifest v2)

Sources
  src ls                                  list sources, pins, entry counts
  src add <name> <repo-url> [--ref r] [--dir d]   clone a source and pin it at the ref tip
  src rm <name>                           remove a source (no entries may use it)
  src update [name]                       fetch + move clone HEAD to the ref tip (pin unchanged)
  ls [<src> [prefix]]                     list entries, or files available in a source (* = picked)

Entries
  pick <src> <path> [path...] [--as name] track a file or a dir/ (skills/<cat>/<name>/ installs as skills/<name>/)
  unpick <dest> [dest...] [--force]       stop tracking and remove from ~/.claude (--force when locally modified)
  fork <dest>                             move a picked entry into custom/ with forkedFrom provenance
  own <path>                              create a new file under custom/ (never overwrites)

Compare and apply
  diff [--content] [src|dest]             three-way state per entry: CURRENT MISSING UPSTREAM-CHANGED
                                          LOCAL-MODIFIED CONFLICT CONVERGED DELETED-UPSTREAM FORK-DRIFT
  accept <dest> | accept --all            take the upstream version (copies, records hash, moves the pin)
  sync [--dry-run] [--force]              install MISSING/CONVERGED/custom changes; refuses LOCAL-MODIFIED
                                          and CONFLICT unless --force; regenerates skills/SOURCES.md
  router                                  regenerate skills/SOURCES.md (provenance) and docs/SKILL-ROUTER.md
  install [--dry-run]                     new machine: clone every source at its pin, then sync
  chrome-mcp <start|stop|status|doctor|setup|mcp>   one shared debug Chrome for all MCP clients
  complaints <list|check>                 Frank's complaints and requests as repeatable checks (requirements/complaints/)
  status                                  pins, state counts, unmanaged files in ~/.claude
  migrate-v1 --ecc-sha <sha> [--karpathy-sha <sha>]   convert a v1 manifest.json to v2

Settings fragments: custom/settings/*.json are picked like files (pick custom settings/hooks.json) and
deep-merged into ~/.claude/settings.json; owned leaves are recorded in manifest settingsOwned.

Env: MYCLAUDE_CLAUDE_HOME (default ~/.claude), MYCLAUDE_SOURCES_DIR (default ~/.myclaude/sources)
`;

const COMMANDS = {
  src: pick.cmdSrc,
  ls: pick.cmdLs,
  pick: pick.cmdPick,
  unpick: pick.cmdUnpick,
  fork: pick.cmdFork,
  own: pick.cmdOwn,
  diff: sync.cmdDiff,
  accept: sync.cmdAccept,
  sync: sync.cmdSync,
  install: sync.cmdInstall,
  status: sync.cmdStatus,
  router: router.cmdRouter,
  'migrate-v1': sync.cmdMigrateV1,
};

function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help') {
    process.stdout.write(HELP);
    return 0;
  }
  // Async and needs no manifest, so it runs before buildCtx().
  if (cmd === 'chrome-mcp') return require('./lib/cmd-chrome-mcp').main(rest);
  if (cmd === 'complaints') return require('./lib/cmd-complaints').main(rest);
  const fn = COMMANDS[cmd];
  if (!fn) {
    process.stderr.write(`unknown command: ${cmd}\n\n${HELP}`);
    return 2;
  }
  try {
    const ok = fn(buildCtx(), rest, (line) => process.stdout.write(`${line}\n`));
    return ok === false ? 1 : 0;
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    return 1;
  }
}

if (require.main === module) Promise.resolve(main(process.argv.slice(2))).then((code) => process.exit(code));

module.exports = { main, COMMANDS };
