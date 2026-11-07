---
name: complaints
description: Frank's register of complaints about Claude and feature requests in ~/devel/myclaude/requirements/complaints. Use when Frank says "record this complaint", "complain to myclaude", "log this pain point", "add a request", "record this feature request", "I need <capability> for <work>", "work on my complaints", "check my complaints", or pastes a frustrating exchange and asks to record it.
---

Sources: Frank's session 2026-11-01 (complaint loop: exact quotes, repro checks, close only when the check passes); myclaude `requirements/complaints/README.md` (format); philosophy §2 (plan gist) and §7 (done means exercised).

# Complaints

Frank is the customer; the `ba-curator` agent owns the register. Folder: `~/devel/myclaude/requirements/complaints/`; format and check keys: its `README.md`. Two types: `complaint` (Claude behaved badly, id `C001`) and `request` (a capability Frank needs now, id `R001`).

## Record

1. Copy Frank's exact words and the Claude reply that caused them, from this conversation or from the pasted text. Quote exactly; never paraphrase. A reply you do not have: write "excerpt: not captured at the time".
2. Take the next free id (highest `C` or `R` number plus 1). Choose the failure mode (`docs/INVENTORY.md`).
3. Write `## Expected` and a `json repro` block that fails today. For a request, `## Expected` is the acceptance list and the repro is the acceptance check. A behaviour that cannot be checked headlessly: status MANUAL and no repro block.
4. This repo is PUBLIC. Before saving, remove work-specific content from the quotes (company, people, repo and service names, code, URLs, IPs, tokens) and keep only the behaviour pattern. Mark each removed part as "[removed: work detail]". If the complaint cannot be described without private content, tell Frank and do not record it here.
5. Run `node ~/devel/myclaude/myclaude.js complaints list --write` for the index row. Branch from `origin/main`, commit, open a PR per the `pr-workflow` skill. Copilot is unavailable on this repo: say so in the PR.
6. After the PR is clean, merge it so the item lands on main (`pr-workflow`), then run `node myclaude.js sync`.
7. Tell Frank in one line: the id and the PR link.

## Check

Run `node ~/devel/myclaude/myclaude.js complaints check --record` and report the table. Lead with failures. A FIXED-VERIFIED or DONE-VERIFIED row that fails is a regression (exit 1): say that first. A row "could not run" (exit 2) has no verdict: report the reason, not a failure. Each run calls `claude` and costs tokens; name an id to check one item. The check runs the installed `~/.claude` config.

## Fix ("work on my complaints")

1. Dispatch the `ba-curator` agent to triage the OPEN items: priority, failure mode, `## Expected`, repro.
2. Per item, run its check first. The baseline must fail. A baseline that passes means no change is needed: report it.
3. Find the smallest fix. Edit an existing rule or skill before adding anything. Name the source: a `docs/REFERENCES.md` repo or an Anthropic doc, with a link.
4. Show Frank the plan in at most 5 lines and wait for his go (philosophy §2).
5. Apply the fix on a branch: direct edit for rule or skill text; a `general-purpose` agent that follows the `tdd` skill for code.
6. Run `node myclaude.js sync` from the checkout that holds the fix (the check reads `~/.claude`), then `complaints check <id> --record`.
7. The `ba-curator` signs off. It sets FIXED-VERIFIED (DONE-VERIFIED for a request) only when every run passed, and adds the PR link under `## Fix`. Open the PR per `pr-workflow`.

Add a skill, agent, or rule only when an item needs it. Build a request only when Frank is about to use it, and extend an existing agent or skill before adding a new one.
