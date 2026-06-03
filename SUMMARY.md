# ECC Install Summary — Frank's JS Setup

**Installed:** 2026-04-06
**Profile:** core + lang:typescript (then pruned to JS-only)
**Target:** `~/.claude/` (Claude Code home)
**Fork:** `eliteGoblin/everything-claude-code` (origin)
**Upstream:** `affaan-m/everything-claude-code` (upstream)
**Managed by:** `fsun_config/ecc.js` + `fsun_config/manifest.json`

---

## Git Setup

```
origin   → https://github.com/eliteGoblin/everything-claude-code.git  (your fork)
upstream → https://github.com/affaan-m/everything-claude-code.git     (original)
```

### Clone on a new machine
```bash
git clone https://github.com/eliteGoblin/everything-claude-code.git ~/devel/everything-claude-code
cd ~/devel/everything-claude-code
git remote add upstream https://github.com/affaan-m/everything-claude-code.git
npm install
node fsun_config/ecc.js sync            # install to ~/.claude/
node fsun_config/ecc.js agents --opus   # upgrade agents
```

### Sync upstream changes
```bash
git fetch upstream
git merge --no-ff upstream/main         # merge latest upstream into your fork
# Only conflict is usually yarn.lock (generated):
git checkout upstream/main -- yarn.lock && git add yarn.lock
git commit --no-edit                    # finish the merge
node fsun_config/ecc.js ls 2>&1 | tail -1   # see tracked counts
node fsun_config/ecc.js sync            # apply latest picked files to ~/.claude/
node fsun_config/ecc.js agents --opus   # re-upgrade agents after sync
git push origin main                    # fast-forward, NO force needed
```

> Merge (not rebase): this fork's history already contains merge commits, and
> upstream has no `fsun_config/`, so a merge is conflict-free except the
> generated `yarn.lock`. No history rewrite, no force-push, fully reversible.
> If a sync ever needs `--force`, stop and investigate — it means the local
> checkout was stale (see the reconciliation note below).

### Push your changes
```bash
git add fsun_config/
git commit -m "feat: update ecc config"
git push origin main
```

---

## What's Installed (70 files, pruned from 421)

### Rules (23 files) — loaded into EVERY conversation

These are the most impactful files. Claude reads all of them as system context.

| Directory | Files | What it does |
|-----------|-------|-------------|
| `rules/common/` | 10 | Coding style, testing, git workflow, patterns, performance, security, agents, code-review, dev-workflow, hooks |
| `rules/typescript/` | 5 | JS/TS coding style, patterns, testing (Playwright), security, hooks (Prettier, tsc) |
| `rules/web/` | 7 | Frontend coding style, design quality, patterns, performance, security, testing, hooks |

### Agents (13 files) — on-demand, invoked by Claude when delegating

| Agent | Purpose |
|-------|---------|
| `architect` | System design and architecture |
| `build-error-resolver` | Auto-fix build errors |
| `code-reviewer` | Code quality and security review |
| `database-reviewer` | Database/query review |
| `doc-updater` | Auto-update docs |
| `docs-lookup` | Search documentation |
| `e2e-runner` | Playwright E2E testing |
| `performance-optimizer` | Performance analysis |
| `planner` | Implementation planning |
| `refactor-cleaner` | Dead code cleanup |
| `security-reviewer` | Security vulnerability analysis |
| `tdd-guide` | TDD workflow guidance |
| `typescript-reviewer` | JS/TS specific code review |

### Commands (22 slash commands) — type `/command` in Claude Code

**Daily workflow:**
- `/tdd` — TDD loop (red/green/refactor)
- `/build-fix` — Auto-resolve build errors
- `/code-review` — Structured code review (local or PR)
- `/plan` — Implementation planning
- `/e2e` — Generate/run Playwright E2E tests
- `/verify` — Run verification loop
- `/test-coverage` — Check test coverage

**Session management:**
- `/save-session` — Save current session state
- `/resume-session` — Restore previous session
- `/sessions` — List saved sessions; **`/sessions load <id>` is context-rich by default** (overlay; see `docs/sessions-extended.md`)
- `/sessions merge <id>` — Consolidate sibling .tmp files (overlay)
- `/done` — Append session summary to project CLAUDE.md (custom)

