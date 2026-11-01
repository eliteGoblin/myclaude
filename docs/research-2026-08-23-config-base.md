# Synthesis — Should the Claude Code config be re-based on mattpocock/skills, and how to remove verbosity, context bloat, and multi-source pain

Date 2026-08-23. PI synthesis of a 7-branch, 2-round programme, verified by citation-verifier (§8) and finalised after Frank's decisions (block below). Evidence notes: `$D/evidence/*.md`; branch reports: `$D/round1/`, `$D/round2/`. Reader: Frank.

Labels used throughout: FACT = measured or read from a primary source (command or URL given); INFERENCE = reasoning from facts; ASSUMPTION = unverified. Grades: STRONG / MODERATE / WEAK / ANECDOTAL. DERIVED = a number computed from other numbers (tokens = bytes/4, percentages, line estimates); treat DERIVED numbers as ±25% unless stated.

## Decisions already taken by Frank (2026-08-23)
These decisions are given. The sections below are evidence and options; where a section conflicts with a decision, the decision wins and the section is marked SUPERSEDED.
1. No base switch: ECC is not replaced by mattpocock/skills or any other single repo.
2. The personal public repo https://github.com/eliteGoblin/myclaude has been created; the config tool and `custom/` live there.
3. ECC becomes a plain clone source (pinned sha, read-only), not a fork that is rebased.
4. mattpocock/skills picks: `writing-for-agents`, `grilling`, `wait-what`, `diagnosing-bugs`, `codebase-design`, `tdd`.
5. Existing custom skills are kept (deep-research, observability-buildout, focusd-protection, and the rest of `custom/skills`).
6. Contradictions between ECC `common/` rules and `rules/frank/*` are removed; PR #32 is open for this.
7. No continuous auto-pull. Updates are manual: `update` the source clone, `diff`, `accept`, `sync`.
8. `critical-verification.md` and `production-safety.md` stay always-on. They are trimmed, not demoted to on-demand skills.
9. Consequence for §3b: the "demote critical-verification" row is SUPERSEDED; the trim items in the keep-list still apply.
10. Consequence for §3c: migration steps that assume a fork (filter-repo of `fsun_config`, keeping the fork as a PR vehicle) are replaced by a plain clone of ECC at a pinned sha.

## 1. Verdict on the original hypothesis

Hypothesis: "ECC is not quite relevant to me; I should switch to mattpocock/skills as base."

