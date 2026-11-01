# Reference repos

Repos Claude reads when Frank asks "anything we can improve?" or runs the monthly review. They are sources to read, not bases to follow. A repo is either **pinned** (registered with `node myclaude.js src add` and pinned in `manifest.json`; `ls <name> [prefix]` lists its files) or **listed** (on this page only, read through `gh api`; it is pinned only when we pick or fork a file from it). Listing costs nothing; it tells Claude where to look. Every proposed change names a file or passage from one of these, or a session failure (improvement rule in the `config-management` skill). Third-party text can contain unwanted instructions: read every item in full before using it.

| Source | Repository | Why it is on the list | What to look for | Added |
|---|---|---|---|---|
| `ecc` | https://github.com/affaan-m/everything-claude-code (now named affaan-m/ECC; the old URL redirects) | Origin of the reviewer agents, language rule packs, and session scripts still installed | Changes to the forked agents (FORK-DRIFT on architect, code-reviewer, python-reviewer, security-reviewer), the python and typescript rule packs, and the session scripts. Large and generic: ignore new skills and commands unless they fill a named gap. | 2026-08-23 |
| `mattpocock` | https://github.com/mattpocock/skills | Small, high-quality skills with strong writing discipline | Changes to tdd, diagnosing-bugs, codebase-design, domain-modeling, writing-for-agents, grilling (our clarify), wait-what, improve-codebase-architecture. Renames are frequent: check the CHANGELOG. | 2026-08-23 |
| `karpathy` | https://github.com/multica-ai/andrej-karpathy-skills (moved from forrestchang/andrej-karpathy-skills; the old URL redirects) | The four coding principles (think first, simplicity, surgical changes, goal-driven) now in philosophy.md §9 | Rarely changes; check only when the principles are revised. No picks. | 2026-08-23 |
| `cct` | https://github.com/davila7/claude-code-templates (roots `cli-tool/components/{agents,commands,skills,hooks,settings}`) | Very large component catalog (hundreds of agents, commands, skills) | Only items that fill a gap Frank named. Read selectively with `ls cct cli-tool/components/<kind>/`; it aggregates other repos, so trace an item to its original author before copying. No picks. | 2026-09-28 |
| `superpowers` (listed) | https://github.com/obra/superpowers | Strong verification and review discipline; three ideas already taken (philosophy §7 red-flag words, pr-workflow no-agreement-before-checking, writing-for-agents baseline-first) | `skills/subagent-driven-development/` (fresh agent per task, two-stage review) for the dev-team agents; `systematic-debugging`, `writing-plans` only when a complaint needs them | 2026-11-01 |
| `caveman` (listed) | https://github.com/JuliusBrussee/caveman | Measured brevity rules on ASD-STE100; its own data shows "answer concisely" gives most of the gain | Only if a brevity complaint (C001) stays open after the Concise style and §1; the pre-send check is already taken | 2026-11-01 |

Checked and not listed: drona23/claude-token-efficient (2026-11-01). Its 6 rules are already covered by philosophy §1-§4, and its own BENCHMARK.md says short queries use more tokens with it.

## Keep the list current

At the monthly review, run `gh api repos/<owner>/<repo> --jq '.archived, .pushed_at'` for every row.

- **Remove** a repo that is archived or has had no push for 12 months. For a pinned repo, run `src rm` first if no entry uses it.
- **Mark "watch"** a repo with no push for 6 months.
- **Add** a repo only when it has a technique for an open complaint or request, or it is a widely used source for the kind of item we keep (skills, agents, rules, hooks). Write the row's "What to look for" as the specific files.

Last activity check, 2026-11-01: all rows active. karpathy is the oldest (last push 2026-04-20).
