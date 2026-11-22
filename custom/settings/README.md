# Settings fragments

Each `*.json` file here is a partial `settings.json` object. `node myclaude.js sync` deep-merges them into `~/.claude/settings.json`; `unpick settings/<file>.json` removes exactly the leaves a fragment owns. Keys not named by any fragment (`model`, `env`, `tui`, `defaultMode`, ...) are never touched.

| File | Owns | Purpose |
|---|---|---|
| `attribution.json` | `attribution.{commit,pr,sessionUrl}` | No AI attribution in commits, PRs, or session links (corporate artifacts under Frank's name). |
| `hooks.json` | `hooks.Stop`, `hooks.SessionStart` | The two session-system hooks: save gate on stop, alias hint on start (10s timeouts). |
| `pretooluse-guards.json` | `hooks.PreToolUse` | Hard block on `rm` with recursive+force (requires `jq`), and `scripts/hooks/env-guard-fsun.js`, which asks by environment. See "Environment guard". |
| `plugins.json` | `enabledPlugins` | `pyright-lsp` from the official marketplace. |
| `output-style.json` | `outputStyle` | `Concise`: lead with the result, skip preamble; error reports and destructive-action confirmations stay complete. Takes effect after `/clear`. |
| `statusline.json` | `statusLine` | Status line command `scripts/statusline-fsun.js`: one short line (model, ctx %, 5h %, week % with reset time) and the plan usage cache `~/.myclaude/usage-cache.json` that `myclaude usage` reads. |
| `permissions.json` | `permissions.deny` | Hard block on credential directories. |

## Environment guard

`scripts/hooks/env-guard-fsun.js` (rules: `env-guard-rules.json`) replaces the former `ask` list and SQL text hook. It parses the command, so SQL words in a heredoc, `echo`, or `grep` do not count.

| Class | Asks when |
|---|---|
| Data destruction: destructive SQL or redis sent to a client, storage deletes | Always, except a throwaway local target (`localhost`, `127.0.0.1`, a temp file) or a project listed as `sandbox` in the local list |
| Infrastructure, publishing, `git reset --hard`, recursive `rm`, force push to other branches | The project is `prod`, the command names `prod`, `production` or `live`, or the target is unlabelled |
| Force push or delete of `main`, `master`, `release/*` | Always |

A project declares itself in `.claude/environment` (`sandbox`, `nonprod` or `prod`; nearest parent wins; the home directory is ignored), or in the machine-local, uncommitted `~/.claude/environments.local.json` (`{"/abs/path": "sandbox"}`). If either says `prod`, the result is `prod`. Only the local list can turn off data prompts, because a cloned repo controls its own `.claude/environment`. On an internal error the guard asks, except in a declared sandbox.

Limits: a script file run by name is not inspected; `localhost` can be a tunnel to a remote database.
