---
name: clarify
description: Ask the user structured questions (rounds of numbered questions, each with a recommended answer) until both sides share one understanding. Use when Frank asks to be grilled or to clarify, before building a feature whose goal, scope, or acceptance is unclear, and as the first stage of the product cycle. Not for small, clear tasks.
---

Sources: mattpocock/skills@5b15a47 skills/productivity/grilling/ (forked and renamed 2026-09-28: plain name and wording, because Frank avoids idioms; rounds, frontier and recommended answers kept; used as the DEFINE stage of `/product-cycle`).

Question the user until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that depend on it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you have not heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like this:

```
**Q1** - **<question title>**: <question body, may be several paragraphs, including choices>

Recommended: <your recommended answer>

---

**Q2** - **<question title>**: <question body>

Recommended: <your recommended answer>
```

Each round of answers changes the tree: settled decisions move the frontier outward and unblock the questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (files, tools, docs), dispatch a subagent to find it; do not ask the user for anything you can look up. Do not wait for it: a running search is an unsettled prerequisite, so only the questions that depend on it wait; ask the rest of the frontier now. The _decisions_ belong to the user: put each one to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing silently assumed. Then summarise the shared understanding in a few lines and ask the user to confirm it. Do not act on it before the user confirms. In `/product-cycle`, this confirmation is Gate 1.

When a term or decision settles and the repo keeps a `CONTEXT.md` glossary or `docs/adr/`, record it with the `domain-modeling` skill.
