# Why the deep-research skill says what it says

Evidence appendix for `SKILL.md`. Every rule in the playbook maps to a measurement here.
Read this before changing the skill — several of the rules forbid the *obvious* improvement,
and the reason is always a number.

Survey run 2026-08-07 as a 7-branch programme; load-bearing figures read from primary sources
(arXiv full text, vendor page HTML, PDFs), not from search snippets.

Grades: **STRONG** = controlled measurement, large audit, or independent replication ·
**MODERATE** = single credible measurement, or a design practice stated by the people who
shipped it · **WEAK** = single unreplicated preprint or figure-read.

---

## Architecture

| Rule in SKILL.md | Evidence | Grade |
|---|---|---|
| Orchestrator-worker (PI + branch researchers) | The only pattern shipped for research: Anthropic's Research system, LangGraph *supervisor*, OpenAI *manager pattern*, STORM, GPT-Researcher, open_deep_research. Nobody shipped a swarm. **OpenAI Deep Research is not multi-agent** — a single o3 variant "optimized for web browsing"; do not cite it as multi-agent evidence | MODERATE |
| Use only when the question is worth it (~15× tokens) | "Agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens" — Anthropic 2025. Deep Research Bench: 0.4309 RACE at $45.98 vs 0.4401 at $187.09 | STRONG |
| Parallel agents **read**; one agent **writes** | LangChain post-mortem on parallel section-writers: "the reports were disjoint" → "We restrict multi-agent to research, and write the report in one-shot." Cognition: multi-agent "work[s] best today when writes stay single-threaded"; their own carve-out is subagents for "well-defined question-answering tasks" only | STRONG |
| Fan out 3–5; workers return 1–2k-token summaries | Anthropic 2025 (stated practice; up to 90% latency reduction) | MODERATE |
| Brief = objective / output format / sources / boundaries | "Without detailed task descriptions, agents duplicate work, leave gaps, or fail to find necessary information" — Anthropic 2025 | MODERATE |
| Best model in every seat when quota allows | The "Opus lead + Sonnet subagents beat single-agent Opus by 90.2%" result is **not** an orchestrator-tier ablation and has no published methodology or n. It shows multi-agent > single-agent. Routing literature bounds real savings at ~1.4–3.7× (RouteLLM), not FrugalGPT's 98% headline | MODERATE / WEAK |
| Failures are organisational, and prompt fixes are bounded | MAST (arXiv 2503.13657, 200+ traces, 7 frameworks, κ=0.88): Specification & System Design **41.77%** / Inter-Agent Misalignment **36.94%** / Verification & Termination **21.30%**. Top mode: step repetition **17.14%**. Better prompts + topology moved ChatDev 25.0 → 40.6% and the authors still called it "insufficiently low for real-world deployment" | STRONG |

## Decomposition

| Rule | Evidence | Grade |
|---|---|---|
| Branches cover the **question space**, not personas | STORM ablation (arXiv 2402.14207): removing perspective-taking costs **−1.77** heading soft recall / −0.40 entity recall; removing the multi-turn conversation costs **−8.29 / −8.54**. Perspectives buy retrieval breadth only (99.83 vs 54.36 unique references) | STRONG |
| Retrieve again at writing time (synthesis re-reads `evidence/` per section) | STORM's largest single lever: RAG → oRAG (adds per-section retrieval, identical outline procedure) = **+15.74 ROUGE-1 / +5.00 entity recall**; the entire multi-agent pre-writing stage on top = **+1.56 / +1.53**. ~10:1 | STRONG |
| Every lab meeting asks "what did we retrieve but never use?" | Co-STORM ablation: removing the **moderator** — whose job is raising questions from retrieved-but-uncited information — hurts more than reducing the number of experts | MODERATE |
| Read `evidence/` before searching | Step repetition is MAST's top failure mode (17.14%); 20–29% of search episodes re-retrieve already-found material (arXiv 2608.01913) | STRONG |

## Critique

