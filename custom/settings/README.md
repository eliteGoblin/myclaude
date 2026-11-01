# Settings fragments

Each `*.json` file here is a partial `settings.json` object. `node myclaude.js sync` deep-merges them into `~/.claude/settings.json`; `unpick settings/<file>.json` removes exactly the leaves a fragment owns. Keys not named by any fragment (`model`, `env`, `tui`, `defaultMode`, ...) are never touched.

| File | Owns | Purpose |
|---|---|---|
| `attribution.json` | `attribution.{commit,pr,sessionUrl}` | No AI attribution in commits, PRs, or session links (corporate artifacts under Frank's name). |
| `hooks.json` | `hooks.Stop`, `hooks.SessionStart` | The two session-system hooks: save gate on stop, alias hint on start (10s timeouts). |
| `pretooluse-guards.json` | `hooks.PreToolUse` | Two deterministic Bash guards (require `jq`): hard block on `rm` with recursive+force in any flag spelling or order; `ask` on destructive SQL/redis statement text (`DROP TABLE`, `TRUNCATE`, `DELETE FROM`, `ALTER TABLE`, `FLUSHALL/DB`). Backstop for shapes prefix patterns cannot see (flag reordering, SQL inside `psql -c`). |
| `plugins.json` | `enabledPlugins` | `pyright-lsp` from the official marketplace. |
| `output-style.json` | `outputStyle` | `Concise`: lead with the result, skip preamble; error reports and destructive-action confirmations stay complete. Takes effect after `/clear`. |
| `permissions.json` | `permissions.deny`, `permissions.ask` | Harness-enforced form of `rules/frank/production-safety.md`. See the groups below. |

## permissions.json groups

`ask` forces a permission prompt even in auto mode. `deny` is a hard block. Frank's decision (2026-08-23): use `ask` everywhere, `deny` only for credential directories.

| Group | Rules | Why |
|---|---|---|
| Credential files (deny) | `Read`/`Edit` of `~/.ssh`, `~/.aws`, `~/.kube`, `~/.config/gh` | Never wanted in any session. |
| Filesystem deletion | `rm -rf`, `rm -fr`, `rm -r`, `find -delete`, `find -exec rm` | Ask, not deny: nonprod scratch cleanup is legitimate. The pretooluse-guards hook additionally hard-blocks recursive+force `rm` in any flag order. |
| Git on shared branches | force-push (5 spellings, incl. trailing `-f`), remote branch delete (3 spellings, incl. `git push --delete`), `reset --hard`, `branch -D` | production-safety "Git on shared branches". |
| Infrastructure apply/destroy | `terraform`, `tofu`, `pulumi`, `cdk` apply/destroy/up/deploy; bare `terraform destroy` | Irreversible or prod-touching by default. |
| Cluster ops | `kubectl delete/drain/scale/config use-context`, `kubectl * delete` (catches `-n foo delete`), `helm uninstall`, `helm delete` | production-safety "Cluster ops". `kubectl apply`, `helm upgrade` are left to the prose rule because they are routine in nonprod. |
| Cloud deletes, IAM, secrets | `gcloud/aws/az ... delete`, `gcloud iam/secrets`, `gcloud * add/remove-iam-policy-binding`, `aws iam/secretsmanager` (also with a leading `--profile`), `gsutil rm`, `aws s3 rm` (also with `--profile`), `aws sqs purge-queue` | production-safety "Cloud-provider deletes" and "Auth / access changes". |
| Database and cache CLIs | `psql`, `bq query`, `bq rm`, `mysql`, `redis-cli` | Any statement can be destructive; the prose rule still governs SQL text. |
| Publishing | `npm publish`, `gh release create`, `twine upload` | Outbound side effects. |

Skipped on purpose: `curl`/`wget` ask (prompt frequency too high; an allow rule cannot override an ask for the same command) and the kube "current context contains prod" heuristic hook (prose stays).

## Verified matcher behavior (headless probe, 2026-08-24)

Mid-string wildcards in Bash rules match. Probe: headless `claude -p` with a throwaway `--settings` file, `allow: Bash(gcloud *)` plus the mid-string rule `Bash(gcloud * delete *)` as `ask` in one run and as `deny` in another, against the harmless command `gcloud components delete --help`. Both the `ask` and the `deny` run blocked the command (two denial records each, including the piped variant `... 2>&1 | head -n 1` — compound-command splitting also works); the allow-only control run executed it. Headless `ask` denies instead of prompting, as documented. Conclusion: the `gcloud/aws/az * delete` gates and the `git push * --force` spellings are live rules, not dead patterns. Limits: the docs still call argument-constraining Bash patterns fragile (flag reordering, wrappers, `bash -c`, script files), so the prose rule and the `pretooluse-guards.json` hooks remain the backstop; `find -exec/-delete` ask-side matching stays unverified.
