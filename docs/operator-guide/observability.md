<!-- audience: public -->

# Observability

EmbedIQ ships two complementary observability surfaces:

- **Audit log** (JSONL, on disk) — canonical per-event trail suited to
  SIEM ingestion and compliance retention. Opt-in via
  `EMBEDIQ_AUDIT_LOG`.
- **OpenTelemetry** (traces + metrics over OTLP HTTP) — live
  operational monitoring, dashboards, alerting. Opt-in via
  `EMBEDIQ_OTEL_ENABLED`.

Both are off by default. Neither calls home — all destinations are
ones you configure.

For the canonical schema of audit entries see
[reference/audit-log-schema.md](../reference/audit-log-schema.md). The
current doc is the operator-facing setup + integration playbook.

## Audit log

### Enable

```bash
export EMBEDIQ_AUDIT_LOG=/var/log/embediq/audit.jsonl
npm run start:web
```

The file is append-only JSON Lines. Each line is a
[`WizardAuditEntry`](../../src/util/wizard-audit.ts) object. The log
writer is a no-op if `EMBEDIQ_AUDIT_LOG` isn't set — there's no
unconditional write cost.

### Event types

| `eventType` | When it's emitted |
|---|---|
| `session_start` | Wizard session opens (`session:started` event). |
| `profile_built` | Profile computed from answers (`profile:built` event). Includes `profileSummary` (role, industry, team size, compliance frameworks, security level, file count). |
| `generation_started` | Orchestrator begins a run. |
| `validation_result` | Output validator finishes; includes `passCount` + `failCount`. |
| `file_written` | A single file lands on disk; includes `filePath` + `fileSize`. |
| `session_complete` | Session finalized; includes `fileCount`. |
| `session_error` | Session failed with an error; includes `errorMessage`. |

### Auto-enriched fields

Every entry carries the ambient request context:

- `timestamp` — ISO 8601 UTC
- `userId` — from the authenticated user (when auth is on)
- `requestId` — the web request's UUID

The enrichment happens in `AuditSubscriber` via the
`AsyncLocalStorage`-based request context — no parameter threading
required.

### Rotation and retention

The writer does not rotate the file itself. Use your OS logrotate:

```
# /etc/logrotate.d/embediq
/var/log/embediq/audit.jsonl {
  daily
  rotate 365
  compress
  missingok
  notifempty
  create 0640 embediq embediq
  postrotate
    # Audit writer opens the file lazily per write — no kill -HUP needed.
  endscript
}
```

Retention policy is driven by your compliance framework. For HIPAA,
six years is the usual floor; for PCI-DSS, one year; for SOX, seven
years. The file format (JSONL) plays well with S3/GCS lifecycle
policies if you sync rotated slices to object storage.

### SIEM ingestion

- **Splunk**: point a Universal Forwarder at the file; each line is
  already JSON.
- **Datadog**: `datadog-agent` log collection with
  `source: embediq`, `service: embediq`.
- **Elastic**: Filebeat's `ndjson` parser consumes the stream
  unchanged.
- **Loki**: Promtail with `json` pipeline stage.

For near-real-time alerting, prefer
[outbound notification webhooks](../user-guide/10-notification-webhooks.md)
— the audit log is better suited to retention and forensic queries.

## OpenTelemetry

### Enable

```bash
export EMBEDIQ_OTEL_ENABLED=true
export OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318   # base URL
npm run start:web
```

When `EMBEDIQ_OTEL_ENABLED` is unset, `@opentelemetry/api` returns
noop implementations — **zero runtime cost**. The SDK packages are
installed as optional dependencies; they load via dynamic `import()`
at startup only when the env var is true.

### Exporter endpoints

| Env var | Purpose | Default |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base URL used for both traces and metrics when the per-signal vars aren't set. | `http://localhost:4318` |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Override just the traces URL. | `<base>/v1/traces` |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | Override just the metrics URL. | `<base>/v1/metrics` |

Metrics are pushed by a `PeriodicExportingMetricReader` every **30
seconds**. Adjust in `src/observability/telemetry.ts` if you need
finer granularity.

### Resource attributes

Every span/metric carries:

```
service.name    = embediq
service.version = <package.json version>
```

Add environment / deployment attributes at the collector via a
`resource` processor; EmbedIQ doesn't bundle them to keep the
application code deployment-agnostic.

## Trace catalog

