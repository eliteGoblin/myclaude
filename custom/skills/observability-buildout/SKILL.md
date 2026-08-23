---
name: observability-buildout
description: |
  Methodology for building monitoring + alerting for a service from scratch.
  Covers SRE principles (provider-agnostic) plus concrete GCP Cloud Monitoring
  implementation. Codifies the AIP-604 call-summary-agent rollout — design doc
  → app instrumentation → IaC → e2e verification matrix → log-injection test.
  Use when designing or reviewing observability for any service. Pairs with
  the `observability-architect` agent for the orchestrated workflow.
license: MIT
---

# Observability Buildout

Methodology for adding monitoring + alerting + dashboarding to a service. The
goal: ship observability you can **trust**, not just "we have alerts now".

Two layers in this skill:
- **Part 1 — SRE principles**: provider-agnostic decisions that apply whether
  you're on GCP, AWS, Datadog, Prometheus, etc.
- **Part 2 — GCP Cloud Monitoring concrete impl**: Terraform resources,
  gcloud commands, REST endpoints, the verification matrix.

Reference implementation: [`call_summary_agent` AIP-604 rollout](https://github.com/Creditcorp-Group/call_summary_agent) — see `docs/design-monitoring.md` in that repo as the canonical example.

---

## When to use this skill

- A new service is shipping and needs monitoring before traffic flows.
- An existing service has "monitoring" that's actually console clicks — needs codification.
- Adding alerts to a service and wanting to make sure they actually fire.
- Reviewing someone else's monitoring PR.

## When NOT to use it

- The service is one-off / throwaway. The buildout cost exceeds the value.
- You already have a working monitoring system and want to add **one** alert. This skill is for the buildout; for incremental additions, just follow the existing patterns.

---

## Part 1 — SRE principles (provider-agnostic)

### 1. Codify everything in IaC

Alerts, metrics, dashboards, notification channels — all in code (Terraform / CDK / Pulumi / Datadog provider / etc.). **No console clicks**. The console is fine for *exploration*; it's not fine for state.

**Why:** state in the console drifts silently. Terraform shows the diff every plan; the console shows nothing until you go look.

### 2. Two-PR structure: app side, then infra side

- **PR-A**: app-side instrumentation — structured logging fields that produce metric-extractable events. Unit tests asserting the emission shape.
- **PR-B**: infra — metrics, alert policies, dashboards, notification channels. Operator runbook.

**Why split:** the app change can ship + bake before the infra references it. Reviewers can focus on one concern per PR. Easier rollback if something's wrong.

### 3. Each PR through review process

Both PR-A and PR-B:
1. Open
2. **Architect** review (separately)
3. **Code reviewer** review (separately)
4. Address findings in fixup commits
5. **Re-review final state** (Frank's rule: code-reviewer on final pushed PR state)
6. CI green
7. Merge

Don't skip steps. Skipping leads to "I thought you reviewed it" gaps.

### 4. Apply to non-prod first; prod blocked on explicit authorization

`make tf-apply-dev` → verify end-to-end → human OK → `make tf-apply-prod`. Apply to prod **never** happens implicitly from a merge to main without a separate human action.

### 5. Mix built-in + log-based metrics

| Concern | Use |
|---|---|
| HTTP-layer (5xx, latency, instance count) | Built-in cloud metrics (survives container crash; ~1-min freshness; no extra cost) |
| App-internal states (resource-unavailable, code crashes invisible to HTTP) | Log-based metrics from structured logs the app emits |

Built-in metrics are comprehensive but blind to app-level intent. Log-based metrics know intent but are silent if the app never starts.

### 6. Bias under-alert > spam

First-pass thresholds are intentionally **high**. Document a tuning plan for when to ratchet down (typically: after 7 days of real production traffic baseline).

**Why:** an alert that fires constantly trains people to ignore alerts. Better to under-alert and learn what actual high-impact looks like.

### 7. Architectural decisions, recorded

Every monitoring design has these decisions. Record them explicitly:

- **Merge vs separate metrics** — if two failure modes need different operator response, they're different alerts. Don't collapse them to save a Terraform resource.
- **Severity tiers** — Critical pages someone; Warning is for next-business-day. Most alerts are Warning.
- **Notification channels** — start simple (one email). Scale to Slack / PagerDuty when scope demands. Adding channels later is cheap; cleaning up a noisy 5-channel routing is expensive.
- **Cardinality discipline** — no per-IP / per-user / per-request-id labels on metrics. Unbounded cardinality kills Cloud Monitoring and costs real money.

### 8. End-to-end verification matrix (5 categories)

ALL via API/CLI — no email-confirmation HITL:

1. **Inventory** — do all declared resources exist? Count check.
2. **Filter correctness** — does each filter return real series against current data (or correctly empty)?
3. **Live data flow** — when an event fires, does the metric increment with right labels?
4. **Alert firing end-to-end** — trigger a real condition crossing; confirm incident OPENs via API.
5. **Dashboard widget queries** — every widget's query executes without API error.

See Part 2 §B for the exact commands per category.

### 9. Log injection for synthetic verification

The "no app crash needed" test for log-based metric pipelines. Fire fake structured logs via the platform's log-write API (e.g. `entries.write` on GCP, `PutLogEvents` on AWS). The metric counts them. The alert fires.

**Why:** you can verify the entire chain without breaking the app. Repeatable as a regression test whenever alert config changes.

**Codify this** — commit a script (`scripts/admin/fire_fake_logs.py` or equivalent) so anyone can re-run.

### 10. API-first verification — avoid HITL email confirmation

When an alert fires, the GUI / inbox path shows it. But the API also shows it: `gcloud beta monitoring alerts list` (GCP), `DescribeAlarms` (AWS), `monitor.get` (Datadog). Use the API. Email is a slow + brittle verifier.

### 11. Bug-during-apply pattern

Plan for at least one fix PR after the first `terraform apply`. Provider schemas accept things the API rejects. `terraform validate` doesn't catch everything.

Real example: GCP's `XyChart.Threshold` schema accepts `color` and `direction` fields; the API rejects them with HTTP 400. Caught only on apply.

---

## Part 2 — GCP Cloud Monitoring concrete impl

### A. Resources you'll create

| Terraform resource | Purpose | Count typical |
|---|---|---|
| `google_logging_metric` | Counter / distribution from structured logs | 3-5 |
| `google_monitoring_notification_channel` | Email / Slack / PagerDuty target | 1-3 (per env) |
| `google_monitoring_alert_policy` | Threshold + filter + duration + channels | 5-12 |
| `google_monitoring_dashboard` | Mosaic-layout JSON via `jsonencode` | 1 |

### B. Verification matrix — exact gcloud / REST commands

Set once: `P=<project_id>; SVC=<service_name>; TOK=$(gcloud auth print-access-token)`

#### Cat 1 — Inventory

```bash
gcloud alpha monitoring channels list --project=$P
gcloud alpha monitoring policies list --project=$P --format='value(displayName)'
gcloud logging metrics list --project=$P --format='value(name)'
gcloud monitoring dashboards list --project=$P --format='value(displayName)'
```

Expected: counts match Terraform declaration.

#### Cat 2 — Filter correctness

```bash
START=$(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)

curl -sS -G -H "Authorization: Bearer $TOK" \
  --data-urlencode 'filter=resource.type="cloud_run_revision" AND ...' \
  --data-urlencode "interval.startTime=$START" \
  --data-urlencode "interval.endTime=$END" \
  "https://monitoring.googleapis.com/v3/projects/$P/timeSeries"
```

Run for each alert's filter. Expected: non-error response (data or correctly empty).

#### Cat 3 — Live data flow

Generate one real event (e.g. `curl /generateContent`). Wait 60-90s. Re-query the metric. Expected: count incremented by 1, labels correct.

#### Cat 4 — Alert firing end-to-end

Trigger a real threshold crossing. For a 401-burst alert:

```bash
for i in $(seq 1 360); do
  curl -sS -o /dev/null -H "Authorization: Bearer bogus" "$URL/health"
  sleep 1
done
# Wait ~5 min (alert evaluator latency + alignment_period)
gcloud beta monitoring alerts list --project=$P
# Expected: incident with state=OPEN against the right policy
```

#### Cat 5 — Dashboard widget queries

```bash
DASH_ID=$(gcloud monitoring dashboards list --project=$P --filter='displayName:"<your dashboard name>"' --format='value(name)')
gcloud monitoring dashboards describe $DASH_ID --project=$P --format=json | \
  python3 -c "<extract widget filters, run each via timeSeries API, fail on any error>"
```

Expected: every widget filter runs without HTTP 400/403.

### C. Log-injection script template

See `call_summary_agent/scripts/admin/fire_fake_logs.py` for a working example. Pattern:

1. Get OAuth token: `gcloud auth print-access-token`
2. Build entries matching the metric filter (`resource.type`, `service_name`, `jsonPayload.event` field)
3. Add `test_marker` field to `jsonPayload` so a human can grep "this is a test"
4. POST to `https://logging.googleapis.com/v2/entries:write`
5. Wait 75s for metric ingest
6. Query via `gcloud beta monitoring alerts list` to confirm the alert fired

Both AWS (`PutLogEvents` API) and Datadog (`v1/input/<api-key>`) have equivalent endpoints — same pattern.

### D. The provider-vs-API gotchas

Real ones encountered in AIP-604:

| Symptom | Cause | Fix |
|---|---|---|
| `terraform apply` returns 400 on dashboard create | `XyChart.Threshold` schema accepts `color`+`direction` but API rejects | Strip to `value`+`label`+`targetAxis` |
| `monitoring.googleapis.com/v3/.../dashboards/<id>` GET returns 403 PERMISSION_DENIED via REST | User token needs `X-Goog-User-Project` header + `serviceusage.serviceUsageConsumer` role | Use `gcloud monitoring dashboards describe` (different auth path) |
| Log-based metric stays at 0 despite log entries existing | Python `logging.basicConfig` default format prefixes the JSON ("ERROR:foo:") → Cloud Run agent puts in `textPayload` not `jsonPayload` | Set `format="%(message)s"` so emitted lines are pure JSON |
| `gcloud monitoring policies list` warns about filter operator changing | gcloud's `--filter` syntax in transition | Use `--format='value(...)'` + grep, or REST API directly |
| Vertex AI `response_code` label values | HTTP-numeric-as-string (`"200"`, `"429"`), NOT symbolic (`"RESOURCE_EXHAUSTED"`) | Filter on `metric.labels.response_code="429"`, not `="RESOURCE_EXHAUSTED"` |

---

## Part 3 — Review checks (the observability-architect's checklist)

These five checks catch the classes of bugs that bit AIP-604. The
`observability-architect` agent runs all of them; a human reviewer should too.

### CHK-1: Cross-source agreement

**When two panels measure the "same concept" via different metric sources**, do they agree in a clean window?

- Run a controlled small burst (N=10 requests).
- Wait for ingest (60-90s).
- Query both sources via API in the same window.
- Expected: counts within ±20%, or strictly equal if both count the same scope.
- Failure mode this catches: filter typo on the log-based metric; emission path broken; lifecycle gap.

**Tagging convention:** label widgets with `semantic_id` in their description. Two widgets with the same `semantic_id` MUST pass this check.

### CHK-2: Lifecycle annotation on log-based metrics

**Every log-based metric should be annotated with when it started counting** (i.e. when the emitting code shipped). The dashboard should render a vertical line at that timestamp on any panel using the metric.

- Concrete: every `google_logging_metric` carries a `created_at = "<ISO8601>"` description tag.
- The dashboard's panel description includes "data since <created_at>".
- Operators looking at "last 7 days" see the cliff and don't think it's broken.

### CHK-3: Scope-explicit panel titles

**Title format:** `<verb> <scope> [<source-class>]`

Where `source-class` ∈ {`platform`, `app-log`}:
- `platform` = built-in cloud metric (Cloud Run, CloudWatch, Vertex, etc.) — comprehensive, no app cooperation
- `app-log` = log-based metric from app's structured events — only counts what the app emits

Bad: "Success rate by channel"
Good: "Successful /generateContent rate by channel (app-log, since 2026-05-20)"

### CHK-4: Low-data vs broken-metric distinguisher

When a panel shows surprisingly low data, distinguish:

1. **Metric broken**: filter typo, log entry never emitted, label extractor wrong. Query the metric directly via timeSeries API for last 7d — if zero everywhere, it's broken.
2. **Lifecycle gap**: metric started counting after the window's start. Query in a window AFTER the metric's `created_at` — if non-zero there but zero before, it's lifecycle.
3. **Scope difference**: metric measures a narrower thing than the peer panel. Cross-source agreement (CHK-1) reveals this.
4. **Real low traffic**: the system genuinely isn't doing much.

Surface verdict explicitly. Don't leave the operator to guess.

### CHK-5: Simplest viable automated check (the catch-all)

For each widget: compute 24h sum from the live API. Flag any widget where `24h_sum < 0.1 × dashboard_median_24h_sum`. Output: "Widget X has 24h volume 47, dashboard median 1,840. Reason: [new-metric|filter-mismatch|low-cardinality|real]?" — force the author to annotate `low_volume_reason` in the panel description.

Cheap to compute. Catches most "panel is broken / scope-different" cases without requiring an operator to manually notice.

---

## Templates (paste-and-edit)

### Design doc skeleton — `docs/design-monitoring.md`

```
# Monitoring + alerting — system reference

**JIRA:** <ticket-link>
**Status:** <env-by-env state>
**Operator runbook:** docs/runbook.md

## 1. Overview
<one paragraph + what's deployed>

## 2. Inventory
<resources actually live>

## 3. Alert catalog
<table: # | source | threshold | severity | resource_name>

## 4. Log-based metric catalog
<table: name | filter | labels | purpose>

## 5. Dashboard
<layout + widget list>

## 6. Architecture decisions
<numbered, each section explains a non-obvious choice>

## 7. Verification commands
<exact CLI to re-run the matrix>

## 8. Tuning guide
<when to lower thresholds>

## 9. Out of scope (deliberately)

## 10. History
<dated changes>
```

### Runbook skeleton — `docs/runbook.md`

One paragraph per alert. Lead with what's wrong, then what to check, then what to do.

```
## Alert #1 — <metric> > <threshold> in <window> (<severity>)

<metric> rose above <threshold>. Most likely cause: <X>. **Action:** <inspect-Y>;
if <Z> then <do-W>, else <do-V>. Linked Cloud Console: <URL>.
```

### Test report skeleton — `tests/manual/<date>-<feature>-log-injection-verification.md`

Document the log-injection test as an evidence artifact:

```
# <feature> — log-based metric & alert verification

**Date:**  | **Target:**  | **Operator:**

## Test plan
<metric | threshold | events to inject | should fire?>

## Timeline + results
<table with timestamps + evidence>

## Pass criteria
<checkboxes>

## Findings
<what works, known limitations, architecture decisions verified>
```

---

## Reference: AIP-604 (call-summary-agent)

Worked example end-to-end:

- Design doc: `call_summary_agent/docs/design-monitoring.md`
- App side (PR-A): structured logging for 5 events (`request_complete`, `binding_fetch_failed`, etc.); unit tests assert emission shape
- Infra side (PR-B): 4 log-based metrics, 10 alert policies, 1 dashboard, 1 notification channel
- Bug-during-apply (PR #27): `XyChart.Threshold` `color`+`direction` rejected by API
- Phase A: log-injection test (`scripts/admin/fire_fake_logs.py` + report)
- Phase B: canonical doc rewrite + drop cold-start widget
- Phase D: scope-explicit panel renames after architect alignment review

The whole rollout is documented commit-by-commit on the `main` branch of that repo.

---

## See also

- Companion agent: `observability-architect` — orchestrates the buildout end-to-end, spawns sub-agents (architect / code-reviewer / e2e-runner) for reviews at each step.
- [`docs/runbook.md`](runbook.md) format in the call-summary-agent reference.
- The 5-category verification matrix template at `tests/manual/*-log-injection-verification.md`.
