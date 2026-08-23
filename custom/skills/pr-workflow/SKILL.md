---
name: pr-workflow
description: Copilot-review and green-CI completion protocol for GitHub PRs. Use when creating a PR, or before calling any PR done.
---

# PR Review Workflow — Copilot + CI

Applies to every GitHub PR Frank creates.

## On every PR I open

1. Request a GitHub Copilot code review on the PR. Use the available
   mechanism (`gh` CLI, `gh api .../requested_reviewers` adding the Copilot
   reviewer, or the GitHub review-request equivalent). Confirm the request
   actually registered — do not assume.
2. Wait for Copilot's review to post, then fetch all of its comments.

## Address every Copilot comment

For each comment, do exactly one of:

- Agree → fix it in code, push the fix, then reply on that comment
  thread: `Fixed`.
- Disagree → reply on that thread with a clear, specific reason. Never
  silently ignore or dismiss without explanation.

No Copilot comment may be left unaddressed. Every single one ends in either
a fix + `Fixed` reply, or a reasoned rebuttal reply.

## CI must be green

- Before treating the PR as done, all CI checks for that PR must pass.
- If any check is failing, diagnose and fix the cause, push, and re-check
  until every check is green.
- Never hand off or call a PR complete while its CI is red or pending-failed.

## Definition of done (for a PR I created)

- [ ] Copilot review requested and received
- [ ] Every Copilot comment resolved — fixed (`Fixed`) or rebutted (reason)
- [ ] All CI checks green
