---
name: deep-research
description: Run a PI-led multi-agent deep research programme — frame branches, fan out parallel researchers, critique in lab meetings, iterate until CONCLUDED or DEAD-END, verify citations adversarially, then synthesise with graded evidence. Use for any question worth more than one search pass — literature surveys, "is this hypothesis supported", technology/architecture evaluations, prior-art scans. Not for single-fact lookups.
---

# Deep Research — a PI-led research programme

You are not answering a question. You are **running a research programme** the way a lab
does: a Principal Investigator frames the work, researchers go deep in parallel, the lab
meets and critiques, the PI decides whether there is headroom left, and nothing ships until
the citations survive an adversary.

Every rule below is here because a measured result says so. The survey behind it lives in
`SURVEY.md` next to this file; the citations in parentheses are its anchors.

**Cost check first.** Multi-agent runs ~15× the tokens of a chat, and ~4× for a single agent
(Anthropic 2025). Use this skill only when the answer is worth that. A single fact, a known
file, one lookup → just search. Simple fact-finding needs 1 agent and 3–10 tool calls; only
genuinely multi-branch questions justify a programme.

---

## Before you start — read the memory (both layers)

1. **`LESSONS.md`** — this framework's own accumulated lessons: search strategies that worked,
   dead-end signals seen before, citation-failure patterns, how many rounds sufficed.
   Cross-project, cross-programme. Read it from whichever of these exists:
   `~/devel/everything-claude-code/fsun_config/custom/skills/deep-research/LESSONS.md`
   (the git-versioned source of truth) or `<skill-dir>/LESSONS.md` (the installed copy).