| Span name | Emitted where | Notable attributes |
|---|---|---|
| `<METHOD> <path>` | Every HTTP request (root span) | `http.method`, `http.url`, `http.status_code`, `embediq.request_id`, `embediq.user_id?` |
| `synthesizer.generate` | Orchestrator entry | `embediq.role`, `embediq.industry`, `embediq.targets`, `embediq.generator_count`, `embediq.files_generated` |
| `synthesizer.generateWithValidation` | Orchestrator + validation | adds `embediq.validation_passed`, `embediq.validation_checks` |
| `generator.<name>` | Per-generator child span | e.g. `generator.CLAUDE.md`, `generator.settings.json` |

Per-generator child spans are linked to the parent orchestrator span
via normal OTel parenting — flame graphs show which generators dominate
a run.

## Metric catalog

Metrics are emitted by the `OtelSubscriber` on the event bus:

| Name | Type | Attributes | Meaning |
|---|---|---|---|
| `embediq.files_generated` | Counter | — | +1 per `file:generated` event. |
| `embediq.generation_runs` | Counter | `generator_count` | +1 per `generation:started` event. |
| `embediq.validations` | Counter | `passed` (`"true"`/`"false"`) | +1 per `validation:completed` event. |

These are deliberately sparse — EmbedIQ is a low-volume service and
three counters cover the usual SLIs (throughput, validation pass rate,
per-run work). Add your own by registering a subscriber against the
event bus; see `src/events/subscribers/otel-subscriber.ts` as a
starting point.

## Grafana / Prometheus

If you're exporting via an OTel collector that fronts Prometheus,
these PromQL snippets cover the common SLO queries:

```promql
# Validation pass rate (last 5m)
sum(rate(embediq_validations_total{passed="true"}[5m]))
  /
sum(rate(embediq_validations_total[5m]))

# Generation throughput (files per second)
sum(rate(embediq_files_generated_total[1m]))

# Per-dimension generator-run counter by generator_count bucket
sum(rate(embediq_generation_runs_total[5m])) by (generator_count)

# HTTP error rate (requires your collector to capture HTTP spans as
# metrics — e.g. via OTel "span metrics" processor)
sum(rate(http_server_requests_total{http_status_code=~"5.."}[5m]))
  /
sum(rate(http_server_requests_total[5m]))
```

Dashboard JSON: ship your own starter via the collector — EmbedIQ
doesn't ship a dashboard spec because the best choice depends on your
collector's metric-naming conventions (Prometheus vs. OTLP-native).

## Datadog

Datadog's OTel-native ingest picks up EmbedIQ without a collector in
the middle:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.datadoghq.com
export OTEL_EXPORTER_OTLP_HEADERS="DD-API-KEY=$DD_API_KEY"
export EMBEDIQ_OTEL_ENABLED=true
```

Dashboards: filter by `service:embediq`. Traces appear under APM
automatically.

## Audit log + OTel together

They're complementary, not redundant:

| Signal | Audit log | OTel |
|---|---|---|
| Durability | Append-only file, persistent | Streaming, exporter-dependent |
| Retention | Long (compliance) | Short (observability) |
| Query | grep / SIEM / data warehouse | Metrics TSDB + trace explorer |
| Granularity | Per-event, full payload | Per-request, summarized |
| Use | Forensics, audit, compliance | Live ops, SLI tracking, debugging |

The usual production setup enables both, wires audit to a SIEM, and
OTel to your APM.

## Troubleshooting

- **`EMBEDIQ_OTEL_ENABLED=true` but no traces appear.** The SDK
  packages failed to load. Check stderr for a message starting with
  `Failed to initialize OpenTelemetry SDK`. Install the optional
  deps listed in `package.json`'s `optionalDependencies` block.
- **Metrics arrive but no traces.** Your collector doesn't have a
  trace receiver. Add one — OTLP/HTTP on port 4318 by default.
- **Audit log has no `userId`.** Auth is off. With `proxy` or `oidc`
  strategies the userId populates automatically from the request
  context.
- **Audit log permissions error.** The process user can't write to
  `EMBEDIQ_AUDIT_LOG`'s directory. `chown` to the embediq user or
  mount a writable volume.
- **Log file growing unbounded.** No rotation configured. Wire
  `logrotate` as shown above.

## See also

- [Audit log schema reference](../reference/audit-log-schema.md) —
  field-by-field entry format
- [Outbound webhooks](../user-guide/10-notification-webhooks.md) —
  near-real-time alerting alternative
- [Deployment](deployment.md) — where telemetry fits in the topology
- [Configuration reference](../reference/configuration.md) — every
  `EMBEDIQ_*` env var
