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

A reply to a test or check that Frank asked for starts with the outcome in one or two words ("Works." or "Does not work: <reason>."), then at most 2 short lines. Details, fixes made, and config steps come only when Frank asks.

## Occurrences

- 2026-11-21: the first report above (a one-word question).
- 2026-11-22 (repeat, one day later, same session): Frank asked Claude to test whether a third-party LLM endpoint works with the app ("test it"). Claude ran the test, then answered with about 230 words: a conclusion line, two bullets describing each test, two bullets on problems found and fixed, a paragraph, and a config code block with an offer. Frank: "so it work or not?" Claude then answered in two lines. Frank: "jsut say works, so many words, didn';t you update your skill save my mental entegy cut all these crap I not ask for?" and then "make compalint ot myclaude". [removed: work detail]
  - Pattern 1: a yes/no outcome was buried under detail Frank did not ask for, so he asked the same question again.
  - Pattern 2: the fix from PR #6 was merged in the repo but never installed in the user config (`sync` reported CONFLICT), so behaviour did not change. The complaint was treated as handled when it was not.
- Status stays OPEN. A complaint is FIXED-VERIFIED only when the rule is installed (`node myclaude.js sync` shows no CONFLICT for that file) and the check passes on the installed config.

## Repro

```json repro
{"setup":{},"prompt":"We are designing a small note-taking CLI. Decision: notes are stored as one Markdown file per day, and search uses grep. Concern?","runs":3,"checks":{"maxLines":3,"mustMatch":["^\\s*\\**(agree\\.|concern:|suggestion:)"],"mustNotMatch":["what i changed"]}}
```

## Fix

- https://github.com/eliteGoblin/myclaude/pull/6 (philosophy §1 "Stance first" bullet; merged but not installed, see Occurrences)
- 2026-11-22: "Stance first" bullet extended to tests and checks (PR for the repeat)

## Check history