2. **`.claude/agents/memory/research.md`** and **`.claude/agents/memory/_shared.md`** in the
   repo you are working in, if they exist — project-specific research lessons (which sources
   this domain rewards, which vendors' docs lie, what this team already settled).

Read both **whole**, before framing. This is the whole retrieval model. Lesson stores earn
their keep — evolving-playbook contexts measure +10.6% on agent benchmarks (ACE 2025) — but
only when they are curated: add-all memory measures **worse than no memory at all**
(EHRAgent 16.89 add-all vs 38.86 selective).

---

## Roles

| Role | Job | Model |
|---|---|---|
| **PI (guide)** | Frames branches, runs each lab meeting, critiques hard, assigns directives, **owns the stop decision**, writes the final synthesis | Best available (`fable`) |
| **Researcher** | One branch each, in parallel. Searches, fetches, **reads**, writes the branch document + per-paper evidence notes | Best available — researchers are not second-class; they produce the evidence everything else rests on |
| **Citation verifier** | Adversarial, context-isolated. Checks load-bearing claims against what the sources actually say | Best available; a **different model from the author** where quota allows |

Model tiering down is a cost decision, not a quality one. The often-cited "Opus lead + Sonnet
subagents beat single-agent Opus by 90.2%" is **not** an orchestrator-tier ablation — it shows
multi-agent beats single-agent, not that cheap workers are better. When quota allows, use the
best model everywhere. A weak researcher poisons the evidence base that the PI, the verifier
and the lessons file all depend on.

---

## The phases

### 1. FRAME (PI)

Define **5–7 branches** that together answer the question. Each branch gets:
`id` (kebab-case) · the precise question · 3–5 concrete angles or search leads (named papers,
benchmarks, authors, vendors) · **what a decisive answer would look like**.

Choose branches to **cover the question space** — never for persona flavour. Persona/
"perspective" diversity is measured at −1.77 heading soft recall in STORM's own ablation; what
it actually buys is retrieval breadth (99.83 vs 54.36 unique references). Pick branches that
retrieve different literatures, not different voices.

Write `framing.md`. Include a branch that could **falsify** the hypothesis — if every branch is
built to confirm it, the programme has no gate.

### 2. RESEARCH ROUND (parallel researchers)

Fan out 3–5 at a time. Every researcher brief must state four things — vague briefs are the
named cause of subagents duplicating work and leaving gaps (Anthropic 2025):

> **objective · output format · which tools and sources to use · clear task boundaries**

Each researcher: searches broadly then narrows; **fetches and reads** the primary source;
writes `round<N>/branch-<id>.md` (evidence table · findings narrative · implications for the
asker's actual situation · open questions it could not settle); saves a per-paper note to
`evidence/<id>.md`; and returns a **condensed 1–2k-token summary**, not its raw findings.

**Read `evidence/` before searching.** It is the shared index of what has already been read.
Step repetition is the single most common multi-agent failure mode (17.14%, MAST 2025), and
20–29% of search episodes re-retrieve already-found material.

### 3. LAB MEETING (PI) — the loop's decision point

The PI reads `framing.md`, **every** branch document so far, and spot-checks `evidence/`
notes. Then critiques hard: weak or missing evidence; claims cited from abstracts rather than
content; contradictions between branches; missed major papers or benchmarks; over-
generalisation from one model class to another; anywhere a branch dodged its decisive-answer bar.

Three things make this critique worth running at all:

- **The critic must hold external evidence, not just the draft.** Ungrounded self-critique is
  not neutral, it is *net-negative*: GPT-4 on GSM8K falls 95.5 → 91.5 → 89.0 across two
  self-correction rounds; GPT-3.5 on CommonSenseQA collapses 75.8 → 38.1. The same loop with
  one bit of external signal reverses it (75.9 → 84.3) (Huang et al. 2310.01798). Our PI reads
  branch docs **and** the evidence notes — keep it that way. **If a round produced no new
  evidence to critique against, do not run a critique round; decide.**
- **Ask what was retrieved but never used.** A moderator whose job is to surface
  retrieved-but-uncited information is the highest-value role in Co-STORM's ablation — above
  adding more experts. Every lab meeting asks: what is in `evidence/` that no branch document
  has consumed?
- **Critique must be specific.** A contentless challenge is destructive: a bare "are you sure?"
  costs 17% accuracy and flips 46% of answers (FlipFlop 2311.08596). Name the gap, name the lead.

Then **decide**, and record per-branch status with a one-line reason:

| Status | Meaning |
|---|---|
| **ACTIVE** | Real headroom: unread important sources, an unresolved contradiction, a new lead that could change the verdict |
| **CONCLUDED** | Evidence sufficient and stable; further rounds would only decorate |
| **DEAD-END** | Sources exhausted, the directives would repeat, or the residual question needs primary experiments rather than literature |

Write `round<N>/guide-review.md`. Continue only for branches that are ACTIVE; issue concrete
directives (gaps + leads) for each, and open up to 2 new branches if an unframed direction
emerged.

**Self-check on the gate:** if a lab meeting approves nearly everything and produces no
substantive directives, the gate is dead, not passed. Self-Refine's critic said "everything
looks good" for 94% of math instances — and delivered a 92.9 → 93.1 gain. A cycle with no
real directives is a signal to stop, not evidence of quality.

### 4. ITERATE — the loop, and how it ends

**There is no fixed round count.** The PI's stop decision is the terminator. A hard cap
(6–8 cycles) exists **only as a runaway backstop**, never as the design.

Fixed budgets fail in both directions, measurably:

- **Over-run.** 77–93.6% of search episodes add no new evidence; incorrect trajectories run
  1.9–2.9× longer than correct ones while peaking only 0.6–6.7 episodes later — "the extra
  length is a wasted tail, not late progress." By 20 episodes agents already hold 86.3–92.4%
  of their final accuracy (arXiv 2608.01913). Refinement gains are front-loaded the same way:
  Self-Refine's per-round deltas are +5.0, +0.9, +0.9.
- **Under-run.** Premature termination is 7.82% of observed multi-agent failures and
  "unaware of termination conditions" another 9.82% (MAST 2025); production systems build
  explicit *evidence-aware termination* to stop agents concluding early (arXiv 2604.24978).
- **And searching longer actively corrodes grounding.** Going from 2 to 150 tool calls costs
  **−42% Fact Check accuracy** while link validity and topical relevance stay above 92% — the
  extra rounds add citations that resolve and look relevant but no longer support the claim,
  and every cheap metric hides it. Extra rounds are not free even when they are harmless to cost.

So: **continue while any branch is ACTIVE** — while rounds still surface new STRONG evidence
or unresolved contradictions. **Stop when every branch is CONCLUDED or DEAD-END.**

**Declaring DEAD-END** — all three signals, not one:
1. The last round surfaced **no new STRONG evidence** on that branch.
2. The directives you would write now are **paraphrases of the last round's**. (The literature's
   own prescription is pivot-not-paraphrase: recognise a failed hypothesis and change angle
   rather than re-asking near-duplicates. If you cannot find a new angle, that is the dead end.)
3. What remains **needs primary experiments or private data**, not more sources.

**Stopping on a well-evidenced negative is success, not failure.** A programme that concludes
"the hypothesis is unsupported and here is what would settle it" has done its job. Do not run
decorative rounds to feel thorough — and say so plainly in the synthesis under *what the
literature cannot answer*.

### 5. VERIFY (adversarial citation verifier)

Citation failure is the **majority case**, not the tail: only 51.5% of sentences in commercial
generative search are fully supported by their citations (Liu et al. 2304.09848); AI search
tools cite incorrectly >60% of the time (Tow Center 2025); 19.9% of citations in GPT-4o
literature reviews are wholly fabricated (PMC12658395); and **deep-research modes score worse
than plain search modes** on unsupported statements (DeepTRACE 2509.04499). Frontier agents
keep link validity above 94% and topical relevance above 80% while delivering only **39–77%
factual support** — so checking that a link resolves and looks on-topic proves nothing.

Two more traps: citation precision is *inversely* correlated with perceived utility (r ≈ −0.96)
— the most fluent passage is the least grounded — and models essentially never abstain.
**Polish is anti-evidence.**

Run the protocol in order:

1. **Resolution sweep — 100% of references, deterministic, no LLM.** Fetch every URL/DOI.
   Non-resolving → the reference is removed and every claim resting solely on it becomes
   UNVERIFIABLE, with no adjudication. A fabricated source is not a judgement call. This is the
   cheapest lever in the whole framework: 26–79× fewer bad references, one HTTP request each.
2. **Extract atomic claims** from the synthesis draft; tag **LOAD-BEARING** (in the executive
   summary or a recommendation; contains a number or magnitude; asserts causation; sole support
   for a conclusion) vs **SUPPORTING**.
3. **Verify in isolation.** The verifier is a separate agent with a **fresh context**, given the
   standalone claim plus the **fetched source text**, sources in randomised order, one claim at
   a time — and **nothing** from the draft: not the surrounding argument, not the author's
   confidence, not the assigned grade. Draft-isolation is the load-bearing part of CoVe
   (FActScore 55.9 → 71.4 with no retrieval at all, because "models that attend to existing
   hallucinations in the context from their own generations tend to repeat the hallucinations");
   randomised order counters position bias, which flips 30–75% of verdicts.
4. **Sample to detect, not to reassure.** 100% of references, **100% of LOAD-BEARING claims**,
   ≥20 SUPPORTING claims per major section. If a section's sampled failure rate exceeds 20%,
   **stop sampling and audit it exhaustively** — it has not been verified, it has been confirmed
   as unverified.
5. **Five verdicts.** SUPPORTED · **PARTIALLY SUPPORTED** (source supports direction but not the
   stated magnitude/scope/population — *this is the expected verdict when in doubt*, because
   fine-grained over-permissiveness is 66% of attribution-judging errors) · UNSUPPORTED ·
   CONTRADICTED (**always a flag, never a finding** — judge F1 on this class is 45.0; escalate to
   a second, differently-prompted verifier) · UNVERIFIABLE (our failure, not the claim's).
   **Ties break downward** — LLM appraisers systematically over-grade.
6. **Disposition: narrow, don't regenerate.** PARTIALLY SUPPORTED → edit the claim down to what
   the source licenses, keep the citation, record the edit. Retrieve-and-edit preserves author
   intent 90–96% versus 6–40% for regeneration (RARR). UNSUPPORTED → one re-grounding attempt,
   then demote or delete. UNVERIFIABLE → may survive only as ANECDOTAL, labelled inline, and
   **never in an executive summary**.

Write `verification.md`. Consensus among verifiers reading the *same* fetched text is not
verification — diversify the angle, not the count. (A single well-prompted judge is more
consistent than a panel; Anthropic 2025.)

### 6. SYNTHESIS (PI, single-threaded)

**One agent writes the report.** This is not a style preference — parallel section-writers
produce disjoint reports, and LangChain's own post-mortem concluded: *restrict multi-agent to
research, and write the report in one-shot.* Parallel agents are safe when they **read and
converge**; they break when they **write into a shared artifact**.

The synthesis agent **re-opens the per-paper `evidence/` notes section by section** rather than
working from branch verdicts. Retrieving again at writing time is the single largest measured
lever in STORM's comparison (+15.74 ROUGE-1) — larger than the entire multi-agent pre-writing
stage (+1.56).

`SYNTHESIS.md` contains:

1. **Verdict** on the question — supported / partial / unsupported, with the strongest evidence
   each way, every claim graded.
2. **What it means for the asker's actual situation** — not a literature tour.
3. **Per-branch closing status** (CONCLUDED / DEAD-END, with why).
4. **What to measure next** — ranked, each with the question it settles.
5. **What the literature cannot answer.** Say it plainly. Any DEAD-END branch belongs here with
   the experiment that would resolve it.
6. **Verification footer** — references checked and resolved, claims verified vs sampled,
   per-section failure rate, counts by verdict, and an explicit list of what was NOT verified
   and why. An un-exercised check is reported as un-exercised, never rounded up to green.

Apply the verification results **before** publishing: downgrade or drop anything the verifier
found PARTIALLY SUPPORTED, UNSUPPORTED or CONTRADICTED.

---

## Evidence rules (every agent, every phase)

- **Every claim carries a citation** — source + year + identifier (arXiv ID, DOI, URL) — **and a
  strength grade**.
- **Read, don't skim.** Fetch the full text (arXiv is open access: `arxiv.org/html/<id>` or the
  PDF). **Never cite from a title, an abstract, or a search snippet.** If you only saw the
  abstract, say so inline.
- **One note per source** in `evidence/<id>.md`: what it measured, on which models/benchmarks,
  the key numbers, and its relevance to the asker's actual case.
- **Numbers come with their conditions** — which model, which benchmark, what n. A benchmark
  result used to claim real-world behaviour is an *indirectness* downgrade.
- **Be honest when the evidence is thin or contradicts the hypothesis.** That is the finding.
- **Flag what you could not verify.** A source that would not fetch is reported, not papered over.

**Grade rubric** — start from the source type, then adjust, and **record the adjustments**:

| Start at | Source type |
|---|---|
| **STRONG** | Systematic review / meta-analysis, large pre-registered audit, or independently replicated result |
| **MODERATE** | Single peer-reviewed empirical study with stated methodology — or a design practice stated by the people who shipped the system |
| **WEAK** | Preprint, vendor-published benchmark, single unreplicated result, or a number read from a figure |
| **ANECDOTAL** | Blog post, marketing claim, expert opinion, mechanism-based reasoning with no measurement |

**Downgrade one level** (max two) for: risk of bias (the measurer benefits) · inconsistency
(unexplained conflict with other sources) · indirectness (different model class, population or
task than the claim) · imprecision (small n, no interval, the paper itself hedges) ·
verification failure. **Upgrade one level** (max one, never above STRONG) for: a large
unambiguous effect · a dose-response gradient · convergent independent replication.

**Hard floors.** A claim whose reference does not resolve is ANECDOTAL, always. A claim graded
WEAK or below may not appear in an executive summary or a recommendation without an inline
hedge. An unexplained grade is not a grade.

---

## Do NOT add these

Each is the obvious next idea, and each is measurably wrong:

| Tempting | Why not |
|---|---|
| A **debate phase** between researchers | At matched compute, debate *loses* to plain parallel sampling (self-consistency 85.3 vs debate 83.2 at 6 responses; 88.2 vs 83.0 at 9) and gets worse with more budget. The most-cited pro-debate results are not statistically significant, and debate wins only when the single-agent baseline is handicapped (single agent *with demonstrations* 75.63% vs debate 73.88%). Worse, agents conform: **57–77% of opinion flips in debate go correct → wrong**, and even vacuous arguments induce 20–39% error adoption. The parallel fan-out already captures the useful part. |
| More **personas/perspectives** as a quality lever | −1.77 on quality in STORM's ablation; they buy retrieval breadth only. Cover the question space instead. |
| A **panel of judges** | "A single LLM call with a single prompt… was the most consistent" (Anthropic 2025). Consensus over the same fetched text is not verification. |
| A **fixed number of rounds** | Over-runs and under-runs both measured. The PI's judgement is the terminator. |
| **Cheap-tier researchers** to save budget | No published orchestrator-tier ablation supports it; realistic routing savings are ~1.4–3.7×; a weak researcher poisons everything downstream. |
| A **"tidy up the lessons file"** rewrite | Measured context collapse: 18,282 tokens at 66.7% accuracy → 122 tokens at 57.1%, *below* the no-memory baseline (ACE 2025). Edit named entries; never regenerate the file. |

---

## Artifact layout

One folder per programme. Nothing lives only in an agent's head.

```
<programme-dir>/
├── framing.md              branches, questions, angles, decisive-answer bars
├── round1/
│   ├── branch-<id>.md      per branch: evidence table, narrative, implications, open questions
│   └── guide-review.md     PI critique + per-branch status + directives for the next round
├── round2/ …               only ACTIVE branches continue
├── evidence/<id>.md        one note per source read — the shared "already read" index
├── verification.md         per-claim verdicts + overall reliability read
└── SYNTHESIS.md            the deliverable
```

---

## After the programme — write the lessons (both layers)

Triggered by: a search strategy that verifiably worked, a dead-end signal you hit, a citation-
failure pattern, a source that lied or would not fetch, a round count that turned out to be
enough or not enough, a mistake you had to correct.

- **Framework-level → `LESSONS.md` in the ECC repo**, i.e.
  `~/devel/everything-claude-code/fsun_config/custom/skills/deep-research/LESSONS.md` —
  anything about *how to run research well*: cross-project, cross-domain.
  **Write to the repo source, not the installed `<skill-dir>` copy** — `ecc.js sync` copies
  source over installed unconditionally, so a lesson written to the installed file is destroyed
  on the next sync. Writing to the repo also puts the lesson in git, where it gets reviewed like
  code. If the ECC repo is not present on this machine, write to the installed copy and say so
  in your report, so the lesson can be carried back by hand.
- **Project-level → `.claude/agents/memory/research.md`** in the repo — anything about *this
  codebase or domain*: which sources it rewards, what the team already settled, per the project's
  agent-self-learning convention.

Write like the memory rules require, and note *why* each rule exists here:

- **Distil, don't transcribe.** 2–4 lines: what happened → the reusable rule. Never a diary.
- **Evidence-backed.** Each lesson names what proved it. Add-all memory measures *worse than no
  memory* (16.89 vs 38.86) because one bad record propagates into every similar future task, and
  <0.1% contamination hijacks >80% of retrievals. **Admission is a gate, not a default.**
- **Correct over append.** New experience contradicts an entry → edit *that entry*. Contradictions
  must never coexist. Recurrence → strengthen the existing entry, don't add a near-duplicate.
- **Never regenerate the file.** At the ~200-line cap, merge specific named entries. A from-scratch
  rewrite is how a lesson store collapses to nothing (see above).
- **Never log routine success.** Only surprises, failures, corrections, dead ends, and procedures
  that verifiably worked.
- The **lesson writer should be the PI**, not a worker — a weak reflector makes the store noisy or
  harmful (ACE's own stated precondition).

Lessons land in normal commits and PRs, so they get reviewed like code. That review loop is the
defence against a wrong lesson compounding.

---

## Example invocation

The reference shape is a workflow script: PI frames → parallel researchers → PI lab meeting in a
`while` loop the PI controls → verify → synthesise. Sketch:

```js
const DIR = '<programme-dir>'
const CTX = `CONTEXT: <the situation, the hypothesis, prior in-house work to critique freely>.
RULES for all agents: evidence-first — every claim carries a citation (source + year + id) and a
strength grade (STRONG/MODERATE/WEAK/ANECDOTAL); fetch and actually READ key papers, never cite
from titles or abstracts; read ${DIR}/evidence/ before searching and save a per-paper note to
${DIR}/evidence/<id>.md; be honest when evidence is thin or contradicts the hypothesis.`

// FRAME — PI returns branches: {id, question, angles[], decisive}
const framing = await agent(`${CTX}\nYou are the PI… write ${DIR}/framing.md. Return JSON.`,
  { model: 'fable', schema: { /* branches[] */ } })

// ROUND 1 — parallel researchers, one per branch
let docs = await parallel(framing.branches.map(b => () => agent(`${CTX}
You are a RESEARCHER on branch "${b.id}". Question: ${b.question}. Angles: ${b.angles.join(' | ')}
Objective / output format / sources / boundaries: write ${DIR}/round1/branch-${b.id}.md
(evidence table, narrative, implications, open questions); notes to ${DIR}/evidence/.
Return a condensed summary.`, { model: 'fable' })))

// PI-CONTROLLED LOOP — the PI's stop decision terminates it; the cap is a runaway backstop only
const HARD_CAP = 8
let round = 1, stopReason = null
while (round < HARD_CAP) {
  const d = await agent(`${CTX}
You are the PI running lab-meeting cycle ${round}. Read ${DIR}/framing.md and EVERY branch doc so
far; spot-check ${DIR}/evidence/. Critique each branch hard. Ask what was retrieved but never
used. Then DECIDE: CONTINUE only for branches with real headroom (give concrete directives + new
leads; open up to 2 new branches); STOP when every branch is CONCLUDED (evidence sufficient and
stable) or DEAD-END (sources exhausted, directives would repeat, remaining questions need primary
experiments). Stopping on a well-evidenced negative is success. Do NOT run decorative rounds.
Status every branch CONCLUDED/ACTIVE/DEAD-END with one line why.
Write ${DIR}/round${round}/guide-review.md. Return JSON.`,
    { model: 'fable', schema: { /* continue, stop_reason, branch_status[], assignments[], new_branches[] */ } })

  if (!d.continue) { stopReason = d.stop_reason; break }
  round++
  const work = [...(d.assignments||[]), ...(d.new_branches||[])]
  if (!work.length) { stopReason = 'PI continued but issued no assignments'; break }
  await parallel(work.map(a => () => agent(/* deepen or open branch, per directives */)))
}
if (!stopReason) stopReason = `hard cap of ${HARD_CAP} cycles reached`   // investigate if hit

// VERIFY — separate agent, fresh context, claims in isolation
const verification = await agent(`${CTX}\nYou are an ADVERSARIAL CITATION VERIFIER…`, { model: 'fable' })

// SYNTHESIS — single-threaded, re-reads evidence/ per section, applies the verifier's downgrades
const synthesis = await agent(`${CTX}\nYou are the PI writing ${DIR}/SYNTHESIS.md…`, { model: 'fable' })
```

Hitting `HARD_CAP` is a **defect signal**, not a normal exit — the PI failed to converge. Record
why in `LESSONS.md`.

The same shape works without a script: run the phases as ordinary parallel subagent batches, one
batch per round, with the PI's decision between them.
