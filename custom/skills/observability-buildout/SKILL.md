---
name: observability-buildout
description: Observability buildout and review for a service, OpenTelemetry-first and vendor-neutral (design doc, OTel instrumentation, Collector, SLOs with burn-rate alerts, observability as code, end-to-end verification). Use when designing, reviewing, or extending monitoring, alerting, observability, tracing, SLOs, dashboards, or OpenTelemetry for a service.
license: MIT
---

Sources: Frank's own method (written in eliteGoblin/everything-claude-code, moved to myclaude 2026-08-23, generalized and made vendor-neutral 2026-11-01). Best-practice claims checked 2026-11-01 against the primary sources in [References](#references).

# Observability Buildout

A method to add traces, metrics, logs, SLOs, alerts, and dashboards to a service. The goal is observability you can **trust**: every alert is proved to fire, and every dashboard query is proved to run.

Use it when a new service needs observability before traffic, when existing monitoring is console clicks, when you add alerts and must prove they fire, or when you review an observability PR. To add one alert to a working system, follow that system's existing pattern instead.

## Principles

1. **Design doc first.** Write `docs/design-observability.md` (skeleton below) before code. Record each decision: SLIs, SLOs, alert list, attributes, backend.
2. **OpenTelemetry first.** Instrument with the OpenTelemetry (OTel) SDK. Zero-code (auto) instrumentation covers libraries (HTTP, database, queue calls) but "your application's code, however, is not typically instrumented"; add code-based spans and metrics for the business logic [OTel-ZC].
3. **Three correlated signals.** Traces, metrics, and logs share one resource (`service.name`, `service.version`) and one trace context. Keep the existing logging library and attach an OTel log appender (bridge); then each log record carries `TraceId` and `SpanId` [OTel-LOGS]. In JSON logs that do not use OTLP, use the fields `trace_id`, `span_id`, `trace_flags` in lowercase hex [OTel-LTC].
4. **Semantic conventions for names.** Use OTel semantic conventions for span, metric, and attribute names [OTel-SC]. Example: HTTP server latency is the histogram `http.server.request.duration`, unit `s` [OTel-HTTP]. Do not put the unit in a metric name when the unit is in metadata [OTel-MET].
5. **Export through a Collector.** Services send OTLP to an OTel Collector; the Collector does batching, retries, filtering, and export to the backend. Sending directly to a backend is acceptable only for trials, small scale, or development [OTel-COL]. The backend is then a Collector config change, not an app change.
6. **Observability as code.** Collector config, SLOs, alert rules, dashboards, and notification routes live in IaC (Terraform, Pulumi, the vendor provider, or rule files in git). The console is for exploration, not for state: console state drifts and no plan shows the diff.
7. **App PR, then infra PR.** PR-A: instrumentation and tests that assert the emitted span, metric, and log shape. PR-B: Collector, SLOs, alerts, dashboards, runbook. PR-A ships and runs before PR-B references its signals. Each PR gets an architect review and a code review, then a review of the final pushed state, then green CI.
8. **Nonprod first; prod only on Frank's explicit go.** Apply to nonprod, run the verification matrix, then stop. Prod apply is a production-safety gate (`rules/frank/production-safety.md`); a merge to main never applies prod by itself.
9. **Fewer, actionable alerts.** Page only on user impact (symptoms), not on causes [SRE-MON]. "Every page should be actionable", urgent, and need intelligence [SRE-MON]; anything else is a ticket or a dashboard. Every alert links a runbook entry.
10. **Cardinality discipline.** Attribute values must come from a small, bounded set. Use `http.route`, never the raw URL path ("the URI path can NOT substitute it") [OTel-HTTP]. No user id, request id, IP, or free text on metrics; put those on spans or logs. The OTel SDK default cardinality limit is 2000 series per metric; more series go to an overflow series with `otel.metric.overflow=true` [OTel-SDK]. Treat that attribute in your data as a bug.

## SLIs, SLOs, and burn-rate alerts

**Choose SLIs.** An SLI is a ratio: good events divided by total events [SRE-SLO].

