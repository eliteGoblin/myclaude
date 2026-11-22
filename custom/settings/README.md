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

`scripts/hooks/env-guard-fsun.js` (rules: `env-guard-rules.json`) replaces the former `ask` list and SQL text hook. If the script, its rules, or `node` fail, the settings command emits `ask`.

| Environment | Data and database clients | Infrastructure, publishing, `git reset --hard`, recursive `rm`, other force pushes |
|---|---|---|
| `sandbox` (local list) | No prompt | No prompt |
| `nonprod` (local list) | Ask | No prompt |
| `prod` or unlabelled | Ask | Ask, unless the command or real kube or cloud state labels the target non-prod (unlabelled only) |

Outside a sandbox: `psql`, `mysql`, `redis-cli` and `bq query` ask on every call unless clearly aimed at a throwaway local target, and any command that contains destructive SQL or redis words asks, including one aimed at `localhost`. In every environment, a force push or delete of `main`, `master` or `release/*` asks, and a data or infrastructure command that names `prod`, `production` or `live` asks.

Only the machine-local, uncommitted `~/.claude/environments.local.json` (`{"/abs/path": "sandbox"}`) can declare `sandbox` or `nonprod`. A repo's `.claude/environment` can only tighten, by declaring `prod`; `.terraform/environment` can also only tighten. The environment is the strictest among the hook's `cwd` and every directory the command enters.

Limits: a script file run by name is not inspected; in a sandbox, `localhost` can be a tunnel to a remote database.