**Maintenance:**
- `/learn` — Extract patterns from session into skills
- `/eval` — Run evaluation harness
- `/quality-gate` — Quality gate checks
- `/refactor-clean` — Clean up dead code
- `/update-docs` — Update documentation
- `/update-codemaps` — Update code maps
- `/checkpoint` — Create checkpoint commit
- `/prune` — Prune unused code
- `/docs` — Documentation commands
- `/aside` — Side task without losing context
- `/setup-pm` — Configure package manager
- `/jira` — Jira integration

### Skills (10 directories) — on-demand knowledge loaded when relevant

| Skill | What it provides |
|-------|-----------------|
| `api-design` | REST API design patterns |
| `backend-patterns` | Express/Next.js backend architecture, middleware, caching, auth |
| `coding-standards` | Universal JS/TS best practices, naming, immutability |
| `continuous-learning` | Auto-extract patterns from sessions |
| `e2e-testing` | Playwright patterns, Page Object Model, CI integration |
| `frontend-patterns` | React/Next.js components, hooks, state, performance |
| `mcp-server-patterns` | MCP server development patterns |
| `nestjs-patterns` | NestJS modules, controllers, providers, DTOs |
| `tdd-workflow` | TDD cycle, coverage thresholds, mocking patterns |
| `verification-loop` | Continuous verification for code quality |

---

## How It Works

### Rules (always-on)
Markdown files in `~/.claude/rules/`. Claude Code loads ALL of them as system context in every conversation. This is why we pruned aggressively — every rule file costs context tokens.

### Commands (user-invoked)
Markdown files in `~/.claude/commands/`. Each file becomes a `/slash-command`. The markdown content is the prompt. Zero cost until you invoke them.

### Agents (auto-delegated)
Markdown files in `~/.claude/agents/` with YAML frontmatter (name, tools, model). Claude delegates to them when appropriate. Zero cost until invoked.

### Skills (context-triggered)
Markdown files in `~/.claude/skills/*/SKILL.md`. Loaded when Claude detects relevance to current task. Low cost — only loaded on-demand.

---

## How to Verify It's Working

```bash
# 1. Check rules are loaded — start a new Claude Code session and ask:
#    "what rules are you following?"
#    Claude should mention coding style, testing, TypeScript patterns, etc.

# 2. Test slash commands — type / and check autocomplete:
#    /tdd          — should show TDD workflow
#    /build-fix    — should show build fix workflow
#    /code-review  — should show review workflow
#    /plan         — should show planning workflow

# 3. Test an agent — ask Claude to review a file:
#    "review this file for issues"
#    Should invoke typescript-reviewer or code-reviewer agent

# 4. Test a skill — write some code and see if Claude follows patterns:
#    "create a REST API endpoint"
#    Should follow api-design and backend-patterns skill conventions

# 5. Verify file counts match expectations:
find ~/.claude/rules -type f | wc -l      # expect: 23
find ~/.claude/agents -type f | wc -l     # expect: 13
find ~/.claude/commands -type f | wc -l   # expect: 22
find ~/.claude/skills -type f | wc -l     # expect: 12
```

---

## Tool: `fsun_config/ecc.js`

```bash
node fsun_config/ecc.js pick <path>      # cherry-pick upstream files/dirs
node fsun_config/ecc.js unpick <path>    # remove tracked files
node fsun_config/ecc.js sync             # copy ALL tracked files to ~/.claude/
node fsun_config/ecc.js diff             # show upstream changes after git pull
node fsun_config/ecc.js ls               # list what you're tracking
node fsun_config/ecc.js ls upstream      # browse all available upstream files
node fsun_config/ecc.js bible ls         # list claude-bible skills (* = tracked)
node fsun_config/ecc.js bible pick <p>   # cherry-pick a claude-bible skill
node fsun_config/ecc.js bible unpick <p> # stop tracking a claude-bible skill
node fsun_config/ecc.js bible update     # git pull the claude-bible repo
node fsun_config/ecc.js agents           # list agent models
node fsun_config/ecc.js agents --opus    # upgrade all agents to opus
node fsun_config/ecc.js own <path>       # create your own custom file
node fsun_config/ecc.js status           # verify installed matches tracked
```

## Three Sources, One Install Target

`ecc.js sync` copies from three independent sources into `~/.claude/`:

| Source | Origin | Tracked in manifest as | How to add |
|--------|--------|------------------------|------------|
| **upstream** | the ECC fork repo (`affaan-m` via your fork) | `upstream[]` | `ecc.js pick <path>` |
| **bible** | `forrestchang/andrej-karpathy-skills` cloned at `~/claude-bible` (override via `CLAUDE_BIBLE_DIR`) | `bible[]` | `ecc.js bible pick <path>` |
| **custom** | `fsun_config/custom/` — your own rules/skills/commands/agents | `custom[]` | `ecc.js own <path>` |

