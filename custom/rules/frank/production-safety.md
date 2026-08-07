# Production Safety

> Custom always-on rule. Highest priority — overrides upstream rules on conflict.
> Lives in `fsun_config/custom/rules/frank/production-safety.md`, installs to
> `~/.claude/rules/frank/production-safety.md` via `ecc.js sync`.

## Default assumption

**If the environment is not explicitly stated, assume it is production.**

- Treat any unlabelled target (DB, cluster, project, account, host, deploy)
  as prod until I tell you otherwise.
- Only treat a target as non-prod when I have explicitly said "dev", "local",
  "staging", "test", "sandbox", or pointed at an obviously local resource
  (`localhost`, `127.0.0.1`, a docker-compose service, a throwaway tmp path).
- Names like `app-db`, `cluster-1`, `main`, `default` are **not** signals of
  non-prod. They are unlabelled → assume prod.
- If I gave one signal earlier in the session and the current target is
  different or ambiguous, re-confirm. Do not extrapolate "we were in dev five
  steps ago, so this must also be dev".

## Signals to read before touching anything

Before any action that changes remote state, scan for these and state what
you see:

- Env vars: `AWS_PROFILE`, `AWS_ACCOUNT`, `KUBECONFIG`, `KUBE_CONTEXT`,
  `GCP_PROJECT`, `DATABASE_URL`, `NODE_ENV`, `RAILS_ENV`, `ENV`, `STAGE`.
- File context: `.env*`, `terraform.tfvars`, `kubeconfig`, `helmfile.yaml`,
  workspace name, current git branch.
- CLI target: which DB host, which cluster, which cloud account, which
  bucket, which region.
- Command shape: anything containing `prod`, `production`, `live`, an
  account ID I have flagged as prod, or a domain matching a prod hostname.

If any of these are missing or ambiguous, **ask before acting**. Do not
guess.

## Always pause and confirm — even if "auto" mode is on

Stop and get explicit confirmation from me before running any of:

- **Data deletion / mutation at scale**: `DELETE FROM`, `TRUNCATE`,
  `DROP TABLE`, `DROP DATABASE`, `DROP SCHEMA`, mass `UPDATE` without a
  narrowly scoped `WHERE`, `redis FLUSHDB`/`FLUSHALL`, S3 object delete,
  bucket lifecycle changes.
- **Schema / migration**: running migrations, `ALTER TABLE`, index
  rebuilds, anything that locks a hot table, anything not reversible by a
  follow-up migration.
- **Infrastructure destruction**: `terraform destroy`, `terraform apply`
  against a prod workspace, `pulumi destroy`, `cdk destroy`, deleting a
  cloud resource (RDS, bucket, VPC, load balancer, DNS record, IAM role,
  KMS key, secret).
- **Cluster ops**: `kubectl delete`, `helm uninstall`, scaling to zero,
  changing a StatefulSet's storage, draining a node, switching contexts to
  prod, applying manifests to a prod context.
- **Cloud-provider deletes**: `aws … delete-*`, `aws s3 rm --recursive`,
  `gcloud … delete`, `az … delete`, anything that empties a queue/topic.
- **Auth / access changes**: rotating prod secrets, IAM policy changes,
  RBAC changes, opening security groups, changing prod login.
- **Filesystem destruction on a server you don't own**: `rm -rf`, `find
  … -delete` against anything not a local scratch dir.
- **Outbound side effects**: sending real emails / SMS / webhooks /
  payment calls, posting to Slack/Discord channels visible to others,
  publishing a package or release.
- **Git on shared branches**: force-push to `main`/`master`/`release/*`,
  `reset --hard` of a shared branch, deleting a remote branch I haven't
  asked you to delete, amending an already-pushed commit.

For each, state: **what** you're about to run, **where** (env + target),
**why**, and **what's not reversible**. Then wait. Don't proceed on
silence — only on an explicit "yes".

## No undiscussed prod changes

Even non-destructive prod changes (config edits, deploys, feature-flag
flips, cron toggles, CDN purges) require:

1. A stated intent: what is changing and the expected effect.
2. A stated rollback: how to undo it, and how long undo takes.
3. My explicit go-ahead in this session.

Do not "drift" into a prod change by following an apparently logical next
step. If a workflow naturally ends at "and now apply this in prod", stop
at the boundary and surface the decision.

## When something looks wrong in prod

- Do **not** "fix it quickly" by mutating prod state. Surface what you
  see, propose options, wait.
- Read-only investigation (logs, metrics, `SELECT`, `kubectl get`,
  `describe`) is fine and encouraged.
- Don't restart, redeploy, scale, or evict to "see if it helps".

## Local / dev work — what's NOT covered by this rule

Once I have explicitly said an environment is local or dev (or you can
see it's `localhost` / docker-compose / a personal scratch repo), this
rule relaxes back to normal working speed. The point is to be careful
where it matters, not to add friction to everything.

## Definition of done — prod-touching task

- [ ] Environment was confirmed (or I explicitly said it was prod).
- [ ] Destructive/irreversible steps were each confirmed individually.
- [ ] A rollback path exists and was stated before applying.
- [ ] What ran, where, and the outcome is summarised back to me.
