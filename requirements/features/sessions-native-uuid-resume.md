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