- **upstream** updates via `git fetch upstream && git merge --no-ff upstream/main`.
- **bible** is an *available mechanism* (`ecc.js bible …`) for browsing/pulling
  `~/claude-bible`, but nothing is tracked from it now. The karpathy guidance is
  carried by the always-on rule `custom/rules/common/behavioral-guidelines.md`
  (not as a skill). To pull the upstream karpathy skill again if ever wanted:
  `ecc.js bible pick skills/karpathy-guidelines/ && ecc.js sync`.
- **custom** is yours — edit files under `fsun_config/custom/` directly.
- Everything is committed to your fork, so a fresh machine needs **only this
  one clone** + `ecc.js sync` (no separate ~/claude-bible clone required).

```text
SOURCES                         TRACKED            INSTALLED
ECC fork repo  ──pick──┐
~/claude-bible ──bible─┼── manifest.json ──sync──> ~/.claude/
fsun_config/custom ────┘
```

---

## How to Add More Later

### Add Go support
```bash
node fsun_config/ecc.js pick rules/golang/
node fsun_config/ecc.js pick agents/go-reviewer.md agents/go-build-resolver.md
node fsun_config/ecc.js pick commands/go-build.md commands/go-review.md commands/go-test.md
node fsun_config/ecc.js pick skills/golang-patterns/ skills/golang-testing/
node fsun_config/ecc.js sync
```

### Add Python support
```bash
node fsun_config/ecc.js pick rules/python/
node fsun_config/ecc.js pick agents/python-reviewer.md
node fsun_config/ecc.js pick commands/python-review.md
node fsun_config/ecc.js pick skills/python-patterns/ skills/python-testing/
node fsun_config/ecc.js sync
```

### Add any file
```bash
node fsun_config/ecc.js ls upstream               # browse all
node fsun_config/ecc.js pick skills/docker-patterns/  # add one
node fsun_config/ecc.js sync
```

### Create your own
```bash
node fsun_config/ecc.js own rules/frank/node-prefs.md   # creates template
# edit fsun_config/custom/rules/frank/node-prefs.md
node fsun_config/ecc.js sync                             # installs it
```

### Pull upstream + review
```bash
cd ~/devel/everything-claude-code
git pull
node fsun_config/ecc.js diff    # what changed in YOUR files?
node fsun_config/ecc.js sync    # apply updates
```

### Remove something
```bash
node fsun_config/ecc.js unpick rules/web/   # removes from manifest + ~/.claude/
```

---

## Agents (all upgraded to opus)

All agents now run on opus (Max sub). To check/change:
```bash
node fsun_config/ecc.js agents             # list current models
node fsun_config/ecc.js agents --opus      # upgrade all to opus
```

Note: `sync` will overwrite agent files from upstream (which use sonnet).
After sync, run `agents --opus` again. Or override: future TODO.

---

---

## How to Remove Everything

```bash
# Remove only the files listed in manifest
rm -rf ~/.claude/rules ~/.claude/agents ~/.claude/commands ~/.claude/skills
# Also remove ECC infrastructure (hooks, scripts, plugins, etc.)
rm -rf ~/.claude/hooks/hooks.json ~/.claude/scripts ~/.claude/.agents
rm -rf ~/.claude/.claude-plugin ~/.claude/mcp-configs ~/.claude/AGENTS.md
rm -rf ~/.claude/ecc
```

---

## Files NOT Installed (by choice)
- **Go** — not needed yet, ready to enable
- **Python** — not needed yet, ready to enable
- **Security module** — not needed for personal dev
- **Rust/Java/Kotlin/C++/C#/Swift/Perl/PHP** — unused languages
- **Orchestration** — tmux/worktree multi-agent workflows
- **Business/content** — article writing, investor materials, market research
- **Social/media** — crosspost, video editing, social distribution
- **Research** — deep research, exa search
- **Niche ECC internals** — harness optimizer, loop operator, instinct system

---

## File Layout

```
fsun_config/
  manifest.json          # source of truth — what files to install
  sync.js                # sync tool — copies manifest files to ~/.claude/
  .sync-state.json       # auto-generated — tracks file hashes for diff
  overrides/             # your customized versions of upstream files
  ecc-install.json       # original ECC installer config (kept for reference)
  SUMMARY.md             # this file
```