| Rule | Evidence | Grade |
|---|---|---|
| **The critic must hold external evidence.** No evidence to critique against → skip the round | Intrinsic self-correction degrades in every cell: GPT-4 GSM8K **95.5 → 91.5 → 89.0**; GPT-3.5 CommonSenseQA **75.8 → 38.1**. The same loop with an oracle signal: 75.9 → **84.3** (Huang et al. 2310.01798). Ablating CRITIC's tool channel drops the critique's contribution to **−0.03 / +2.33 F1**. Google Co-Scientist's Reflection *without* search rated already-published ideas **6.14/10 novel**; *with* search, **2.38/10** | STRONG |
| A critic rubber-stamps unless you check it | GPT-4 approved **38/45 invalid plans — 84.45% false-positive rate** (Valmeekam 2310.08118); self-critique 55/100 vs a sound verifier's 88/100. ChatGPT said "everything looks good" for **94%** of Self-Refine's math instances | STRONG |
| Critique must be specific | FlipFlop (2311.08596): a contentless "are you sure?" costs **17% accuracy and flips 46%** of answers | STRONG |
| Separate role, fresh context | Chain-of-Verification's **factored** variant — verifier answers without seeing the draft — is what produces the gain: Wikidata precision **0.17 → 0.36**, FActScore **55.9 → 71.4** with no retrieval at all, because "models that attend to existing hallucinations in the context from their own generations tend to repeat the hallucinations". Corroborated by a **64.5%** average self-blind-spot across 14 models | STRONG |
| **No debate phase** | At matched compute debate loses to plain parallel sampling: 6 responses — self-consistency **85.3%** vs debate **83.2%**; 9 responses — **88.2%** vs **83.0%** (debate −0.2 with more budget). No pre-2025 pro-debate paper controls compute; Du et al.'s two most-cited results are **not significant** (p≈0.14, p≈0.28), and debate wins only against a handicapped single agent (single agent *with demos* **75.63%** vs debate 73.88%) | STRONG |
| Debate also induces conformity | **57–77% of opinion flips go correct → wrong**; 37% of changes occur under self-reflection alone; vacuous arguments still induce **20–39%** error adoption | STRONG |
| Critique *does* pay for long-form writing — which is why the lab meeting stays | TTD-DR: self-critique drives long-form report quality (DeepConsult **+35.3pp**) while retrieval-denoising drives short-answer correctness (GAIA +6.1pp vs +1.2pp). A research synthesis is the long-form case | MODERATE |
| **No judge panel** | "We experimented with multiple judges… but found that a single LLM call with a single prompt… was the most consistent" — Anthropic 2025. Consensus over the same fetched text is not verification | MODERATE |

## Iteration & stopping

| Rule | Evidence | Grade |
|---|---|---|
| **No fixed round count**; the PI's judgement terminates | Over-run: **77–93.6%** of search episodes add no new evidence; incorrect trajectories run **1.9–2.9× longer** while peaking only 0.6–6.7 episodes later — "the extra length is a wasted tail, not late progress"; by 20 episodes agents hold **86.3–92.4%** of final accuracy (arXiv 2608.01913). Under-run: premature termination **7.82%** and "unaware of termination conditions" **9.82%** of multi-agent failures (MAST) | STRONG |
| Gains are front-loaded | Self-Refine per-round deltas **+5.0, +0.9, +0.9**; ungrounded loops turn negative by round 2 | STRONG |
| Evidence-driven termination, not budgets | "stopping criteria based on whether sufficient supporting evidence has [been] retrieved" (2608.01913); production systems build explicit *evidence-aware termination* against "uneven information coverage and premature stopping" (2604.24978) | MODERATE |
| DEAD-END signal: directives would repeat | "the agent recognizes when a hypothesis has failed and pivots to a new angle, instead of re-asking near-paraphrases" (2608.01913). After the first decisive hit, **57.9–74.0%** of later episodes add nothing | MODERATE / STRONG |
| Hard cap is a backstop, not a design | MAST FM-1.5 "unaware of termination conditions" 9.82% — a cap covers runaway; it must not become the terminator | STRONG |
| **Searching longer corrodes grounding** | 2 → 150 tool calls costs **−42% Fact Check accuracy**, while link validity and topical relevance stay **>92%** — the added citations resolve and look relevant but no longer support the claim, and every cheap metric hides it | STRONG |
| **No published stopping rule exists** | Anthropic hard-codes a heuristic table; Gemini uses a 60-minute wall clock. The PI-owned CONCLUDED/ACTIVE/DEAD-END judgement is ahead of published practice and correspondingly unvalidated | MODERATE |

## Citations & verification

