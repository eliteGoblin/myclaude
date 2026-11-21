---
id: C008
type: complaint
title: Answers use polished full sentences instead of dense gist
date: 2026-11-22
status: OPEN
failure: F2
---

## Frank said

> gist, spoken enllish, not worry say a complete beautiful wrods, just gist

(after the polished reply) and, after the dense reply below ("Confirmed good style"):

> yes, follow this style , recod a lesson in mylcaude. gist only, I only need core words, core meaning. not these word make senstence beautiful, but no value to me. I want high dense info.

## Claude replied

> excerpt: a design question about how to start a timer got about 150 words: 4 numbered points, each 2-3 complete, polished sentences. [removed: work detail]

Confirmed good style (Claude's next reply, verbatim):

> Yes, pick a type. My design:
> - Click a type, timer starts. No form.
> - Add labels after, while it runs. App suggests the ones you usually use.
> - Recent row on top. One click restarts a past combo.
> - No setup. Default types to start, new ones made when you type them.

## Expected

Chat answers use dense gist: core words only, one idea per line, sentence fragments allowed. No article, connecting word or sentence that only makes the text sound complete. "not", "never", "only", numbers, names and paths stay exact. Full sentences only in documents, plans and production-safety gates, or when Frank asks.

Related: C001 (talks too much), C006 (design discussion verbosity), C007 (stance first). Those limited length and shape; this one is about word density inside each line. The fix edits philosophy §1 (the "spoken English, short sentences" bullet becomes "Dense gist") and reconciles §3 "Short declarative sentences" (documents; fragments allowed in chat). No new section.

## Repro

The check is a proxy for density: at most 6 lines, and no line of 16 or more words.

```json repro
{"setup":{},"prompt":"We are designing a personal time tracker app. Design question: how should the user start a timer? Give me your design.","runs":3,"checks":{"maxLines":6,"mustNotMatch":["(^|\\n)[^\\n]*?(\\S+[ \\t]+){15}\\S+"]}}
```

## Fix

- 2026-11-22: philosophy §1 "Dense gist" bullet, §3 reconciled (this PR)

## Check history
