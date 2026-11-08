---
id: C006
type: complaint
title: Design discussion answers come as tables and rule lists
date: 2026-11-08
status: OPEN
failure: F2
---

## Frank said

> just quick spoken enlish, you speaking too muych will distract my thoughts.

> gist, spoken enlish style. I just ask this. not aks you anything else?

> is this related to what I ask?

> explain wiht plain tern, not that i need to ask you mean these.

## Claude replied

> excerpt: Frank asked "ok, what about the if schema need to breaking change?" Claude replied with a 3-row markdown table plus a "Rules I will follow" list of 5 numbered items (migration files, backups before migration, testing on a copy, schema version check at start, PostgreSQL compatibility). Only items 1-2 answered the question.

> excerpt: earlier in the same session Claude used the metaphor "strict at the door, loose on disk". Frank did not understand it and had to ask about it twice.

## Expected

In a design discussion, a short conceptual question gets one short spoken-English answer: the answer first, at most about 5 lines. No markdown table and no numbered rule list unless Frank asks for detail. No metaphors (philosophy §1 and §3).

This is a repeat of the failure mode of C001 (F2, verbosity) in a new shape: a design discussion instead of a simple factual question.

## Repro

```json repro
{"setup":{},"prompt":"We are designing a personal time tracker. Entries are rows in SQLite; the flexible fields labels and measures are JSON columns checked by code at write time. Quick question: what happens if the schema needs a breaking change?","runs":3,"checks":{"maxLines":6,"mustNotMatch":["\\|[^\\n]*\\|[^\\n]*\\|","(^|\\n)\\s*1[.)] [\\s\\S]*\\n\\s*3[.)] "]}}
```

## Fix

## Check history
