# Deep Research — accumulated lessons

The `deep-research` framework's own memory. **Read this whole file before framing a
programme; append to it after the synthesis.** Cross-project and cross-domain — anything
about *how to run research well*. Lessons about a specific codebase or domain go to that
repo's `.claude/agents/memory/research.md` instead.

> **Write to this file in the ECC repo** —
> `~/devel/everything-claude-code/fsun_config/custom/skills/deep-research/LESSONS.md` —
> never to the installed `~/.claude/skills/deep-research/` copy. `ecc.js sync` copies source
> over installed unconditionally, so a lesson written to the installed copy is destroyed on the
> next sync. Writing here also puts every lesson in git, where Frank reviews the diff like code
> — which is the defence against a wrong lesson compounding.

**Write discipline** (per `rules/frank/agent-self-learning.md`, with the reasons that apply here):

- 2–4 lines per lesson: what happened → the reusable rule. Distil, never transcribe.
- **Evidence-backed.** Name what proved it. Add-all memory measures *worse than no memory*
  (EHRAgent 16.89 vs 38.86 selective) — admission is a gate, not a default.
- **Correct over append.** Contradicting experience edits the existing entry; contradictions
  must never coexist. A recurrence strengthens an entry, it does not add a near-duplicate.
- **Never regenerate this file.** At ~200 lines, merge specific named entries. A from-scratch
  rewrite is how a lesson store collapses (ACE measured 18,282 tokens → 122, accuracy 66.7% →
  57.1%, below the no-memory baseline).
- **Never log routine success.** Surprises, failures, corrections, dead ends, and procedures
  that verifiably worked.
- The **PI writes the lessons**, not a worker — a weak reflector makes the store harmful.

---

## Sources & fetching

**arXiv full text is reachable at `arxiv.org/html/<id>v1`; the `abs` page usually gives only the
abstract.** (2026-08-07) Several branches in the founding programme cited numbers that exist only
in the paper body — ablation tables especially. Fetching `abs` and reporting "the paper does not
give numbers" is a fetch failure, not a finding. Try `html/<id>v1`, then the PDF, then an HTML
mirror; say which one you read.

**Large PDFs can blow up the fetch tool.** (2026-08-07) `arxiv.org/pdf/<id>` returned a JSON
parse error on a long paper; the `abs` page for the same ID worked immediately. On a fetch error,
switch representation before concluding the source is unavailable.

**Vendor blogs move hosts and silently 301.** (2026-08-07) `cognition.ai` → `cognition.com`,
`blog.langchain.com` → `www.langchain.com`. The fetch tool returns the redirect instead of
following it cross-host — re-issue against the redirect URL rather than recording the source as
unreachable.

**Some vendor pages block fetching entirely and the number you want may not exist anywhere
citable.** (2026-08-07) OpenAI's widely-repeated "26.6% on HLE" for Deep Research is not in the
System Card or the HLE paper, and openai.com 403s. Widely-repeated ≠ published. If the primary
source cannot be reached, the claim is UNVERIFIABLE — not MODERATE.

**Read the repo, not the write-up, for what a project currently does.** (2026-08-07) A summary
claimed LangChain's `open_deep_research` had become "a streamlined single-agent approach"; the
current `deep_researcher.py` still has `supervisor`, `ConductResearch` and `researcher_subgraph`
— the single-agent variants live in `src/legacy/`. For any claim about a live codebase, read the
code.

## Framing & branches

**Include a branch that could falsify the hypothesis.** (2026-08-07) A branch set built only from
the hypothesis's own vocabulary retrieves only confirming literature. In the founding programme
the most decision-changing findings were negative results (debate loses to self-consistency;
ungrounded critique is net-negative) and they surfaced only because branches were pointed at the
counter-evidence explicitly.

**Brief every researcher with objective / output format / sources / boundaries.** (2026-08-07)
The named cause of subagents duplicating work and leaving gaps. Cheap to write, and the first
thing to check when two branches come back with the same citations.

## Running the loop

**A lab meeting that produces no substantive directives is a stop signal, not a pass.**
(2026-08-07) Grounded in Self-Refine's 94% "everything looks good" rate. If the PI cannot name a
gap and a lead per ACTIVE branch, the branch is CONCLUDED or DEAD-END — say which.

**One broad parallel round plus one targeted round was sufficient for a mature literature.**
(2026-08-07) The founding survey reached a stable verdict on 7 branches in effectively one deep
round plus lead-run gap-filling. Consistent with evidence arriving early (86–92% of final
accuracy by 20 search episodes). Treat 3+ rounds as a signal that the branches were framed too
broadly, not as thoroughness.

**"The literature has no answer" is a legitimate, valuable outcome.** (2026-08-07) The founding
survey's most useful finding for design was that *nobody has published a principled stopping
rule* — vendors hard-code heuristic tables and wall clocks. State such gaps prominently; they are
where in-house measurement pays.

## Citations & verification

**Check that every reference resolves before doing anything clever.** (2026-08-07) Deterministic,
one HTTP request each, and it is the highest-yield step in the protocol (26–79× fewer bad
references). Claims resting on a dead reference are UNVERIFIABLE with no adjudication.

**Numbers get corrupted in transit between agents.** (2026-08-07) In the founding programme, a
figure-read number and a secondhand number with internally inconsistent digits both reached a
branch document; both were caught only because the branch flagged them as figure-reads. Require
researchers to mark any number they did not read as stated text — and treat those as WEAK.

**Grading is a convention, not a measurement — and LLMs over-grade.** (2026-08-07) Automated
GRADE agrees with human raters at only κ = 0.44, and appraisal studies find models consistently
underestimate risk of bias. Ties break downward, always.

---

## Programme log

One line per completed programme: what it was, how many rounds, how it ended. Used to see
whether round counts and dead-end calls are calibrated over time — if a DEAD-END is later
overturned, come back and correct the lesson that justified it.

| Date | Programme | Branches | Rounds | Ended | Notes |
|---|---|---|---|---|---|
| 2026-08-07 | Deep-research framework survey (founding run) | 7 | 1 broad + lead gap-fill | CONCLUDED | Produced this skill. Load-bearing numbers cross-checked against primary sources by the lead; 4 commonly-repeated claims failed verification and were excluded. |