| Rule | Evidence | Grade |
|---|---|---|
| Assume citations are wrong until checked | Only **51.5%** of sentences in commercial generative search are fully supported by their citations; citation precision 74.5% (Liu et al. 2304.09848). AI search tools cite news incorrectly **>60%** of the time — best 37%, worst 94% (Tow Center/CJR 2025). ChatGPT Search hedged **15/200** times while misattributing **134** | STRONG |
| Long-form is much worse than short-form | ALCE, same model: ASQA ≈73% citation recall → ELI5 ≈51% → QAMPARI ≈21% | STRONG |
| **Deep-research modes are worse, not better** | DeepTRACE (2509.04499): unsupported statements — Perplexity(DR) **97.5%**, Copilot(DR) 90.2%, Gemini(DR) 53.6%, GPT-5(DR) 12.5% | MODERATE→STRONG |
| Fabrication is routine | **19.9%** of GPT-4o literature-review citations wholly fabricated; **45.4%** of the real ones had bibliographic errors; **37.8%** of DOIs invalid (PMC12658395). Non-resolving URLs from DR agents: gemini-2.5-pro-DR **13.3%** | STRONG |
| Link-liveness and topical relevance prove nothing | Frontier agents: link validity **>94%**, topical relevance **>80%**, factual support only **39–77%** | MODERATE |
| **Polish is anti-evidence** | Citation precision is *inversely* correlated with perceived utility, r ≈ −0.96; models essentially never abstain. Same split at system level: OpenAI DeepResearch is top-tier on Organization (**.857**) and **worst-in-class on Claim Coverage (.138)** | MODERATE / STRONG |
| A system's own reviewer agent flatters it | AI Scientist's reviewer overestimates paper quality by **2.3/10** against real human reviewers (6.1 vs 3.8), and human scores are *not predictive* of its scores — yet that reviewer certified the system's own "exceeds acceptance threshold" claim | STRONG |
| Resolution sweep first, 100%, deterministic | Non-resolving references: GPT-5.1 **16.0% → 0.6% (26×)**, Gemini 2.5 Pro 6.1% → 0.1% (79×). One HTTP request each | MODERATE (deterministic mechanism) |
| Atomic claims, per-claim entailment | FActScore's automatic estimator tracks human scoring within **<2%**; SAFE agrees with humans **72%** and wins **76%** of disagreements at **>20× lower cost** | STRONG |
| Give the verifier source text, not a memory test | Judge failure rate: default prompt **70%** → chain-of-thought **30%** → **reference-guided 15%** | MODERATE |
| Randomise source order; prefer a different model | Position bias flips **30–75%** of verdicts (GPT-4 self-consistent on swap only 65%; Claude-v1 23.8%). Verbosity attacks fool GPT-3.5/Claude-v1 **91.3%**. Self-preference **+10pp** (GPT-4) to **+25pp** (Claude-v1), mechanistically tied to self-recognition — rewording does not remove it | STRONG |
| PARTIALLY SUPPORTED is the in-doubt default; CONTRADICTED is a flag | Fine-grained over-permissiveness is **66%** of attribution-judging errors; GPT-4's per-class F1 on **Contradictory is 45.0**; overall attribution macro-F1 73.3% in-domain, 59.2% on ExpertQA | STRONG |
| Narrow the claim; don't regenerate | RARR preserves author intent **90.0–95.6%** vs **6–39.7%** for regeneration, while lifting attribution **+7.5 to +10.6pp** | STRONG |
| Ties break downward | Automated GRADE agrees with humans at only **κ = 0.44** (mechanical domains F1 ≥0.90, risk-of-bias 0.70); LLM appraisers "underestimated the risk of bias or overestimated the confidence of the results"; across 24 models on 100 systematic reviews **all models are overconfident**. No peer-reviewed GRADE adaptation for AI-generated syntheses exists as of 2026 | STRONG |

## Lesson accumulation

| Rule | Evidence | Grade |
|---|---|---|
| Keep a lessons file at all | ACE evolving playbook: **+10.6%** on agents, **+8.6%** on finance, 82.3% lower adaptation latency than GEPA. Agent Workflow Memory **+24.6% / +51.1%** relative, beating human-written workflows. Voyager needs **15.3×** fewer iterations | STRONG |
| **Admission is a gate** | Add-all memory is *worse than no memory*: EHRAgent **16.89** add-all vs **38.86** selective; AgentDriver 32.48 vs 50.94. One bad record propagates via experience-following; **<0.1% contamination hijacks >80% of retrievals** | STRONG |
| **Never regenerate the file** | ACE measured context collapse in its own trace: step 60 held 18,282 tokens at 66.7% accuracy; the next full rewrite left **122 tokens at 57.1%** — below the 63.7% no-memory baseline. Fix: itemised entries updated in place | STRONG |
| The PI writes the lessons | ACE's stated precondition: it "depends on a reasonably strong Reflector; if reflection fails, constructed contexts become noisy or harmful" | MODERATE |
| Only verified lessons | Voyager admits only execution-verified skills; removing self-verification costs **−73%** of stored items | STRONG |

---

## Claims deliberately NOT used

Checked and rejected, so nobody re-imports them:

- OpenAI Deep Research's widely-repeated **26.6% HLE** — not in the System Card or the HLE
  paper; openai.com blocks fetching. UNVERIFIABLE.
- Gemini Deep Research's "asynchronous task manager with shared state and graceful error
  recovery" — found in no Google-published page fetched. UNVERIFIABLE.
- Anthropic's **90.2%** — real, but with no published methodology or n; cite only as "their
  internal research eval", never as a benchmark.
- FrugalGPT's "up to 98% cost reduction" — narrow classification tasks; not transferable to
  research-agent tiering.
- Co-STORM's per-cell ablation values — not retrievable from the HTML/PDF renders; only the
  direction (moderator > experts) is verified.
