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
| 2026-08-22 | Eval methodology for a production LLM extraction task (US/AU call summaries) | 7 + 2 opened at cycle-1 | 2 rounds | CONCLUDED (1 sub-question DEAD-END) | 81 evidence notes; 64/64 refs resolved; 32/32 load-bearing claims verified exhaustively by 2 isolated verifiers → 20 SUPPORTED / 10 PARTIAL / 2 UNSUPPORTED / 0 CONTRADICTED. PI measurement between rounds reversed the sizing verdict; round-2 re-implementation corrected 2 PI errors. Hypothesis PARTIALLY survived: 4 pools → 3, 800-1,000 new calls → coverage + rare-class panels + label auditing. |
| 2026-08-23 | Claude Code config base: ECC vs mattpocock/skills, verbosity/context bloat, multi-source cherry-pick | 6 + 1 opened at cycle-1 | 2 rounds | CONCLUDED (hypothesis falsified: a skills-only repo cannot be a base) | 136/136 refs resolved; 78 claims → 54 SUPPORTED / 15 PARTIAL / 6 CONTRADICTED / 0 UNSUPPORTED / 3 UNVERIFIABLE. All contradictions were repo-state facts measured against a stale ref or worktree; literature and verdict held. Cheap PI measurements at the lab meeting settled 3 open questions. |

## Un-cited arithmetic from two branches is the most contradiction-prone evidence class
(2026-08-22, eval-methodology programme) Two branches produced their own arithmetic for the SAME quantity — selection inflation from repeated prompt comparisons — and differed 5x (1.5-2 pp vs <=0.4 pp), implying opposite structural recommendations. Neither number was cited; each had silently chosen a different variance (absolute-accuracy binomial SE vs paired replicate SE; the correct one was the paired delta's case-sampling variance). Rule: at the lab meeting, list every number a branch DERIVED rather than read, and treat any two branches computing the same quantity as a first-class contradiction to resolve — it is far likelier to be wrong than a cited figure.

## PI measurement between rounds is a legitimate move when a branch rests on an assumed parameter
(2026-08-22) A power branch's headline ("not fundable") rested on an assumed ICC and discordance rate it flagged as unmeasured; the asker's own repo held the artifacts. One afternoon of PI arithmetic reversed the verdict and reframed the whole recommendation. Rule: when a conclusion hinges on a parameter the asker's data can settle, measure it at the lab meeting rather than writing "future work" — but then have a round-2 researcher RE-IMPLEMENT it adversarially (ours caught two real errors in the PI's numbers).

## Reference resolution proves nothing about magnitude — verify the number AND its condition
(2026-08-22) 64/64 references resolved and 63/64 matched their claimed identity, yet 12 of 32 load-bearing claims (37.5%) failed adversarial verification. Zero were fabrications. Both UNSUPPORTED cases were DERIVED statistics presented as the source's own words (a mean/median computed over a paper's table; a sample size computed from a paper's asymptotic formula). The other ten were real numbers carried outside their stated condition — wrong subset, wrong population, or past the authors' own hedge ("our study cannot determine whether..."). Rule: the resolution sweep is necessary and cheap but is NOT evidence of grounding; budget the real effort for magnitude-and-condition checks, and require every cited number to exist as stated text in the source.

## Read the two sentences AFTER the number — the authors' hedge is part of the finding
(2026-08-22) MT-Bench's famous 10%/25% self-preference win-rates are immediately followed by "our study cannot determine whether the models exhibit a self-enhancement bias"; Panickssery et al. state "the correlation doesn't by itself prove the causal hypothesis". Both were being cited for conclusions their authors expressly declined. Rule: quote-check the surrounding context, not just the figure, and downgrade a grade when the source hedges the conclusion the number is popularly used for.

**Local-repo "facts" go stale within the programme; every one must carry the commit it was read
at.** (2026-08-23) In the config-base programme, 4 of 6 CONTRADICTED verdicts were repository
state claims ("file X is untracked", "skill Y exists", "installed copy drifted from the repo") that
were true at the merge-base or on an older worktree and false on HEAD/origin/main — the verifier
re-ran `manifest.json` grep, `find`, `cmp` + `git merge-base --is-ancestor`. Vendor quotes and
paper numbers all reproduced; the repo snapshot did not. Rule: a branch reporting a repo fact
states `git rev-parse HEAD` of the checkout it read, and the verifier re-checks on HEAD, not on
the branch's evidence note.

**Byte/size claims from secondary sources reproduce worse than quotes.** (2026-08-23) Of the
sizes the verifier re-measured, three were off by 7–34% (references dir 188 KB → 175 KB; a skill
313 KB → 233 KB; a command group 62,430 → 58,217 B) while every verbatim quote matched. Treat a
size with no stated `du`/`wc` command as DERIVED ±25%, not FACT.

