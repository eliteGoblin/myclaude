# general — role memory (myclaude repo)

- `~/claude-bible` HEAD (`cac8223`) is a local-only commit; `git checkout` of it in a fresh clone of forrestchang/andrej-karpathy-skills fails with "reference is not a tree". Pin karpathy at the upstream tip, never at the local clone's HEAD. (Proved 2026-08-23 by `src update karpathy` failing.)
- The installed `~/.claude` copy can carry hand edits that no repo copy has (`rules/frank/preferences.md` had the no-hard-wrap rule only in `~/.claude`). Before any `sync --force` or migration, run `diff --content custom` and decide per file which side is newer; the direction is not the same for every file. (Proved 2026-08-23: `LESSONS.md` was newer in the repo, `preferences.md` newer in `~/.claude`.)
- `node --test tests/` fails on Node 24 ("Cannot find module .../tests"); use `node --test tests/*.test.js` (`npm test`).