| Component type | Signals | Source |
|---|---|---|
| Request-driven service (API, RPC, queue consumer) | RED: Rate, Errors, Duration | [RED] |
| Resource (CPU, memory, disk, pool, queue) | USE: Utilization, Saturation, Errors, "for every resource" | [USE] |
| Whole service view | Four golden signals: latency, traffic, errors, saturation | [SRE-MON] |

Typical SLIs: availability = non-5xx requests / all requests; latency = requests faster than T / all requests. Build them from `http.server.request.duration` (count and buckets) so one metric gives rate, errors, and duration.

**Set SLOs and the error budget.** Error budget = 100% minus the SLO [SRE-SLO]. Write an error budget policy: what the team does when the budget is spent, and who decides [SRE-SLO]. Start from the current measured level, not from a wish.

**Alert on burn rate, with multiple windows.** Burn rate is how fast the budget is spent relative to the SLO period (burn rate 1 spends exactly the budget in the period). The starting point for a 99.9% SLO over 30 days [SRE-ALERT]:

| Budget consumed | Long window | Short window | Burn rate | Notification |
|---|---|---|---|---|
| 2% | 1 hour | 5 minutes | 14.4 | Page |
| 5% | 6 hours | 30 minutes | 6 | Page |
| 10% | 3 days | 6 hours | 1 | Ticket |

An alert fires only when **both** windows exceed the burn rate. Make the short window 1/12 of the long window [SRE-ALERT]; it fires only while the budget is still burning, and it stops the alert soon after the problem stops. Use threshold alerts only for conditions an SLO cannot see (for example, no data received, certificate expiry).

## Steps

Each step ends on its completion criterion.

1. **Design doc.** Done when the doc lists every SLI with its exact query, every SLO, every alert (signal, threshold, windows, severity, runbook link), the attribute list with bounded value sets, and the backend.
2. **PR-A, instrumentation.** OTel SDK plus zero-code instrumentation, resource attributes, log appender, business spans and metrics. Done when tests assert names, units, and attributes against the semantic conventions, and a local run shows one request as a trace with correlated logs.
3. **PR-B, pipeline and alerts.** Collector config, SLO and alert rules, dashboards, notification routes, runbook, all as code. Done when the plan shows only the expected creates, with 0 destroy and 0 replace.
4. **Nonprod apply and verification.** Run the matrix below. Done when every row has observed evidence. Expect at least one fix PR: provider schemas can accept fields the API rejects, and validation does not catch it.
5. **Prod.** Stop. Present the plan, the matrix evidence, and the rollback to Frank. Apply only on his explicit go, then run matrix rows 1, 2, and 5 on prod (read-only).

## Verification matrix

Verify through the backend API or CLI, never through an email or a chat message. Record the command and the key output for each row.

| # | Check | Pass when |
|---|---|---|
| 1 | Inventory | Every declared alert, SLO, dashboard, and route exists; counts match the IaC. |
| 2 | Query correctness | Each SLI and alert query runs without error and returns data, or is correctly empty. |
| 3 | Live data flow | One real request appears as a trace, its log lines carry the same `trace_id`, and the metric increments with the expected attributes. |
| 4 | Alert fires end to end | A synthetic condition crosses the threshold; the API shows the alert open against the correct rule and route; it resolves after the condition stops. |
| 5 | Dashboard queries | Every panel query runs without an API error. |

**Synthetic signal injection (row 4).** Prove the alert chain without breaking the app. Send test telemetry that matches the alert query to the Collector's OTLP endpoint (for example with the Collector's `telemetrygen` tool [OTel-GEN]), or send requests that the app answers with errors (for example a bad credential). Mark every test record with an attribute such as `test.marker=true` so people can identify it. Commit the script (for example `scripts/fire_synthetic_signal.*`) so anyone can run it again after an alert change. Allow for evaluation delay: wait at least the short window plus the backend's evaluation interval before you read the alert state.

## Review checks

