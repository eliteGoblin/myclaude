---
id: C007
type: complaint
title: A one-word question gets a long answer and the stance is unclear
date: 2026-11-21
status: OPEN
failure: F2
---

## Frank said

> gist? that too many word is consume my enegy, gis,t update mycladude skill, make complaint, say such a lot of words Im not is yrou suggestion , concern or agree.

The question that caused it was one word: "concenr?" (do you have a concern?).

## Claude replied

> excerpt: about 150 words. It began "No real concern. Your way is simpler...", then a bold "Your decision, as I recorded it" paragraph, three bullets (Statistics, Details, One limit), and a "What I changed" list of two bullets. [removed: work detail]

## Expected

A reply to a short question, or to Frank's decision, starts with exactly one stance label: "Agree.", "Concern:", or "Suggestion:". A one-word or one-line question gets at most about 2 short lines. No "what I changed" list unless Frank asks.

This is a repeat of C001 (verbosity) and C006 (long answers in a design discussion). The rules existed (philosophy §1 and §2), so this is a retrieval failure: the fix sharpens the existing first bullet of philosophy §1 (stance label, line limit) and adds no new section.

## Repro

```json repro
{"setup":{},"prompt":"We are designing a small note-taking CLI. Decision: notes are stored as one Markdown file per day, and search uses grep. Concern?","runs":3,"checks":{"maxLines":3,"mustMatch":["^\\s*\\**(agree\\.|concern:|suggestion:)"],"mustNotMatch":["what i changed"]}}
```

## Fix

- https://github.com/eliteGoblin/myclaude/pull/6 (philosophy §1 "Stance first" bullet)

## Check history
