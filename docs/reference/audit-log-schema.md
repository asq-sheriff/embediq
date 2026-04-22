<!-- audience: public -->

# Audit log schema

EmbedIQ's audit log is a JSON Lines (JSONL) file — one event per line.
Writer is a no-op when `EMBEDIQ_AUDIT_LOG` is unset; when set, the
subscriber appends entries with `appendFileSync` (opens + flushes per
write, so a crash between writes doesn't corrupt prior entries).

## Entry shape

Every line is a single `WizardAuditEntry` JSON object:

```ts
interface WizardAuditEntry {
  timestamp: string;           // ISO 8601 UTC
  eventType:
    | 'session_start'
    | 'profile_built'
    | 'validation_result'
    | 'generation_started'
    | 'file_written'
    | 'session_complete'
    | 'session_error';
  userId?: string;             // from request context
  requestId?: string;          // from request context
  profileSummary?: {           // only on profile_built
    role: string;
    industry: string;
    teamSize: string;
    complianceFrameworks: string[];
    securityLevel: string;
    fileCount: number;
  };
  filePath?: string;           // only on file_written
  fileSize?: number;           // only on file_written
  diffStatus?: string;         // only on file_written: 'new' | 'modified' | 'unchanged' | 'conflict'
  validationPassed?: boolean;  // only on validation_result
  validationErrorCount?: number; // only on validation_result
  errorMessage?: string;       // only on session_error
}
```

## Event types

| `eventType` | Emitted when | Populated fields |
|---|---|---|
| `session_start` | Wizard session opens. | `timestamp`, `userId?`, `requestId?` |
| `profile_built` | Profile + priorities computed from answers. | + `profileSummary` |
| `generation_started` | Orchestrator begins a run. | `timestamp`, `userId?`, `requestId?` |
| `validation_result` | Output validator finishes. | + `validationPassed`, `validationErrorCount` |
| `file_written` | One file lands on disk. | + `filePath`, `fileSize`, `diffStatus` |
| `session_complete` | Session finalizes (files written). | `timestamp`, `userId?`, `requestId?` |
| `session_error` | Session failed with an error. | + `errorMessage` |

## Auto-enrichment

`userId` and `requestId` are **not supplied by callers** — the
`auditLog()` function pulls them from the ambient request context
(`AsyncLocalStorage`) at write time. Callers can still set them
explicitly; explicit values win over the context.

In CLI mode there is no request context, so both fields stay
undefined. Web-server calls always carry `requestId`; when an auth
strategy is active they carry `userId` too.

## Example log

```json
{"timestamp":"2026-04-21T12:34:50.001Z","eventType":"session_start","userId":"alice@acme.com","requestId":"req-abc"}
{"timestamp":"2026-04-21T12:36:20.914Z","eventType":"profile_built","userId":"alice@acme.com","requestId":"req-abc","profileSummary":{"role":"developer","industry":"healthcare","teamSize":"medium","complianceFrameworks":["hipaa"],"securityLevel":"strict","fileCount":0}}
{"timestamp":"2026-04-21T12:36:21.002Z","eventType":"generation_started","userId":"alice@acme.com","requestId":"req-abc"}
{"timestamp":"2026-04-21T12:36:21.104Z","eventType":"validation_result","userId":"alice@acme.com","requestId":"req-abc","validationPassed":true,"validationErrorCount":0}
{"timestamp":"2026-04-21T12:36:21.213Z","eventType":"file_written","userId":"alice@acme.com","requestId":"req-abc","filePath":"CLAUDE.md","fileSize":2841,"diffStatus":"new"}
{"timestamp":"2026-04-21T12:36:21.260Z","eventType":"session_complete","userId":"alice@acme.com","requestId":"req-abc"}
```

## Retention guidance

The writer does not rotate the file. Use `logrotate` or equivalent:

```
/var/log/embediq/audit.jsonl {
  daily
  rotate 365
  compress
  missingok
  notifempty
  create 0640 embediq embediq
}
```

Retention floor by framework (not legal advice — confirm with your
compliance team):

| Framework | Typical retention |
|---|---|
| HIPAA | 6 years |
| PCI-DSS | 1 year |
| SOX | 7 years |
| GDPR | As long as justified by the processing purpose, then delete. |
| FERPA | As long as the student record itself is retained. |

## Ingestion

- **Splunk / Elastic / Loki**: line-oriented JSON; no custom parser
  needed.
- **Datadog**: `datadog-agent` log collection with `service: embediq`.
- **S3 / GCS**: sync rotated slices with `aws s3 cp` / `gsutil rsync`;
  lifecycle-policy tiering to Glacier / Archive for long retention.
- **SIEM alerting**: the four chat-worthy events are also available
  via [outbound notification webhooks](../user-guide/10-notification-webhooks.md)
  for near-real-time alerting; use the audit log for forensic +
  compliance queries instead.

## Schema evolution

EmbedIQ v3.2 writes `WizardAuditEntry` v1. Future major versions may
add fields — consumers should tolerate unknown keys. Removed or
renamed fields are called out in [CHANGELOG.md](../../CHANGELOG.md).

## See also

- [Observability operator guide](../operator-guide/observability.md) —
  audit vs. OTel, SIEM ingestion patterns
- [Security](../../SECURITY.md) — what's captured, what's not
- [`src/util/wizard-audit.ts`](../../src/util/wizard-audit.ts) —
  source of truth for the type
