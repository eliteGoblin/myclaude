---
name: pr-workflow
description: The one PR process for Frank's GitHub PRs - scope, reviewers, Copilot review with every thread fixed or rebutted and resolved, green CI. Use when opening a PR, or before calling any PR done or merging it.
---

Sources: myclaude@f77bb6d custom/skills/pr-workflow/SKILL.md; obra/superpowers skills/receiving-code-review/SKILL.md (no agreement before checking, 2026-10-25); PR #5 (Copilot unavailable, local reviewers used); custom/commands/product-cycle.md "Copilot review — exact commands" (moved here 2026-09-28); claude-bible.md rule 9 (small PRs, decisions settled before opening, merge only if clean, verify after merge).

# PR workflow

## Before opening

- One change = one PR. Keep it small and single-purpose; do not batch unrelated changes.
- Settle the scope and every material decision before opening. Collect the open questions together, get the answers, then open one clean PR. Amending the approach inside an open PR forces repeated CI and review.

## Review

1. Run the `code-reviewer` agent on the diff (and `python-reviewer` for `.py` changes, `security-reviewer` when the change touches input handling, auth, secrets, or endpoints). When the PR changes architecture, also run the `architect` agent. Fix CRITICAL and HIGH findings in the PR or state why each is deferred.
2. Request a GitHub Copilot review and address every comment with the commands below.

## Copilot review — exact commands

Set `O`, `R`, `N` to owner, repo, PR number.

1. Request Copilot, then confirm the request registered (do not assume):
   ```bash
   gh api --method POST repos/$O/$R/pulls/$N/requested_reviewers -f "reviewers[]=copilot-pull-request-reviewer[bot]"
   gh api repos/$O/$R/pulls/$N/requested_reviewers -q '.users[].login'
   ```
2. Wait 1-3 minutes, then fetch the review and every inline comment:
   ```bash
   gh api repos/$O/$R/pulls/$N/reviews  -q '.[]|select(.user.login|startswith("copilot"))|.body'
   gh api repos/$O/$R/pulls/$N/comments -q '.[]|{id,path,line,body:.body[0:300]}'
   ```
3. For each comment, do exactly one: agree → fix it, push, reply `Fixed`; disagree → reply with a specific reason. No comment is left without a reply.
   ```bash
   gh api --method POST repos/$O/$R/pulls/$N/comments/<COMMENT_ID>/replies -f body="Fixed"
   gh api --method POST repos/$O/$R/pulls/$N/comments/<COMMENT_ID>/replies -f body="Won't fix: <specific reason>"
   ```
4. Resolve every thread (a reply does not resolve it):
   ```bash
   gh api graphql -f query='{repository(owner:"'$O'",name:"'$R'"){pullRequest(number:'$N'){reviewThreads(first:50){nodes{id isResolved comments(first:1){nodes{databaseId}}}}}}}'
   gh api graphql -f query='mutation{resolveReviewThread(input:{threadId:"<THREAD_ID>"}){thread{isResolved}}}'
   ```

If the Copilot request fails (for example, Copilot review is not enabled for the repo, as on eliteGoblin/myclaude), report that in a PR comment and run the reviewer agent for the language (and `security-reviewer` for process, file-deletion, or auth code) on `git diff main...HEAD` instead. Post one PR comment that lists each finding as fixed or rebutted. Do not claim a Copilot review happened.

When you handle any review comment (Copilot, agent, or human):

- Do not open with agreement or praise ("You're absolutely right", "Great catch"). Check the claim against the code first.
- Then fix it, or rebut it with the evidence (file, line, or command output). A comment you agree with but did not check is not handled.


## CI and merge

- Every CI check is green before the PR is done: `gh pr checks $N --repo $O/$R`. If a check fails, find the cause, fix it, push, and check again.
- Merge only when clean: CI green, no open CRITICAL or HIGH finding, every Copilot thread resolved, and no destructive plan (a destructive plan is a production-safety gate).
- After merge, verify the result: pipeline green, state converged, the expected effect observed.

## Definition of done

- [ ] Copilot review requested and received (or its failure reported)
- [ ] Every Copilot comment fixed (`Fixed`) or rebutted, and every thread resolved
- [ ] Reviewer agents run; CRITICAL/HIGH fixed or deferred with reason
- [ ] All CI checks green
- [ ] After merge: the result verified
