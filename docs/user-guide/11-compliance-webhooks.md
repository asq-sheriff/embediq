<!-- audience: public -->

# Compliance platform inbound webhooks

Close the compliance feedback loop: when Drata, Vanta, or any generic
compliance platform reports a failing control or an open finding,
EmbedIQ's inbound-webhook route translates the payload into a
canonical `ComplianceEvent` and fires an autopilot run for every
enabled schedule whose `complianceFrameworks` list includes the
affected framework. The automated flow becomes: **platform detects
gap → autopilot regenerates configuration → drift report surfaces the
delta → (with [6H git PR integration](09-git-pr-integration.md))
team reviews and approves → platform sees the gap closed.**

> **When to use this.** Your organization uses a SaaS compliance
> platform that supports outbound webhooks and you want control-
> failure events to trigger EmbedIQ runs automatically.

## Prerequisites

- [Autopilot enabled](08-autopilot.md) (`EMBEDIQ_AUTOPILOT_ENABLED=true`).
- At least one autopilot schedule with a `complianceFrameworks` list
  that includes the frameworks you want to react to.
- A publicly-reachable HTTP endpoint (or the ability to expose one to
  your compliance platform's outbound IPs).

## Route

```
POST /api/autopilot/compliance/:adapterId
```

Adapter IDs:

| `:adapterId` | Platform |
|---|---|
| `drata` | Drata |
| `vanta` | Vanta |
| `generic` | Any platform that can POST a canonical JSON payload |

A custom adapter can be registered programmatically — see
[writing compliance adapters](../extension-guide/writing-compliance-adapters.md).

## Authentication

Inbound compliance webhooks share the **autopilot webhook secret**:

```bash
export EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET=$(openssl rand -hex 32)
```

Every request must carry:

```
X-EmbedIQ-Autopilot-Secret: <value>
```

Requests without the header (when a secret is configured) return
`401 Unauthorized`. Tokens aren't rotated automatically — treat the
secret like any other shared credential.

## Matching rules

1. The adapter parses the incoming payload and produces a
   `ComplianceEvent` containing (among other fields) a `framework`
   string normalized to EmbedIQ's internal identifiers
   (`hipaa`, `pci`, `soc2`, `ferpa`, `sox`, `gdpr`, `iso27001`, …).
2. The route finds every **enabled** schedule whose
   `complianceFrameworks` list includes that framework.
3. For each match, it calls the autopilot runner (`trigger: 'webhook'`)
   and collects the resulting `AutopilotRun` records.
4. The response is either:
   - `202 Accepted` with `{ event, runs: [...] }` when one or more
     schedules fired, or
   - `200 OK` with `{ skipped: true, reason }` when the adapter
     ignored the payload or no schedule matched the framework.

## Drata

### Events EmbedIQ reacts to

| Drata event | EmbedIQ action |
|---|---|
| `monitor.failed` / `monitor.failing` | `gap_opened` |
| `control.unassigned` | `gap_opened` |
| `finding.opened` / `finding.reopened` | `gap_opened` |
| `monitor.recovered` / `monitor.passing` | `gap_resolved` |
| `finding.closed` / `finding.resolved` | `gap_resolved` |

Everything else returns `{ skipped: true }` — Drata's generic system
events aren't compliance signals.

### Framework normalization

Drata uses identifiers like `soc_2`, `pci_dss`, `iso_27001`. EmbedIQ
normalizes:

| Drata | EmbedIQ |
|---|---|
| `soc_2`, `soc2` | `soc2` |
| `pci_dss`, `pci` | `pci` |
| `iso_27001`, `iso27001` | `iso27001` |
| `hipaa`, `hitech`, `gdpr`, `ferpa`, `sox`, `glba` | unchanged |
| anything else | lowercased passthrough |

### Example payload

```json
{
  "event": "monitor.failed",
  "data": {
    "control": {
      "id": "CTRL-123",
      "name": "Access controls monitor",
      "frameworks": ["hipaa", "soc_2"]
    },
    "severity": "high"
  }
}
```

Produces:

```json
{
  "source": "drata",
  "framework": "hipaa",
  "action": "gap_opened",
  "controlId": "CTRL-123",
  "severity": "high",
  "title": "Access controls monitor"
}
```

The event's `framework` is `hipaa` (the first normalized framework).
EmbedIQ fires runs for every schedule whose `complianceFrameworks`
list includes `hipaa`.

### Configure in Drata

1. Drata admin → **Workspace settings** → **Webhooks**.
2. **New webhook** → paste
   `https://embediq.example.com/api/autopilot/compliance/drata`.
3. Add the header
   `X-EmbedIQ-Autopilot-Secret: <your EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET>`.
4. Subscribe to `monitor.*` and `finding.*` event families.
5. Save. Drata will fire a test delivery — confirm `202` or
   `200/skipped` in the delivery log.

## Vanta

### Events EmbedIQ reacts to

| Vanta event | EmbedIQ action |
|---|---|
| `test.failing` / `test.failed` | `gap_opened` |
| `observation.created` | `gap_opened` |
| `observation.updated` (status → open/failing) | `gap_opened` |
| `test.recovered` / `test.passing` / `test.passed` | `gap_resolved` |
| `observation.closed` / `observation.resolved` | `gap_resolved` |
| `observation.updated` (status → closed/resolved/passing) | `gap_resolved` |

### Framework normalization

Vanta uses slugs like `pci-dss`, `soc2`, `iso-27001`. EmbedIQ
normalizes slugs the same way, collapsing separators:

| Vanta | EmbedIQ |
|---|---|
| `pci-dss`, `pci` | `pci` |
| `soc2` | `soc2` |
| `iso-27001`, `iso27001` | `iso27001` |
| `hipaa`, `hitech`, `gdpr`, `ferpa`, `sox` | unchanged |
| anything else | lowercased passthrough |

### Example payload

```json
{
  "type": "test.failing",
  "data": {
    "test": {
      "id": "test-42",
      "name": "MFA enforced for all admin users",
      "frameworks": [{ "slug": "soc2" }]
    }
  }
}
```

Produces `framework: "soc2"`, `action: "gap_opened"`.

### Configure in Vanta

1. Vanta admin → **Integrations** → **Webhooks** → **Create webhook**.
2. Endpoint: `https://embediq.example.com/api/autopilot/compliance/vanta`.
3. Header: `X-EmbedIQ-Autopilot-Secret: <secret>`.
4. Subscribe to `test.*` and `observation.*` event types.
5. Save and trigger a test delivery.

## Generic adapter

For any platform that doesn't have a dedicated adapter, POST a minimal
canonical payload to `/api/autopilot/compliance/generic`:

```json
{
  "framework": "hipaa",
  "action": "gap_opened",
  "controlId": "internal-42",
  "findingId": "finding-1",
  "severity": "critical",
  "title": "Access controls monitor failing"
}
```

Field aliases are accepted (`compliance_framework`, `control_id`,
`finding_id`) so you can wire existing platform payloads with minimal
reshaping.

Valid `action` values: `gap_opened`, `gap_resolved`, `other`.
Anything else is normalized to `other`.

## Worked example — Drata monitor fails → HIPAA schedule fires

```bash
# 1. Autopilot + secret
export EMBEDIQ_AUTOPILOT_ENABLED=true
export EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET=$(openssl rand -hex 32)

# 2. Create a schedule covering HIPAA
curl -X POST http://localhost:3000/api/autopilot/schedules \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "patient-portal-hipaa",
    "cadence": "@daily",
    "answerSourcePath": "/ops/answers/hipaa.yaml",
    "targetDir": "/srv/patient-portal",
    "complianceFrameworks": ["hipaa"]
  }'

# 3. Register the webhook in Drata, pointing to:
#    https://embediq.example.com/api/autopilot/compliance/drata
#    Header: X-EmbedIQ-Autopilot-Secret: <EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET>

# 4. When Drata later fires:
#    POST /api/autopilot/compliance/drata
#    {
#      "event": "monitor.failed",
#      "data": { "control": { "name": "PHI encryption", "frameworks": ["hipaa"] } }
#    }

# Response:
# 202 Accepted
# {
#   "event": { "source": "drata", "framework": "hipaa", "action": "gap_opened", ... },
#   "runs":  [ { "scheduleId": "...", "trigger": "webhook", "status": "success-clean", ... } ]
# }
```

Pair with [notification webhooks](10-notification-webhooks.md) to get a
Slack message when the triggered run ends in `success-alerting` (drift
above threshold).

## Skipped responses

The route is intentionally permissive — a skipped webhook returns
`200 OK` with a reason so the compliance platform doesn't flag it as a
delivery failure and retry indefinitely.

| Reason | When it happens |
|---|---|
| `Adapter ignored the payload` | The adapter returned `null` (e.g. a Drata `user.created` event). |
| `No schedules configured for framework "<framework>"` | The event's framework doesn't match any schedule's `complianceFrameworks`. |

Both still include the parsed `event` in the response body so you can
observe what EmbedIQ saw.

## Troubleshooting

- **`401 Invalid autopilot webhook secret`.** The header is missing,
  misspelled, or mismatched. Check both sides.
- **`404 Unknown compliance adapter`.** Adapter ID isn't registered.
  Built-ins: `drata`, `vanta`, `generic`. Custom adapters must be
  registered programmatically at server boot.
- **`400 Adapter "<id>" failed to parse payload`.** The payload is
  malformed JSON or is missing required fields for that adapter.
  Enable Drata/Vanta's "Send test delivery" feature to see exactly
  what EmbedIQ is receiving.
- **`200 skipped` when you expected a run.** Either the adapter
  ignored the payload (check the `reason` field), or no schedule's
  `complianceFrameworks` list matched the event's framework. Verify
  both the schedule definition and the normalization table above.
- **Run fires but `failure` status.** Autopilot reached the schedule
  but the drift scan itself failed — missing answers file,
  unreachable target directory. Inspect
  `GET /api/autopilot/runs?scheduleId=<id>&limit=1`.

## Security considerations

- **The shared secret is the only authentication.** If it leaks,
  anyone can trigger runs. Rotate promptly via
  `EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET` (and optionally
  `EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET_PREV` during rotation — a future
  enhancement).
- **HMAC signatures aren't implemented yet.** Platforms like Drata
  support HMAC verification of webhook bodies; that's a roadmap item.
  Until then, the shared-secret header is the only trust mechanism.
- **IP allowlisting at the edge.** For higher assurance, put EmbedIQ
  behind a reverse proxy that restricts the inbound compliance route
  to your platform's published outbound IPs.

## See also

- [Autopilot](08-autopilot.md) — the runner these webhooks fire
- [Notification webhooks](10-notification-webhooks.md) — outbound
  side (alert on alerting runs)
- [Writing compliance adapters](../extension-guide/writing-compliance-adapters.md) —
  add a custom adapter for Secureframe, AWS Audit Manager, ServiceNow,
  etc.
- [REST API reference](../reference/rest-api.md) — complete route
  contract
