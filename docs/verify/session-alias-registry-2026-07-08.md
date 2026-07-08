# VERIFY REPORT — alias-first session registry (feat/session-alias-registry, PR #19) — 2026-07-08

verdict: **PASS-WITH-GAPS** — all 8 items VERIFIED PASS. Item 7 (no-persist
scratch) **initially FAILED** (live Stop hook bypassed the gate), was **fixed the
same day** (POSIX case-gate in `~/.claude/settings.json`) and **re-verified PASS**
(see item-7 section, "RE-VERIFY 2026-07-08"). Remaining gaps: no automated tests
for the new code; real interactive adhoc Stop event (Claude-side env injection)
not exercised; verified code includes uncommitted working-tree changes.

Verified against the LIVE install (`~/.claude/scripts/lib/session-registry-fsun.js`,
`~/.claude/scripts/hooks/session-alias-hint-fsun.js`), byte-identical to the repo
working tree (`diff` clean). Note: the working tree contains **uncommitted** changes
to `fsun_config/custom/scripts/lib/session-registry-fsun.js` (+25/−6 vs HEAD) — what
was verified here is the uncommitted version; commit before merge or the PR head
differs from the verified binary.

Safety: `~/.claude/session-registry.json` was backed up before the run and is
**byte-identical** to the backup after the run (`diff` clean, sha
`acaad2e8…`). All fake sessions (`2020-01-01-e2etest*`, 482 files incl. archive)
and all `e2e-test-*` aliases were created and removed; final sweep found 0
residual artifacts. A pre-flight dry analysis confirmed `syncRegistry` would make
zero changes to Frank's real entries before any sync was executed (0 gone files,
0 gone aliases, 3 untracked sessions all in ignored folders).

## NOT VERIFIED (human must run these)

- **Item 7 — Claude-side env injection in a real interactive session**: the gated
  Stop command was exercised exactly as wired (see RE-VERIFY), but I did not start
  a real Claude session in `~/claude_adhoc` to confirm Claude Code injects the
  project settings' `env.ECC_DISABLED_HOOKS` into the hook process (would write
  real session data). To confirm live: start a session in `~/claude_adhoc`, exit,
  then `ls -lt ~/.claude/session-data | head` — NO new file should appear.
- **LLM summary path of session-end.js**: all session-end runs used
  `ECC_SKIP_LLM_SUMMARY=1` (no real LLM call exercised). Out of scope for the
  registry feature.
- **Automated test coverage**: `session-registry-fsun.js` and
  `session-alias-hint-fsun.js` have **no unit tests** on the branch (no
  `*.test.js` touches them; `git log main..HEAD -- tests/` is empty). Upstream
  `tests/lib/session-manager.test.js` covers only the underlying pagination API.
  Finding for the dev team: core new module shipped untested.

## VERIFIED