- **Cross-source agreement.** When two panels show the same concept from different sources (for example span metrics and log-derived counts), send a small burst (N=10) and compare. Counts must agree, or the difference must be explained by scope.
- **Start date of each signal.** Record when each metric began to be emitted. Panel descriptions state "data since <date>", so a short history does not look like a fault.
- **Scope in panel titles.** Format: `<what> <scope> [<source>]`, where source is `platform` (backend or infrastructure metric, no app cooperation) or `app` (emitted by the app). Example: "Successful checkout rate by region [app]".
- **Low data versus broken query.** For a panel with surprisingly low data, decide which case it is and write it down: broken query or emission (zero for 7 days), start-date gap (zero only before the start date), narrower scope (see cross-source agreement), or real low traffic.
- **Cheap automatic check.** For each panel, compute the 24-hour sum. Flag a panel below 0.1 times the median panel sum, and require a written reason in its description.
- **Alert hygiene.** Each alert pages on a symptom or opens a ticket, links a runbook entry, and has an owner.

## Backend notes

The Collector exporter is the only part that changes per backend. Check the exporter's current README before use.

| Backend | Note |
|---|---|
| Prometheus and Grafana | Write SLO and burn-rate rules as Prometheus recording and alerting rules in git; route through Alertmanager. |
| Datadog | Export through the Collector's Datadog exporter, or OTLP ingest; manage monitors and SLOs with the Datadog Terraform provider. |
| Cloud vendor (Google Cloud, AWS, Azure) | Use the vendor's Collector exporter; manage alert policies and dashboards with the vendor's Terraform provider. Vendor metric labels can differ from OTel names; confirm the actual label values with a query before you write a filter. |

## Templates

Design doc, `docs/design-observability.md`:

```
# Observability: <service>
Status: <state per environment> | Runbook: docs/runbook.md
1. Overview: what is instrumented, the signal flow (app -> Collector -> backend)
2. SLIs and SLOs: name | good/total query | SLO | period | error budget policy
3. Alert catalog: name | SLO or condition | burn rate and windows | page or ticket | runbook link
4. Attributes: name | allowed values (bounded) | signals that carry it
5. Dashboards: panels with title, query, source, data-since date
6. Decisions: one numbered entry per non-obvious choice, with the reason
7. Verification: exact commands for the matrix
8. Out of scope, and history (dated changes)
```

Runbook entry, one per alert. Start with what is wrong, then what to check, then what to do:

```
## <alert name> (<page|ticket>)
<SLI> is spending the error budget at <burn rate>x. Most likely cause: <X>.
Check: <dashboard link>, traces with <attribute filter>. Action: if <Y>, do <Z>; else <W>.
```

Verification report, `docs/verify/<date>-observability.md`: date, target environment, operator; one row per matrix check with the command, the timestamp, and the observed output; open findings.

## References

- [OTel-ZC] OpenTelemetry, Zero-code instrumentation: https://opentelemetry.io/docs/concepts/instrumentation/zero-code/
- [OTel-LOGS] OpenTelemetry, Logs: https://opentelemetry.io/docs/concepts/signals/logs/
- [OTel-LTC] OpenTelemetry spec, Trace context in non-OTLP log formats: https://opentelemetry.io/docs/specs/otel/compatibility/logging_trace_context/
- [OTel-SC] OpenTelemetry, Semantic conventions: https://opentelemetry.io/docs/concepts/semantic-conventions/
- [OTel-HTTP] OpenTelemetry semconv, HTTP metrics: https://opentelemetry.io/docs/specs/semconv/http/http-metrics/
- [OTel-MET] OpenTelemetry semconv, Metrics general guidelines: https://opentelemetry.io/docs/specs/semconv/general/metrics/
- [OTel-SDK] OpenTelemetry spec, Metrics SDK (cardinality limits): https://opentelemetry.io/docs/specs/otel/metrics/sdk/
- [OTel-COL] OpenTelemetry Collector: https://opentelemetry.io/docs/collector/
- [OTel-GEN] telemetrygen: https://pkg.go.dev/github.com/open-telemetry/opentelemetry-collector-contrib/cmd/telemetrygen
- [SRE-MON] Google SRE book, Monitoring Distributed Systems: https://sre.google/sre-book/monitoring-distributed-systems/
- [SRE-SLO] Google SRE workbook, Implementing SLOs: https://sre.google/workbook/implementing-slos/
- [SRE-ALERT] Google SRE workbook, Alerting on SLOs: https://sre.google/workbook/alerting-on-slos/
- [RED] Grafana Labs, The RED Method: https://grafana.com/blog/the-red-method-how-to-instrument-your-services/
- [USE] Brendan Gregg, The USE Method: https://www.brendangregg.com/usemethod.html