Verdict: **FALSIFIED as stated. mattpocock/skills is a source to cherry-pick from, not a base.** Two independent branches reached this from different angles (content of the candidate; Frank's actual dependencies).

| # | Claim | Label | Grade | Evidence |
|---|---|---|---|---|
| V1 | mattpocock/skills contains only skills: 36 SKILL.md (24 promoted, 4 misc, 7 beta, 1 nested). No `rules/`, no `hooks.json`, no subagent definitions, no settings, no session/memory system, no sync tool. | FACT | STRONG | Full clone at HEAD 5b15a47 read in full; `find` for `rules/`, `hooks.json`, `agents/*.md` returned nothing [R1, R2]. The "agents" seen by another branch are the `.agents/` directory (5 maintainer docs, incl. 2 ADRs), not agent definitions [R3 §2]. |
| V2 | Frank's live dependencies cannot be expressed by a skills-only repo: the session system (Stop + SessionStart hooks, 11-file script closure, `/sessions` used 48 times), 4 custom agents (ba-curator 32 uses, e2e-verifier 19, release-verifier, citation-verifier), 5 upstream agents (code-reviewer 93, architect 77, python-reviewer 18, security-reviewer 16, typescript-reviewer 4), and 6 always-on rule files. | FACT | STRONG | Transcript corpus 1,110 JSONL files, 2026-04-16 → 2026-08-22; markers `"subagent_type"`, `"name":"Skill"`, `<command-name>`; method validated against known invocations [R4 §1-2, R5 §5]. |
| V3 | The repo's "#4 We Built A Ball Of Mud" is about application-code entropy (Kent Beck quote, deep modules), not about agent configuration. | FACT | STRONG | README l.160 ff. [R1, R3 §2]. |
| V4 | The repo's verbosity remedy is a shared-vocabulary document (CONTEXT.md) plus a post-hoc `/wait-what`; it explicitly rejects "be concise" rules. No measurement of effect exists. | FACT (content) / no evidence of effect | STRONG on intent, WEAK on effect | README "#2 The Agent Is Way Too Verbose"; docs/productivity/wait-what.md: "'Be concise' ... the model obeys it by clipping words and losing you further" [R6]; kaizencode: "no controlled comparison" [R7]. |
| V5 | The widely quoted "63% token reduction" is about the repo's own skill-description cost after the user/model-invoked split, from an X post that could not be fetched (HTTP 402). It does not apply to Frank's rules. | ASSUMPTION (unverifiable) | ANECDOTAL | [R8, R9]. Do not cite as a number. |
| V6 | Frank uses 88 of 3,493 upstream ECC files (2.5%, DERIVED) and 0 of its 23 hooks; upstream is a multi-harness product growing 5.2x in files since February, now at a bursty ~100-150 commits/month (DERIVED run-rate). | FACT (counts) / INFERENCE (trajectory) | STRONG | `git ls-tree`, `jq '.upstream|length'`, `git log --format=%ad` [R4 §3, R5 §1]. |
| V7 | 51% of always-on bytes at programme start were Frank's own `rules/frank/*` (30,746 of 60,273 B), not ECC. The bloat is in Frank's layer. | FACT | STRONG | `wc -c` per file [R10 §2.2]. |
| V8 | What mattpocock/skills does offer Frank: `writing-for-agents` (doctrine for pruning always-loaded text: "hunt no-ops sentence by sentence", "every word of an always-loaded pointer costs on every turn"), `grilling`, `diagnosing-bugs`, `wait-what`, `codebase-design`, `tdd`. Average SKILL.md 4.3 KB, smaller than every other repo whose sizes were measured (cek 22.7 KB, ruflo 15.6 KB, davila7 9.9 KB); the remaining 17 surveyed repos were not measured. | FACT | STRONG | [R1, R3 §2, R11]. |

Strongest evidence FOR switching: V8 (the doctrine is good and the skills are small) and the stated control philosophy ("GSD, BMAD, Spec-Kit ... take away your control") matches Frank's. Strongest evidence AGAINST: V1 + V2 — the candidate has no concept for 5 of the 6 things Frank depends on; "switch base" would mean rebuilding rules, hooks, agents, and the session system by hand with no upstream to pull from. Correct frame: ECC stays one source among N; mattpocock becomes a second source; verbosity and bloat are fixed in Frank's own layer (V7).

## 2. The pain points, measured

### 2.1 Always-on bytes (user layer = `~/.claude/rules/{common,frank}` + `~/.claude/CLAUDE.md`; project layer excluded unless stated)

| Point in time | Bytes | Files | ~Tokens (DERIVED, /4) | Source |
|---|---|---|---|---|
| Programme start (2026-08-23 morning) | 50,741 (18 rule files; 51,071 with `~/.claude/CLAUDE.md`) / 60,273 (user + this repo's project layer: CLAUDE.md 3,936 + 2 `.claude/rules` files 5,266) | 18 / 22 | 12.7k / 15.1k | `wc -c` [R10 §2.1, R12 §2] |
| Now (after `fix/rule-contradictions` removed 5 `common/` rules + `commands/plan.md`) | 41,267 (user) | 13 + CLAUDE.md | 10.3k | PI `wc -c`, this session [R5 §2f] |
| Target (minimal install list, §3b) | 29,505 (user) | 5 rules + CLAUDE.md | 7.4k | [R5 §2f] |
| Target after prose-to-enforcement + dedup (§3a-b; demotion of critical-verification is SUPERSEDED by decision 8, so expect the upper end) | ≈ 12-15 KB (user) | 3-4 files | ≈ 3-4k | DERIVED estimate, ANECDOTAL (no source to check; not used in any recommendation) [R10 §4 target line, R13 §4] |

Path-gated language packs (`paths:` frontmatter): 30,536 B today across golang/python/typescript/web; they cost zero until a matching file is read (FACT: docs; FACT: this session's loaded-instruction set contained none of them [R12 §2]). Target 11,590 B (python + typescript only).

Other per-turn fixed costs (DERIVED from byte counts; not measured with `/context`): skill + command descriptions ≈ 7-8.4 KB ≈ 1.8-2.1k tokens for 50 listed entries, depending on what is counted (`description:` lines alone sum to 7,050 B) [R5 §6]; agent descriptions ≈ 6 KB (6,125 B re-measured) ≈ 1.5k; Claude Code system prompt ≈ 4.2k (vendor example value, not measured [R14]). Always-on rules are also re-loaded into every subagent's context (FACT: docs [R14, R15]), so every byte is paid per subagent as well.

### 2.2 Instruction count, duplication, contradictions (at programme start)

| Measure | Value | Label |
|---|---|---|
| Bullet/numbered items in the always-on set | 465 | FACT (grep) — a list-item count, not a validated "instruction" count |
| Lines containing must/always/never/do not/should/prefer/ensure | ≈115-125 (regex-dependent; 124 case-sensitive, 114 case-insensitive) | FACT (grep) |
| Lines with an emphasis word (must/always/never/critical/important/mandatory, any case) | ≈72 (only 14 lines carry the words in upper case); five files declare "Highest priority — overrides upstream rules" (pr-workflow.md does not) | FACT |
| Verbatim duplicates | "Prompt Defense Baseline" block ×3 (966 B each, ≈2.9 KB); frank/ preamble ×6 (≈1.6 KB); Karpathy text present twice: `common/behavioral-guidelines.md` and the restatement in preferences "Balance complexity" (the former third copy `custom/skills/karpathy-guidelines/` was deleted in PR #27, commit 3c1ca7a9); immutability/size checklist in 2 files; TDD/80% mandate in 5 files (the literal "80%" in 3 of them) | FACT [R10 §2.3] |
| Contradictions (as read at programme start; the list is textual analysis, INFERENCE) | 6: Co-Authored-By (tool text vs rule vs setting); autonomy (TOP RULE vs session-log/plan.md/agents.md); testing (mandatory 80% vs "two occurrences justify a mechanism"); process weight (mandatory PRD/5 docs vs smallest change); brevity vs evidence-presentation mandates; emphasis inflation | FACT (text) [R10 §2.4, R4 §5]. Items 2-4 are being removed by PR #32; item 1 is now fixed by setting (PI `jq`, FACT); items 5-6 remain. |

### 2.3 What the literature says about instruction count vs compliance

| Source | Finding | Models / task | Grade | Transfer to Frank's case |
|---|---|---|---|---|
| IFScale, arXiv:2507.11538 [R16] | Claude Sonnet 4: 100/98.0/94.4/77.2/42.9% at 10/50/100/250/500 instructions; Opus 4: 100/100/94.6/67.9/44.6%. Failures are overwhelmingly omission (rules silently dropped). Primacy bias peaks at 150-200 instructions. | Opus 4 / Sonnet 4; 500 keyword-inclusion instructions in one report-writing prompt | STRONG (PDF read; table rows verified) | INFERENCE. Keyword inclusion ≠ behavioural rules; 2025 models ≠ Fable 5. Direction is usable; the band boundaries are not. |
| ManyIFEval, arXiv:2509.21051 [R17] | Joint compliance ≈ product of per-instruction probabilities; a constraint followed 97% alone fell to 2% when combined with five others (Claude 3.5 Sonnet). | Claude 3.5 Sonnet, 6-10 format constraints | STRONG (peer-reviewed, PDF read) | INFERENCE. Multiplicative decay at small counts is the key mechanism; absolute numbers are 2024-era. |
| Anthropic CC docs: memory, best-practices [R18, R19] | "target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence"; "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!"; "if two rules contradict each other, Claude may pick one arbitrarily"; "If you emphasize many lines, none of them stands out". | Vendor guidance, no published measurement | STRONG (primary), magnitude unknown | Direct. Every one of Frank's files is under 200 lines; the total was 1,374 lines. |
| Anthropic platform docs: Opus 5 / Fable 5 prompting [R20] | Opus 5: "default user-facing responses run longer ... effort does not reliably change visible response length. Prompt explicitly for conciseness"; explicit verification instructions "cause over-verification ... removing them reduces wasted tokens with no loss in quality". Fable 5: "A short brevity instruction is as effective as listing each pattern"; "Skills developed for prior models are often too prescriptive ... can degrade output quality". Opus 4.5+: "dial back aggressive language ('CRITICAL: You MUST ...')". | Current models, vendor guidance | STRONG (primary) | Direct. This is the single most relevant source for the verbosity complaint. |
| PRIME, arXiv:2606.22470 [R21] | Under a length conflict, models followed the detailed instruction in ~81-82% of cases. | 1B-7B open models only | WEAK-MODERATE | INFERENCE, direction only. Relevant to contradiction #5 (brevity rule co-located with evidence/checklist mandates). |
| Chroma context-rot [R22]; NoLiMa [R23]; Lost-in-the-middle [R24] | Retrieval quality degrades with context length; "even a single distractor reduces performance"; associative (non-keyword) retrieval degrades first. | Retrieval tasks at 1k-113k tokens; 2023-2025 models | MODERATE | Weak transfer: Frank's ~10-15k tokens of rules sit at the low end of the tested ranges. |
| Community posts ("150-200 instructions", "300-350 words median") [R25, R26] | Uncited paraphrases of IFScale; the word-count claim attributed to GitHub's 2,500-repo study is not in that post (checked). | — | WEAK / unsupported | Do not cite. |

**Falsifier result (run by the context-cost branch):** NOT supported at Frank's size: that raw token volume (~10-15k tokens of rules) by itself measurably degrades quality; no study measures verbosity as a function of instruction volume; the Opus 5 doc claims consistent instruction following across the window. SUPPORTED: (i) instruction count degrades joint compliance multiplicatively even at 6-10 instructions and materially at 100-250 on 2025 models (INFERENCE on transfer); (ii) contradictions produce arbitrary choice (vendor) and length conflicts resolve toward the detailed option (small models); (iii) verification and double-check mandates directly increase output tokens on Opus 5 (vendor); (iv) emphasis inflation reduces salience and over-triggers on 4.5+ (vendor). Conclusion: the cost Frank feels (verbosity, ignored rules) is better explained by instruction count, contradictions, and verification-mandate content than by byte count; shrinking bytes is a by-product of fixing those.

### 2.4 Verbosity drivers, ranked by evidence

| Driver | Evidence | Grade |
|---|---|---|
| Model default (Opus 5 family runs longer; effort level does not change visible length) | [R20] | STRONG |
| Output-expanding mandates in always-on text: critical-verification (7,072 B: label every claim, 9-item DoD, adversarial review), learn-from-mistakes ("confirm the lesson back"), agent-self-learning write discipline | [R20] over-verification clause; [R10 §2.4 item 5] | STRONG (mechanism) / INFERENCE (magnitude) |
| No system-prompt-level brevity instruction: `outputStyle` is unset (PI `jq`); CLAUDE.md is "a user message after the system prompt", a weaker channel than an output style | [R27, R28] | STRONG |
| Brevity rule co-located with detail mandates (contradiction #5) | [R21] | WEAK-MODERATE |
| Missing shared vocabulary (mattpocock's thesis) | [R6, R7] | WEAK (no effect measurement) |

## 3. Recommendation — ordered action plan

Order = highest expected effect per unit of work first. Each step names the expected effect and the evidence grade behind it.

### 3a. Settings (zero context cost, one file)

| Step | Action | Expected effect | Grade |
|---|---|---|---|
| a1 | Set `"outputStyle": "Concise"` in `~/.claude/settings.json` (or `/config` → Output style; takes effect after `/clear`). Claude Code 2.1.240 is installed; Concise requires ≥ 2.1.237. Add ONE brevity line to `~/.claude/CLAUDE.md` in Anthropic's Fable 5 wording ("Lead with the outcome ... be selective about what you include, do not compress into fragments"). Put the same single line into the custom agents' bodies — output styles do not reach subagents. | Largest direct reduction of visible verbosity. Concise "leads with the result, skips preamble and narration ... keeps the complete content of error reports, security warnings, and confirmations for destructive actions" [R27]. | STRONG (vendor mechanism); magnitude unmeasured → pilot (§5). |
| a2 | Attribution: DONE. `includeCoAuthoredBy: false` and `attribution: {commit:"", pr:"", sessionUrl:false}` are both set (PI `jq`, this session). `includeCoAuthoredBy` is deprecated since 2.0.62; `attribution` is the current form [R29]. Keep a one-line rule for GH issue bodies and hand-written text, which the key does not cover. | Removes contradiction #1 at the harness level. | STRONG (FACT, applied). |
| a3 | Permissions fragment (verbatim JSON in `$D/round2/branch-prose-to-enforcement.md` §3). Summary: `deny` for things never wanted — `rm -rf`/`rm -fr`, `git push --force` (4 spellings), `sudo rm`, `mkfs`, `dd`, `Read`/`Edit` of credential paths (`~/.ssh`, `~/.aws`, `~/.kube`, `~/.config/gh`, `~/.config/gcloud`, `~/.gnupg`, `~/.git-credentials`, `~/.docker/config.json`, `~/.azure`, `~/.npmrc`, `~/.pypirc`, `~/.bashrc`, `~/.zshrc`); `ask` (confirm semantics, honoured in auto mode) for `git reset --hard`, remote-branch delete, `commit --amend`, `branch -D`, `terraform|tofu|pulumi|cdk apply|destroy|up|deploy`, `kubectl delete|drain|scale|apply|rollout|config use-context`, `helm install|upgrade|uninstall`, `gcloud * delete *`, `gcloud run deploy`, `gcloud iam|secrets|scheduler|storage rm`, `aws * delete-*`, `aws s3 rm`, `aws iam|secretsmanager|sqs purge-queue`, `az * delete *`, `psql`, `bq query|rm`, `mysql`, `redis-cli`, `find -delete|-exec rm`, `npm publish`, `gh release create`, `twine upload`, `curl`, `wget`, `mcp__slack__*`, `mcp__gmail__*`. Two PreToolUse Bash hooks: (1) jq/grep exit-2 block of `rm` with recursive+force flags in any order (trailofbits shape); (2) jq regex → `permissionDecision: "ask"` for `DROP TABLE|DATABASE|SCHEMA`, `TRUNCATE`, `DELETE FROM`, `ALTER TABLE`, `FLUSHALL|FLUSHDB`. | Converts ~40% of production-safety.md (the 1,935 B "Always pause and confirm" list) from "model remembers" to "harness enforces"; ~1.9 KB of prose becomes a ~450 B stub. Docs: "Use an ask or deny rule for a durable guarantee" [R30]. | STRONG (mechanism, official docs: deny → ask → allow, first match; `ask` forces a prompt even in auto mode); pattern coverage is MODERATE (docs warn argument-constraining Bash patterns are "fragile"; hooks fail open on exit 1/127/timeout). |
| a4 | Decisions Frank must make for a3 (from [R13 §6]): `rm -rf` deny or ask (recommendation: ask, because a global deny cuts nonprod scratch work); which migration runners/DB CLIs to enumerate; whether `curl`/`wget` ask is acceptable given prompt frequency (allow rules cannot override an ask for the same command); whether to add the heuristic "current kube/gcloud context contains prod" hook. | — | — |
| a5 | Do NOT use `effortLevel` or `verbose` for verbosity: effort controls reasoning depth; `verbose` is transcript display only [R27, R20]. | Avoids a non-lever. | STRONG |

### 3b. Rule pruning

**Minimal install list (from [R5 §2f]; always-on user layer 29,505 B ≈ 7.4k tokens DERIVED):**

| Keep (always-on) | Bytes | Note |
|---|---|---|
| rules/frank/preferences.md | 9,111 | Trim candidate (largest file): remove the 6-line preamble → HTML comment; move "Evidence this rule exists" paragraphs to comments; keep one "smallest change" statement (currently at l.77 and l.136). |
| rules/frank/production-safety.md | 5,103 → ≈3,620 after a3 | Already tracked in `manifest.json` custom[] (PR #27, commit 3c1ca7a9); no registration needed. Stays always-on (decision 8). |
| rules/frank/critical-verification.md | 7,072 | Stays always-on (decision 8). Trim: move the "real case" narrative paragraphs to HTML comments; keep the protocol and the DoD. |
| rules/frank/agent-self-learning.md | 5,289 (+≈600 merged trigger) | Merge learn-from-mistakes.md into it as one "Trigger + loop" section; delete the `continuous-learning-v2` layer row (dangling: not installed, no hook, no data dir; upstream v2 is ≈233 KB by blob sum at upstream/main, plus an observer process [R5 §7]). |
| rules/common/behavioral-guidelines.md | 2,600 | Karpathy text verbatim. Keep ONE copy: stop restating it in preferences "Balance complexity" (the `custom/skills/karpathy-guidelines/` copy is already deleted, PR #27), OR replace the whole file with Anthropic's 2-sentence over-engineering prompt [R20] (INFERENCE: equivalent content, −2.3 KB). |
| ~/.claude/CLAUDE.md | 330 | Add the one brevity line (a1). |

**Demote to on-demand (skills loaded by trigger words or by the agent that needs them). The first row is SUPERSEDED by decision 8 and is kept only as the evidence record:**

| File | Demote to | Expected effect | Grade |
|---|---|---|---|
| critical-verification.md (7,072 B) — SUPERSEDED: stays always-on, trimmed | (not applied) skill `critical-verification` with a 3-line always-on trigger ("when I say critical / verify / evidence-based, load skill X"); or accept `superpowers/verification-before-completion` (3.6 KB) as the §8 replacement | −7 KB/turn and removes the over-verification mandate from every turn; vendor: removing such instructions "reduces wasted tokens with no loss in quality" [R20] | STRONG (vendor) / INFERENCE (that a trigger line is followed) |
| learn-from-mistakes.md (2,602 B) | merged into agent-self-learning (above) | −2 KB | FACT (duplicate subject) |
| pr-workflow.md (1,569 B) | skill `pr-workflow` loaded by the agent that opens a PR; optional PostToolUse hook on `gh pr create` that runs the Copilot reviewer request | −1.6 KB; prose-to-enforcement found nothing in it mechanically enforceable | FACT (0 uses of `/pr`, `/review-pr`) |

**DROP (zero or near-zero usage in the transcript corpus, or superseded):** remaining `rules/common/{coding-style, security, git-workflow, hooks, patterns, performance}.md` (7,591 B; security checklist lives in the security-reviewer agent; coding-style duplicated by path-gated language packs); agents doc-updater (4 uses), e2e-runner (3), tdd-guide (1), and planner, build-error-resolver, database-reviewer, docs-lookup, go-build-resolver, go-reviewer, performance-optimizer, refactor-cleaner (0 each) — 11 in total; commands: the 20 zero-use files (58,217 B); skills: api-design, coding-standards, tdd-workflow, verification-loop, e2e-testing, git-workflow, backend/frontend/nestjs/mcp-server-patterns, architecture-decision-records, golang-*, python-*, continuous-learning v1, autonomous-loops, plan-orchestrate, safety-guard. Usage counts: FACT from transcript markers, validated twice (researcher E1-E3; PI implicit `Read` of SKILL.md showed no `Read` of any upstream ECC SKILL.md; the `Skill` tool shows one invocation of `api-design`, which stays on the DROP list) [R4 §1, R12 §2]. Decision 5 keeps all `custom/skills`; this DROP list covers upstream ECC skills only.

**paths:-gated packs:** KEEP python (6 files, 4,799 B; ≈1,281 `.py` reads/edits in 90 days) and typescript (5 files, 6,791 B; ≈143 `.ts` + ≈54 `.js`). DROP golang (0 `.go` files in 90 days) and web (16,056 B; 0 tsx/jsx/css/vue/svelte; the ≈22-35 `.html` are artifact pages). Frank's 90-day file mix is md 1,933, py 1,281, txt 894, yaml/yml 287, tf/tfvars/hcl 166 — Python + Terraform + docs; no Terraform rule pack exists and none is needed because terraform-skill (§3d) is on-demand. FACT for direction (no `.go`/`.tsx`/`.jsx`; `.py` far above `.ts`/`.js`); the magnitudes are de-duplicated per tool call and were not reproduced by the verifier (raw occurrence counts are ≈2x) [R5 §3].

**`disable-model-invocation: true`** on the manual-only commands `sessions`, `save-session`, `resume-session`, `product-cycle`, `jira` (their descriptions leave the per-turn listing — the skills doc equates the frontmatter flag with `skillOverrides: "user-invocable-only"`, whose table row reads "Listed to Claude: Hidden" [R38]; only `setup-pm` has it today). Leave trigger-style descriptions model-visible: ticket-sizing, deep-research, observability-buildout, security-review, focusd-protection. After drops + flags the listing is ≈1.4 KB (≈0.35k tokens DERIVED) vs ≈8.4 KB now [R5 §6].

**Dangling / drifted references to fix:** `continuous-learning-v2` (2 rules); `/done` advertised by session-log.md (removed); `commands/plan.md` referenced by development-workflow.md (both removed); 12 unmanaged files under `~/.claude` → OWN 1 (`skills/observability-buildout`), DELETE 11 (legacy command shims docs/e2e/eval/tdd/verify, feature-dev/pr/review-pr, plan-orchestrate, autonomous-loops, safety-guard) [R5 §4; production-safety.md, citation-verifier.md and deep-research ×3 are already tracked (PRs #26, #27); `commands/done.md` is already absent]. Design risk, not an observed occurrence: the current `sync` never compares the installed file against a recorded baseline, so a local in-place edit would be overwritten silently; the two files previously suspected (`commands/sessions.md`, `scripts/lib/transcript-context.js`) are byte-identical to HEAD (`cmp`), so no drift exists today [R31].

**De-duplication with zero behavioural loss:** Prompt Defense block ×3 → once (project layer); frank/ preambles → `<!-- -->` HTML comments (block comments are stripped before injection [R18]); "real case" narrative paragraphs → comments. ≈5.5 KB. Cut emphasis: drop the six "Highest priority — overrides ..." headers; reserve IMPORTANT for ≤2 lines in total [R19, R20].

### 3c. myclaude repo + ecc.js v2 (design from [R32], fork-vs-clone from [R32 §2], current-design facts from [R31])

Why a rewrite is justified (FACT): the current tool compares source hash vs installed hash only — it never compares the installed file against the recorded baseline, so a local edit would be overwritten silently (no occurrence observed today; see §3b). `diff` covers the `upstream` array only; `bible` is a duplicated code block with an empty manifest entry; `hashes` are keyed by path without source, so the same path from two sources collides; there is no pin or rollback.

**Manifest v2 schema (summary):** `version: 2`; `sourcesDir` (default `~/.ecc-sources`); `sources.<name> = {repo, ref, sha}` (40-char sha = the pin; `custom` is the only `local` source); `entries[] = {src, path, dest?, hash, forkedFrom?, kind?}` where `hash` = sha256[0:12] of the source at last accepted sync (the three-way BASE; for a directory entry, hash of the sorted `relpath\0sha256` list), `dest` defaults to `path` except skills where `skills/<category>/<name>/` → `skills/<name>/` (user scope is flat; nested scan under `~/.claude/skills` is undocumented), `forkedFrom` records provenance of a file Frank copied into custom, `kind: settings` marks a JSON fragment; `settingsOwned[]` lists the leaf keys / array identities the fragments own; `lastSync`.

**Commands:** `src add|rm|ls|update`, `ls <src> [prefix]`, `pick <src> <path> [--as name]`, `unpick <dest>`, `diff [--content]`, `accept [src]`, `sync [--dry-run] [--force]`, `fork <dest>`, `own <path>`, `rollback <src> <sha>`, `install`, `status`. Removed: the `bible` block and `agents --opus` (it edits installed files, which three-way sync would flag every time).

**Three-way states per entry** (S = source at pinned sha, B = recorded hash, D = installed): CURRENT (skip) · MISSING (copy) · UPSTREAM-CHANGED (copy only after `accept`) · LOCAL-MODIFIED (refuse; suggest `fork` or `--force`) · CONFLICT (refuse; show both diffs) · CONVERGED (set hash) · DELETED-UPSTREAM (keep, report) · FORK-DRIFT (report only).

**Settings fragments:** `settings/*.json` partial objects (attribution, outputStyle, hooks, permissions.deny/ask, enabledPlugins); deep-merge objects, union arrays keyed by identity (hook = matcher + command; permission = rule string); never touch `model`, `env`, `tui`, `skipAutoPermissionPrompt`, or project-level files. This is what makes the a3 gate identical on both machines.

**Migration to myclaude (7 steps; decision 3 makes ECC a plain clone):** (1) move `fsun_config/{ecc.js, manifest.json, custom, docs, mcp_recipes, REQUIREMENTS.md}` into the myclaude repo root (optionally `git filter-repo --subdirectory-filter fsun_config` to keep history); (2) run the one-shot v1→v2 converter (`upstream[]` → `src:"ecc"`; `custom[]` → `src:"custom"`; duplicate `commands/sessions.md` → custom with `forkedFrom`; `sources.ecc.sha` = the fork's merge-base `4130457d`, i.e. the commit the installed files came from, not the tip); (3) `install` clones ECC at that sha; acceptance test = `sync --dry-run` reports 0 writes (no LOCAL-MODIFIED files exist today); (4) change the hard-coded dev fallback in `session-manager-fsun.js` l.33 from `~/devel/everything-claude-code/scripts/lib` to the source-clone path or delete it (primary resolution `~/.claude/scripts/lib` is always populated); (5) move the two auto-memory files keyed by the old cwd; (6) stop rebasing the eliteGoblin ECC fork; the clone at the pinned sha replaces it (decision 3), the fork is kept only if an upstream PR is ever needed; (7) update `~/.mycc/notes.md` and CLAUDE.md paths. Runtime coupling to upstream is exactly the 7 `scripts/**` entries already in the manifest (FACT: `require()` closure computed twice [R5 §5, R32 §2.1]).

**Line estimate (DERIVED, ±30%; ANECDOTAL — not checkable, not a basis for any decision):** ≈555 lines new (range 390-720), split into `ecc.js` CLI + `lib/sources.js` + `lib/settings-merge.js`; ≈150 lines of tests (fixture repo; three-way sync; settings merge). Removes ≈240 lines from the current 611.

**Where native mechanisms fit:** a personal marketplace (`.claude-plugin/marketplace.json` in myclaude with `github {repo, ref, sha}` plugin entries — the user who authors the entry controls the sha pin, FACT [R33 l.243-262]; note the marketplace *source* itself supports `ref` but not `sha`, only plugin entries pin by sha) for whole, read-only packs only (e.g. `pyright-lsp` stays on the official marketplace). Rule: "will I ever edit or subset it?" yes → ecc.js `pick`; no → marketplace. Never both for the same source (duplicate listings). Branch-internal scores (INFERENCE, ANECDOTAL — a rubric, not a checkable fact; the recommendation rests on the mechanism facts above, not on these numbers): generalised ecc.js 22/24; personal marketplace 15/24; `npx skills add` 12/24; submodule/subtree 14; chezmoi/stow 14 [R32 §1, R34 §3].

### 3d. Sources to register first and the concrete pick list

| Order | Source | Pick | Why | Grade |
|---|---|---|---|---|
| 1 | ecc (affaan-m/everything-claude-code, pinned at merge-base) | agents: code-reviewer, architect, python-reviewer, security-reviewer, typescript-reviewer; scripts: `hooks/session-end.js`, `lib/{utils, agent-data-home, llm-summary, transcript-context, session-manager, session-aliases}.js`; rules: python/* and typescript/* packs; skill: security-review | The used subset; closure of the session system | FACT (usage + closure) |
| 2 | custom (myclaude `custom/`) | rules/frank/* (trimmed), agents ba-curator / e2e-verifier / release-verifier / citation-verifier, commands sessions / product-cycle / ticket-sizing / save-session / resume-session / jira, skills deep-research / observability-buildout / focusd-protection, settings fragments | Frank's own work; the 1 currently unmanaged item (`skills/observability-buildout`) becomes OWN | FACT |
| 3 | mattpocock/skills (MIT, 232k stars, 137 commits/30 d, sha-pinned) | `skills/productivity/writing-for-agents/`, `grilling/`, `wait-what/`; `skills/engineering/diagnosing-bugs/`, `codebase-design/`; `tdd/` only after unpicking ECC `commands/tdd.md` and `skills/tdd-workflow` (both 0 uses) to avoid a same-name listing collision. Skip the issue-tracker chain (to-spec, to-tickets, triage, wayfinder, code-review, implement): hard dependency on per-repo `/setup-matt-pocock-skills` docs and GitHub issues. Watch the CHANGELOG: renames are frequent. | Standalone, small (median ≈3.4 KB), doctrine directly relevant to pruning. Pick list confirmed by decision 4. | STRONG (content read in full) |
| 4 | antonbabenko/terraform-skill (Apache-2.0, v1.17.1, last push 2026-07-03) | `skills/terraform-skill/` (20.4 KB core + 175 KB `references/` loaded by failure category) | Only Terraform content found with a production-safety contract ("Never run terraform destroy ... without first running terraform plan -destroy"; "Rollback notes" in the response contract); ECC has no Terraform or GCP skill, rule, or command (FACT: grep; one security-review reference file mentions Terraform). GCP specifics are routed to a reference file ("What's the Azure/GCP equivalent of X", SKILL.md l.54) — Frank's observability-buildout covers his GCP side. | STRONG (read) / INFERENCE (fit) |
| 5 | trailofbits/claude-code-config + trailofbits/skills (CC-BY-SA-4.0; fine for private use, share-alike applies to redistributed modified copies) | the deny list + two jq PreToolUse hooks (already folded into a3); `plugins/fp-check` (6.7 KB: TRUE/FALSE POSITIVE verdict with evidence — the on-demand form of critical-verification §6-7); `plugins/differential-review` (7.1 KB: blast-radius review of a diff; fits infra PRs); optional `gh-cli`, `insecure-defaults` | Highest engineering rigor of the surveyed repos (CI-mirrored Makefile, validator self-tests) | STRONG (read) |
| 6 | obra/superpowers (MIT) | `skills/verification-before-completion/` (3.6 KB) only — as the on-demand replacement for critical-verification §8. Do NOT install the plugin: its SessionStart hook injects `using-superpowers` (3.1 KB) on every start/compact, and `brainstorming` says "You MUST use this before any creative work", which conflicts with Frank's autonomy rule. | — | STRONG (read) |
| 7 | forrestchang/andrej-karpathy-skills (no license field; stale since 2026-04-20) | Nothing new. Keep ONE copy of the four principles (§3b). Replaces the `bible` source; `~/claude-bible` clone and the empty `bible[]` array go away. | Content already present in behavioral-guidelines.md and the preferences restatement | FACT |
| 8 | JuliusBrussee/caveman (MIT skills) | `skills/caveman/SKILL.md` at `lite` level only (lite row: "No filler/hedging. Keep articles + full sentences"; the general rule block that applies to every level adds "No tool-call narration" and "Errors quoted exact"); never `full`/`ultra` (drops articles — conflicts with the non-native-reader rule). Run `caveman learn report --json` once as a measurement of token sinks. The 33.2%/65% claims are the author's own benchmark, unverified (ANECDOTAL). | Optional; pilot after a1, not alongside | MODERATE |
| 9 | anthropics/claude-code `plugins/hookify` | the rule format only (`event: bash / pattern / action: warn|block`) for the `console.log` warn rule; note it has no `ask` action and fails open (`exit 0` on any exception), so Bash gates stay in `permissions.*` | — | STRONG (source read) |
| 10 | hashicorp/agent-skills (MPL-2.0) | `terraform-style-guide` (7 KB), `terraform-test` (11 KB) as HCL-convention companions to 4; skip the 8 provider-development skills | Low priority | MODERATE |

Deliberately ignored (with reason): davila7 (aggregator, 897 skills, copies VoltAgent), alirezarezvani (re-packages originals), ruflo (runtime platform, 15.6 KB avg skill), humanlayer (internal, stale, NOASSERTION), VoltAgent (persona scaffolds), context-engineering-kit (GPL-3.0; 22.7 KB avg skill contradicts its "minimal footprint" claim), diet103 (TS-monorepo specific, stale), wshobson (take a postmortem/SLO template only if one is actually missing), compound-engineering (not inspected; 15-agent review chain, likely heavy) [R35].

### 3e. What NOT to build

| Item | Reason |
|---|---|
| Switching base to any single repo (mattpocock, superpowers, trailofbits) | None covers rules + hooks + agents + sessions (V1, V2). |
| `npx skills add` as the installer (also excluded by decision 7: manual update/diff/accept/sync via ecc.js) | Skills-only; symlink layout; second lockfile outside the manifest; `update` has no local-edit check — it hashes the freshly fetched source against the lock entry and never hashes the installed folder (FACT: `update.ts` read; the lockfile path and the reinstall apply path were not located in `update.ts`). Use `npx skills use` only to try a skill. |
| Packaging `custom/` as a plugin or marketplace | Plugins cannot ship rules or CLAUDE.md ("A CLAUDE.md file at the plugin root is not loaded as project context" [R36]); Frank is the only consumer. |
| Installing `continuous-learning-v2` | ≈233 KB, a hook on every tool call, a background observer; the role it names is already served by auto-memory `MEMORY.md` + ECC rule edits. |
| A 400-line "concision skill" or more brevity rules | mattpocock: "Skills that fight verbosity fail by growing" [R6]; vendor: one short instruction is enough [R20]. Use the output style. |
| Semver, dependency resolution, globs, symlink mode, per-machine manifest overrides, chezmoi/stow, submodules, GitHub-API hash checks, auto-delete of orphans, `~/.claude.json` management | YAGNI; each was scored or reasoned out in [R32 §6.6, R34 §5]. |
| The superpowers plugin as a whole; the mattpocock engineering chain; persona agents (sre-engineer, terraform-specialist) | Always-on injection / per-repo setup burden / generic prose without GCP specifics. |
| Hard-wrapping, effort-level or `verbose` changes for verbosity | Non-levers [R20, R27]. |

## 4. Per-branch closing status

| Branch | Status | Decisive artefact | Where |
|---|---|---|---|
| mattpocock-skills | CONCLUDED | Inventory of 36 skills; absence proof for rules/hooks/agents/sessions; pain-point map | round1/branch-mattpocock-skills.md |
| native-multisource | CONCLUDED | Mechanism × granularity × update path × per-turn cost table | round1/branch-native-multisource.md §2 |
| context-cost-verbosity | CONCLUDED | Per-file byte table; duplication + 6 contradictions; graded literature; ranked interventions; falsifier | round1/branch-context-cost-verbosity.md |
| ecc-audit | CONCLUDED | Usage counts; KEEP/DROP per file; minimal install list (29,505 B); language-pack proxy; unmanaged-file decisions (12 after verification); 11-file closure | round1 + round2/branch-ecc-audit.md |
| alternative-sources | CONCLUDED | 20-repo table; 10-item pick list; ignore list | round1/branch-alternative-sources.md |
| multisource-tooling | CONCLUDED | Manifest v2, commands, three-way states, settings fragments, migration, line estimate, fork-vs-clone | round1 + round2/branch-multisource-tooling.md |
| prose-to-enforcement | CONCLUDED | Per-bullet enforceability table; settings fragment; risks; 5 questions for Frank | round2/branch-prose-to-enforcement.md |

## 5. What to measure next (ranked)

| Rank | Measurement | Question it settles |
|---|---|---|
| 1 | `/context` and `/doctor` in an interactive session, before and after §3a-b | Replaces every DERIVED token number with a measured one; `/doctor` also reports the skill-listing cost and proposes CLAUDE.md trims. |
| 2 | Concise output style pilot for one week on real tasks, including at least two "critical / verify" tasks | Does Concise conflict with the evidence-presentation requirement (FACT/INFERENCE labels, confidence, unverified gaps)? Docs say Concise keeps error/security/destructive-confirmation content and answers in full when detail is asked; untested for this rule set. |
| 3 | `InstructionsLoaded` hook (2.1.69+) logging `path_glob_match` reasons for a few sessions | Second proof that user-scope `paths:` gating works; shows exactly which rules load on which file reads, and whether the typescript pack loads on the first `.js` read in a given repo. |
| 4 | Repeat-mistake tally after pruning (the metric in Frank's own agent-self-learning rule): do rules that were previously ignored now get followed? | Local test of the vendor assertion "if Claude keeps doing something you don't want despite a rule, the file is too long". |
| 5 | Dry-run each gate of a3 on each machine: `echo '{"tool_input":{"command":"rm -rf /tmp/x"}}' | sh -c '<hook>'`; confirm `jq` is installed; try `git push -f`, `rm -r -f`, `FOO=1 rm -rf` | Hooks fail open on exit 1/127/timeout; this is the only way to know the gate is live. |
| 6 | Probe: create `~/.claude/skills/zz/probe/SKILL.md`, run `/skills` | Whether nested skill dirs are scanned at user scope (U1). The v2 `dest` rule assumes flat; the design does not depend on the answer. |
| 7 | `caveman learn report --json` once (optional) | Independent ranking of token sinks (heavy CLAUDE.md, never-invoked skills) to cross-check the byte tables. |
| 8 | `claude plugin details <name>` for any candidate plugin before enabling it | Official always-on vs on-invoke token cost per plugin. |

## 6. What the literature cannot answer

- Whether behavioural-rule adherence on Fable 5 degrades with instruction count the way keyword-inclusion (IFScale, Opus 4 / Sonnet 4) and format constraints (ManyIFEval, Claude 3.5) did. No study tests this model or this instruction type; the vendor asserts improved instruction following without numbers.
- The magnitude of "reduce adherence" for files over 200 lines: the vendor states it, publishes no measurement.
- Whether a shared-vocabulary document (mattpocock's CONTEXT.md) measurably reduces output length. Author assertion only; a critical guide notes no controlled comparison exists.
- Whether the Concise output style and a critical-verification evidence requirement coexist without loss. Only a local pilot can answer (§5 rank 2).
- Whether context rot at 10-15k tokens of rules is material: the retrieval studies start at larger contexts and different tasks.
- Any number from X posts (63%), podcasts, or community blogs: unfetchable or uncited.

## 7. References

| # | Source | Evidence note |
|---|---|---|
| R1 | mattpocock/skills clone, HEAD 5b15a47 (`$D/src/mattpocock-skills`); https://github.com/mattpocock/skills | evidence/mattpocock-skills-repo.md |
| R2 | round1/branch-mattpocock-skills.md §2, §6 | — |
| R3 | round1/guide-review.md §2 (PI measurements) | — |
| R4 | round1/branch-ecc-audit.md | — |
| R5 | round2/branch-ecc-audit.md | — |
| R6 | aihero.dev/skills-wait-what (= repo docs/productivity/wait-what.md) | evidence/aihero-wait-what.md |
| R7 | kaizencode.art/notepad/matt-pocock-skills-guide/ (2026-07-16) | evidence/kaizencode-matt-pocock-skills-guide.md |
| R8 | explainx.ai Matt Pocock Skills v1.0 guide (2026-06-18) | evidence/explainx-v1-progressive-disclosure.md |
| R9 | X posts @mattpocockuk (titles only; x.com HTTP 402) | evidence/x-mattpocockuk-posts.md |
| R10 | round1/branch-context-cost-verbosity.md | — |
| R11 | mattpocock overlap notes | evidence/mattpocock-overlap.md |
| R12 | round1/guide-review.md §2 | — |
| R13 | round2/branch-prose-to-enforcement.md | — |
| R14 | https://code.claude.com/docs/en/context-window; /output-styles; /settings-reference; /model-config | evidence/anthropic-cc-output-styles-settings.md, evidence/cc-docs-context-window.md |
| R15 | https://code.claude.com/docs/en/sub-agents | evidence/cc-docs-sub-agents.md |
| R16 | Jaroslawicz et al. 2025, IFScale, arXiv:2507.11538 | evidence/ifscale-jaroslawicz-2025.md |
| R17 | Harada et al. 2025 (EMNLP), ManyIFEval, arXiv:2509.21051 | evidence/manyifeval-harada-2025.md |
| R18 | https://code.claude.com/docs/en/memory | evidence/anthropic-cc-memory-docs.md, evidence/cc-docs-memory.md |
| R19 | https://code.claude.com/docs/en/best-practices | evidence/anthropic-cc-best-practices.md, evidence/cc-docs-best-practices.md |
| R20 | https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/{claude-prompting-best-practices, prompting-claude-opus-5, prompting-claude-fable-5} | evidence/anthropic-prompting-best-practices.md |
| R21 | Javed et al. 2026, PRIME, arXiv:2606.22470 | evidence/prime-javed-2026.md |
| R22 | Chroma 2025, Context Rot, https://www.trychroma.com/research/context-rot | evidence/chroma-context-rot-2025.md |
| R23 | Modarressi et al. 2025 (ICML), NoLiMa, arXiv:2502.05167 | evidence/nolima-modarressi-2025.md |
| R24 | Liu et al. 2023 (TACL), Lost in the Middle, arXiv:2307.03172 | evidence/lost-in-the-middle-liu-2023.md |
| R25 | dev.to/minatoplanb (2026-03-08); tianpan.co (2026-02-14); github.blog AGENTS.md post (2025-11-19) | evidence/community-claude-md-too-long.md |
| R26 | alexop.dev "Stop Bloating Your CLAUDE.md" (2026-01-18) | evidence/alexop-claude-md-bloat.md |
| R27 | https://code.claude.com/docs/en/output-styles; changelog 2.1.237 | evidence/cc-docs-output-styles.md, evidence/cc-changelog.md |
| R28 | Anthropic Engineering, Effective context engineering for AI agents (2025) | evidence/anthropic-context-engineering-2025.md |
| R29 | settings-reference `attribution` / `includeCoAuthoredBy` | evidence/prose-to-enforcement-mechanisms.md §E4, evidence/cc-docs-settings.md |
| R30 | https://code.claude.com/docs/en/permissions; /auto-mode-config; /hooks | evidence/prose-to-enforcement-mechanisms.md §E1-E5 |
| R31 | fsun_config/ecc.js (611 lines), manifest.json, measured drift | evidence/ecc-js-current-design.md |
| R32 | round2/branch-multisource-tooling.md | — |
| R33 | https://code.claude.com/docs/en/plugin-marketplaces | evidence/cc-docs-plugin-marketplaces.md, evidence/native-plugin-marketplace-mechanics.md |
| R34 | round1/branch-multisource-tooling.md | — |
| R35 | round1/branch-alternative-sources.md (20 repos) | evidence/{terraform-skill, trailofbits-skills, superpowers, caveman, claude-code-plugins, anthropics-skills, karpathy-skills, karpathy-skills-readme, wshobson-agents, voltagent, davila7, alirezarezvani, ruflo, humanlayer, context-engineering-kit, diet103, compound-engineering, awesome-claude-code, vercel-skills}.md |
| R36 | https://code.claude.com/docs/en/plugins; /plugins-reference | evidence/cc-docs-plugins.md, evidence/cc-docs-plugins-reference.md |
| R37 | vercel-labs/skills README + src/{skill-lock, local-lock, update}.ts | evidence/vercel-labs-skills-cli.md, evidence/vercel-skills-cli-mechanics.md |
| R38 | https://code.claude.com/docs/en/skills | evidence/cc-docs-skills.md |
| R39 | https://code.claude.com/docs/en/features-overview; /discover-plugins | evidence/cc-docs-features-overview.md, evidence/cc-docs-discover-plugins.md |
| R40 | aihero.dev/how-to-kill-the-bloat-in-claude-codes-system-prompt (about CC built-in tools, not user rules) | evidence/aihero-kill-bloat.md |
| R41 | trailofbits/claude-code-config settings.json + hooks (`$D/src/tob-config`) | evidence/prose-to-enforcement-mechanisms.md §E6 |
| R42 | anthropics/claude-code plugins/hookify source | evidence/prose-to-enforcement-mechanisms.md §E7 |
| R43 | gh api repos/mattpocock/skills (2026-08-23) | evidence/github-api-mattpocock-skills.md |

## 8. Verification footer

Verifier: citation-verifier, 2026-08-23, full report at `$D/verification.md`. Method: resolution sweep of every reference in §7, atomic claim extraction, per-claim check against the fetched source or a re-run of the stated read-only command, in randomised order, without reading the draft's reasoning or grades; every CONTRADICTED verdict was confirmed by a second, differently-shaped check.

References: 136/136 resolve (52 external, 84 local). `forrestchang/andrej-karpathy-skills` redirects to `multica-ai/andrej-karpathy-skills` (moved, not dead). No reference was removed.

Claims checked: 78 (every load-bearing claim, plus 24 supporting claims sampled across §1-§6).

| Verdict | Count |
|---|---|
| SUPPORTED | 54 |
| PARTIALLY SUPPORTED | 15 |
| CONTRADICTED | 6 verdict rows = 4 distinct facts (production-safety.md is tracked; karpathy custom skill already deleted; doc-updater 4 / e2e-runner 3 / tdd-guide 1 uses, not zero; no in-place edit or drift of installed files) |
| UNSUPPORTED | 0 |
| UNVERIFIABLE | 3 (the 12-15 KB target, the ≈555-line estimate, the option scores) |

Failure rate (P + C + U among claims checked): §1 20% (10 checked, exhaustive) · §2 28% (25 checked, all numeric and literature rows) · §3 33% (36 checked, every byte, count, file-existence and mechanism claim) · §5-6 0% (7 checked).

How the verdicts were applied in this document: PARTIALLY SUPPORTED claims were narrowed to the verifier's wording with the citation kept; CONTRADICTED claims were replaced with the verifier's corrected fact; UNVERIFIABLE items are labelled ANECDOTAL inline and are not used in any recommendation. The failures clustered in §3b/§3c: statements about the repository that were true at the merge-base 4130457d or on an older checkout but false on HEAD today. None changed the verdict in §1 or the order of §3.

NOT verified, and why:
- Text of the x.com posts (the 63% figure, "19th most-starred", the system-prompt bloat thread): x.com returns HTTP 402 to a content fetch; titles only via search.
- Whether nested skill directories are scanned at user scope (`~/.claude/skills/<a>/<b>/SKILL.md`): undocumented; the §5 rank 6 probe has not been run.
- Every `/context` token count: all token numbers in this document are DERIVED (bytes/4) and were not measured in an interactive session (§5 rank 1).
- Transfer of IFScale (Opus 4 / Sonnet 4, keyword-inclusion instructions) and ManyIFEval (Claude 3.5 Sonnet, format constraints) to Fable 5 and to behavioural rules: no study tests this model or this instruction type.
- Also unreproduced: the "smallest average SKILL.md of all 20 repos" (3 of 20 re-measured); extension-count magnitudes (direction confirmed, magnitudes depend on de-duplication); the V2 "method validated against known invocations" procedure; the 313 KB figure for continuous-learning-v2 (233 KB reproduced); the concrete deny/ask pattern coverage in a3 (mechanism verified, each pattern untested until the §5 rank 5 dry-run).