| # | Check | Result | Evidence (actually ran/observed) |
|---|-------|--------|----------------------------------|
| 1 | create/rename/unalias round-trip | PASS | `createAlias("e2e-test-rt","/tmp/e2e-test-alias-a")` → registry JSON gained `{"worktrees":["/tmp/e2e-test-alias-a"],…}`; `renameAlias` → old key gone, new key carries same createdAt; `removeAlias` → registry file **byte-identical** (sha) to pre-test; 0 `e2e-test` strings left |
| 2a | auto-assign via Worktree metadata | PASS | fake `2020-01-01-e2etest1-session.tmp` with `**Worktree:** /tmp/e2e-test-alias-a` + alias on that folder; `syncRegistry()` → `autoAssigned: 1`, live JSON shows `"2020-01-01-e2etest1-session.tmp": "e2e-test-a"` |
| 2b | 2 aliases on same folder → NOT auto-assigned | PASS | second alias `e2e-test-b` on same folder + fake session 2; `syncRegistry()` → `autoAssigned: 0`, session absent from map, reported unassigned with `"candidates": ["e2e-test-a","e2e-test-b"]` |
| 3 | absorb moves memberships + worktrees, deletes source | PASS | `absorbAliases("e2e-test-a",["e2e-test-b"])` → `sessionsMoved: 1`; live JSON: `e2e-test-b` gone, target worktrees `["/tmp/e2e-test-alias-a","/tmp/e2e-test-alias-b"]` (shared worktree deduped), both fake sessions → `e2e-test-a` |
| 4 | consolidate merges into newest, archives (not deletes) older | PASS | 2 members, mtimes forced (e2etest2 newer); `consolidateAlias` → target = e2etest2; e2etest1 **gone from session-data, present in `~/.claude/session-data/archive/`** with content intact ("session one" grep hit); target contains `# Merged History (consolidated 2026-07-08T04:36:29Z)` + old content; registry entry for archived file dropped |
| 5 | gather --dry-run makes NO registry change | PASS | `gatherByTopic("gcp-lz","landing zone",{dryRun:true})` → reported 1 would-gather (`2026-06-29-d7f0ae4f` from `gemini`); registry sha256 before == after (`diff` clean) |
| 6a | hint hook, aliased folder | PASS | cwd=ecc repo → `[sessions] This folder's alias: "ecc" (7 session(s))…`, exit 0 |
| 6b | hint hook, ignored folder | PASS | cwd=`/home/fsun/devel` → **no output**, exit 0 |
| 6c | hint hook, unknown folder | PASS | cwd=`/tmp/e2e-unknown-folder` → `No alias for this folder yet… (suggested: "e2e-unknown-folder")… Do not create it silently.`, exit 0 |
| 6d | hint hook, registry unreachable | PASS | `HOME=/tmp/nonexistent-e2e node …hint…` → stderr `[SessionAliasHint] non-fatal: Cannot find module …`, **exit 0** |
| 6e | hint hook, corrupted registry JSON | PASS | fake HOME with scripts + `{{{{ THIS IS NOT JSON` as registry → falls back to empty registry ("No alias…" path), exit 0 |
| 6f | hint hook, 2-alias folder | PASS | during 2b window, cwd=/tmp/e2e-test-alias-a → `This folder has multiple aliases: e2e-test-a, e2e-test-b. Ask the user…`, exit 0 |
| 7a | run-with-flags gate semantics | PASS | repo root, `ECC_DRY_RUN=1` enabled → `[DryRun] Hook "stop:session-end" would execute…`; with `ECC_DISABLED_HOOKS=stop:session-end` → no preview; real run w/ fake HOME: disabled → **no file created**; enabled → `Created session file: /tmp/e2e-fakehome/.claude/session-data/2026-07-08-…session.tmp` |
| 7b | adhoc no-persist actually disables persistence | **PASS** (initially FAILED, fixed + re-verified same day) | ORIGINAL: live Stop hook bypassed the gate; direct invocation with the exact adhoc env still created a session file. AFTER FIX (case-gate in `~/.claude/settings.json`): disabled runs (both `stop:session-end` alone and the exact adhoc value `stop:session-end,session:end:marker`) → exit 0, session-data listing unchanged; enabled control (env unset) → `[SessionEnd] Created session file: …/2026-07-08-e2e-item7-recheck-session.tmp` (artifact deleted). See RE-VERIFY section |
| 8 | pagination: scan sees ALL sessions past the 500 page | PASS | 42 real + 480 fakes = 522 on disk; single `getAllSessions({limit:500})` → 500 returned, `hasMore: true` (naive call would lose 22); `syncRegistry` (uses `scanAllSessions`) accounted for all: 39 tracked + 480 unassigned + 3 ignored = 522; all 480 fakes visible across the page boundary; 0 tracked entries dropped |

## DEFECT — item 7 (no-persist scratch) — initially FAILED 2026-07-08, FIXED same day, RE-VERIFIED PASS

### Original finding (kept as history — evidence trail must not be erased)

Three facts (each exercised, not inferred):

1. **FACT**: `~/.claude/settings.json` wires the Stop hook as
   `"command": "node ~/.claude/scripts/hooks/session-end.js"` — direct, NOT via
   `scripts/hooks/run-with-flags.js`.
2. **FACT**: `session-end.js` never reads `ECC_DISABLED_HOOKS` (grep exit 1); only
   `run-with-flags.js`/`hook-flags.js` consult it. The ECC plugin (whose
   `hooks.json` DOES route `stop:session-end` through the wrapper) is **not
   installed** (`installed_plugins.json` lists only `pyright-lsp`).
3. **FACT (exercised)**: `HOME=/tmp/e2e-fakehome ECC_DISABLED_HOOKS=stop:session-end,session:end:marker node ~/.claude/scripts/hooks/session-end.js`
   (cwd=`~/claude_adhoc`) → `[SessionEnd] Created session file: …/2026-07-08-claude_adhoc-session.tmp`.

