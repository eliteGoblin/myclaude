# Sessions: native session UUID + resume command

Status: DEFINE (direction approved by Frank, 2026-07-23)

## What

The sessions skill durably maps each topic-aliased session summary file to the
native Claude session it summarizes, and surfaces that link so Frank can jump
straight back into the real conversation with `claude --resume <uuid>`.

## Why

Summary filenames embed only a short fragment of the native session id. Today
nothing shows the full UUID or the resume command, so Frank cannot easily get
from an alias/summary back into the underlying Claude conversation. The whole
value of topic-aliased sessions is continuity; without a resume path the alias
is a dead end.

## Acceptance criteria (product-level, testable)

1. `sessions info <id|alias>` prints the full native session UUID, the native
   transcript path, and the exact `claude --resume <uuid>` command, when the
   native session can be resolved.
2. `sessions switch <alias>` (alias load) output includes the native UUID and
   resume command for the alias's LATEST session.
3. When no native transcript matches (e.g. transcript deleted by Claude, or
   summary belongs to a different worktree/folder), both commands degrade
   gracefully: a clear "native transcript not found" message, everything else
   still works — never an error or a wrong/guessed UUID.

Resolution mechanism (context only, not a doc contract): the summary
filename's 8-hex fragment is matched against native transcript filenames in
the worktree's Claude projects directory.

## Honest limitations

- The 8-hex fragment is short; a collision between two native sessions is
  theoretically possible (ambiguous match).
- Transcripts pruned/deleted by Claude are unrecoverable — the mapping is
  honest about absence but cannot restore the conversation.
- Only sessions whose summary filename carries the fragment are mappable;
  older/foreign summary files without it stay unresolvable.

## Design questions

None open — direction fixed by Frank.

## Status

**SHIPPED 2026-07-24** — PR #23 (squash 736a1e7e) + review fix c1cb497b. Local
reviewers: 1 HIGH (silent switch degradation), 1 MEDIUM (info/native session
mismatch) — fixed pre-merge. Copilot: 1 valid finding (info alias resolution)
— fixed; 2 comments on files inherited from earlier unpushed commits.

## Verify evidence (e2e, installed copies, 2026-07-24)

- `sessions info agents-outage` → `Native: 6063d518-0e2c-49d5-b012-741d23feebb7`,
  `Resume: claude --resume 6063d518-…`, transcript path exists (1.9 MB live). PASS
- `sessions switch agents-outage` → `Resume latest: claude --resume 6063d518-…`. PASS
- Graceful paths exercised: unknown id → error object; no-fragment filename →
  `not found (no uuid fragment in filename)`; pruned transcript (gcp-lz) →
  `Resume latest: not found (native transcript not found)`; ambiguous fixture →
  newest + `ambiguous: 2`. PASS

## Follow-ups (icebox)

- Registry lost-update race: concurrent Claude sessions clobber
  ~/.claude/session-registry.json (observed 2026-07-23: alias vanished; had to
  recreate). Consider lock file or read-merge-write.
- Fork CI hygiene: npm audit HIGH vulns (js-yaml via markdownlint-cli,
  linkify-it) + flaky hooks/plugin-hook-bootstrap.test.js on windows/node18 —
  pre-existing, block green merges; branch protection required --admin bypass.
- Local ECC main had 3 unpushed commits → PR #23 squash absorbed their content
  under one message; local/remote main need a reconcile (rebase drops
  patch-identical commits) once the concurrent session's WIP is committed.
