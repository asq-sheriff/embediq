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
  engagementId?: string;       // from request context / EMBEDIQ_ENGAGEMENT_ID
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
  // v4.0 / 8F — present only when EMBEDIQ_AUDIT_CHAIN_ENABLED=true.
  // SHA-256 of the previous entry's canonicalized content (excluding
  // its own prevHash). First entry chains to the genesis hash.
  prevHash?: string;
}
```

## Tamper-evident chain mode (v4.0 / 8F, opt-in)

Set `EMBEDIQ_AUDIT_CHAIN_ENABLED=true` to route every appended entry through the `appendChainedEntry()` helper in `src/util/audit-chain.ts`. The helper:

1. Reads the prior entry from the file (or uses `GENESIS_HASH` for the first entry).
2. Computes the prior entry's hash via SHA-256 of its sorted-key JSON serialization.
3. Stamps that hash into the new entry as `prevHash`.
4. Appends the new entry as a single JSONL line.

The chain is **linked-log only** — inspired by RFC 6962 Certificate Transparency — not a full Merkle tree. Tampering with any entry breaks every subsequent entry's `prevHash` link. HSM-signed chain heads + external anchoring are reserved for a follow-up.

Verification: `make verify-audit-log INPUT=path/to/audit.jsonl` (also `npm run verify-audit-log`). The verifier walks the file and reports the first integrity break with line number + reason. Exit codes 0 / 1 / 2.

**Constraints:**

- **Single-writer assumption.** Concurrent processes appending to the same chained file produce a broken chain. Operators who need multi-writer audit should funnel through a single audit-ingester process.
- **Append-only.** Editing any entry — even a typo in a JSON value — breaks the chain at that point.
- **Hash stability across implementations.** The canonicalization routine sorts object keys recursively so two implementations writing the same logical entry produce the same hash regardless of key insertion order.

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

`userId`, `requestId`, and `engagementId` are **not supplied by
callers** — the `auditLog()` function pulls them from the ambient
request context (`AsyncLocalStorage`) at write time. Callers can
still set them explicitly; explicit values win over the context.

In CLI mode there is no request context, so `userId` and `requestId`
stay undefined. `engagementId` falls back to a direct read of
`EMBEDIQ_ENGAGEMENT_ID` when set, so per-engagement CLI runs are
tagged correctly even without a request scope. Web-server calls
always carry `requestId`; when an auth strategy is active they carry
`userId` too.

When `EMBEDIQ_ENGAGEMENT_ID` is set, every entry written by that
process carries the same `engagementId`, enabling either per-engagement
audit files (set `EMBEDIQ_AUDIT_LOG` per process) or a single shared
file filtered by tag — see [`docs/CONSULTING-FIRM-DEPLOYMENT.md`](../CONSULTING-FIRM-DEPLOYMENT.md).

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

EmbedIQ v3.2 writes `WizardAuditEntry` v1. v3.2.x added the
`engagementId` field (auto-enriched from `EMBEDIQ_ENGAGEMENT_ID` /
request context; absent when neither is set, preserving backward
compatibility with pre-engagement entries). v4.0 / 8F added the
optional `prevHash` field present only when
`EMBEDIQ_AUDIT_CHAIN_ENABLED=true` — chains adopting the field
mid-stream is supported (the first chained entry chains to the
genesis hash; pre-chain entries are simply not verifiable). Future
major versions may add fields — consumers should tolerate unknown
keys. Removed or renamed fields are called out in
[CHANGELOG.md](../../CHANGELOG.md).

## See also

- [Observability operator guide](../operator-guide/observability.md) —
  audit vs. OTel, SIEM ingestion patterns
- [Security](../../SECURITY.md) — what's captured, what's not
- [`src/util/wizard-audit.ts`](../../src/util/wizard-audit.ts) —
  source of truth for the type