Conclusion: `~/claude_adhoc/.claude/settings.json`'s
`ECC_DISABLED_HOOKS=stop:session-end,session:end:marker` sets the env var but
nothing in the live Stop chain honors it → scratch sessions in `~/claude_adhoc`
WILL still be persisted to `~/.claude/session-data/` (they are merely hidden from
the registry via the `ignored` list). Fix options: wire the user-level Stop hook
through `run-with-flags.js` with hookId `stop:session-end` (as the plugin's
`hooks.json` does), or make `session-end.js` consult `hook-flags.isHookEnabled`.

### RE-VERIFY 2026-07-08 (after fix) — PASS

Fix applied to `~/.claude/settings.json` Stop hook. All three checks exercised:

1. **FACT** — current Stop hook command read from the live file:
   `sh -c 'case ",$ECC_DISABLED_HOOKS," in (*,stop:session-end,*) exit 0;; (*) exec node "$HOME/.claude/scripts/hooks/session-end.js";; esac'`
2. **DISABLED runs** (cwd `/tmp/e2e-item7-recheck`, stdin
   `{"session_id":"e2e","transcript_path":"/nonexistent-e2e.jsonl"}`):
   - `ECC_DISABLED_HOOKS=stop:session-end sh -c "$CMD"` → `exit=0`, no output.
   - Exact adhoc value `ECC_DISABLED_HOOKS=stop:session-end,session:end:marker`
     → `exit=0`, no output (proves the case-pattern matches within the
     comma-separated list, not just the lone value).
   - `ls ~/.claude/session-data` snapshot before vs after both runs: `diff`
     clean — **no session file created**.
3. **ENABLED control** (env unset, same cwd/stdin, `ECC_SKIP_LLM_SUMMARY=1`) →
   `[SessionEnd] Created session file: /home/fsun/.claude/session-data/2026-07-08-e2e-item7-recheck-session.tmp`,
   `exit=0` — proving the same command DOES execute session-end.js when not
   disabled. Test artifact deleted; session-data listing `diff`-identical to the
   pre-recheck snapshot; live registry sha256 (`acaad2e8…`) still identical to
   the pre-run backup. Zero residue.

Residual (see NOT VERIFIED): the Claude-side step — project settings
`env.ECC_DISABLED_HOOKS` actually being injected into the hook process during a
real interactive `~/claude_adhoc` session — was not exercised.

## Recovery / fail-open checks

- Hint hook with missing HOME/registry module → error logged to stderr, exit 0 (6d).
- Hint hook with corrupted registry JSON → `loadRegistry` catch → empty registry,
  exit 0 (6e). Matching error entry present on stderr for 6d; 6e is silent-by-design
  (fail-open to the "no alias" path) — acceptable, entry noted.
- No component in scope writes `/dev/null`-only output; hint hook and session-end
  log to stderr with `[SessionAliasHint]`/`[SessionEnd]` prefixes (observed live).

## Process accuracy

- Expected set: installed lib + hook byte-identical to repo working tree — VERIFIED
  (`diff` clean both files). No orphan/stale copies found in `~/.claude/scripts`.
- Caveat: working tree ≠ HEAD for `session-registry-fsun.js` (uncommitted +25/−6).

## Residue audit (end of run)

- `diff ~/.claude/session-registry.json <backup>` → **identical** (also verified
  identical at the mid-run checkpoint after tests 1–4).
- `grep -c "e2e-test\|e2etest" ~/.claude/session-registry.json` → 0.
- No `e2etest*` files under `~/.claude/session-data/` or `…/archive/`.
- Throwaway `/tmp/e2e-*` folders removed.
- Item-7 re-verify (after fix): recheck artifact
  `2026-07-08-e2e-item7-recheck-session.tmp` deleted; session-data listing and
  registry sha re-confirmed identical to pre-run state; `/tmp/e2e-item7-recheck`
  removed.

## Notes / risks

- No unit tests for the new registry module or hint hook — raise before CLOSE.
- `syncRegistry` auto-drops entries whose file or alias disappears; safe here, but
  any future truncating scan would silently delete memberships — the paging loop
  (verified in item 8) is the guard; a unit test pinning it is recommended.
- Hand-off: this report goes to **ba-curator** for criterion-by-criterion sign-off.
