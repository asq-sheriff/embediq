<!-- audience: public -->

# Healthcare BPO Deployment Pattern

A linear, operator-ready playbook for deploying EmbedIQ inside a
healthcare business process outsourcing (BPO) organization or any
HIPAA-covered services firm. Walks through the deployment topology,
domain pack wiring, compliance feedback loop, audit retention, and
BAA-survivable artifacts that an OCR auditor or client compliance
team is likely to ask for.

This is a *synthesis* doc — it stitches together capabilities that ship
today and points to the deeper references rather than re-explaining
them. Follow it linearly and you end up with a deployment defensible
under HIPAA Privacy + Security Rules (45 CFR Parts 160, 162, 164).

> **Scope.** EmbedIQ is a configuration generator. The wizard itself
> never sees PHI. This runbook covers deploying EmbedIQ as a governed
> internal tool inside a HIPAA-covered environment — what the
> deployment looks like, how compliance evidence flows, and how
> generated outputs become the harness for downstream tools that
> *do* handle PHI.

## Who this is for

- Healthcare BPOs and revenue-cycle-management firms processing
  PHI on behalf of payers or providers
- Health-tech vendors signed under BAAs and contractually bound to
  the HIPAA Security Rule
- Regulated services firms standing up AI coding agents across
  workforce roles that span developer, ops, clinical analyst, and
  compliance functions
- Any organization where deterministic, audit-stamped, byte-identical
  configuration regeneration is a regulatory requirement rather than
  a preference

Not for organizations that just want HIPAA-flavored advisory text in
a `CLAUDE.md` — EmbedIQ's HIPAA enforcement runs through DLP patterns,
validation refusals, and hook scripts, not advisory documentation.
That's the design point.

## Deployment topology

Two viable shapes. Pick based on your client BAAs and internal
security posture.

### Topology A — air-gapped single-node (recommended starting point)

```
┌─────────────────────────────────────────────────────────────┐
│  Internal VLAN — no outbound traffic                        │
│                                                             │
│   ┌─────────────────────────┐                              │
│   │  EmbedIQ web container  │     ┌──────────────────┐    │
│   │  :3000 (TLS-terminated  │ ──> │  SQLite session  │    │
│   │   at reverse proxy)     │     │  store (encrypted │    │
│   └───────────┬─────────────┘     │  via             │    │
│               │                    │  EMBEDIQ_SESSION_│   │
│               ▼                    │  DATA_KEY)        │   │
│   ┌─────────────────────────┐     └──────────────────┘    │
│   │  Audit log (JSONL)      │                              │
│   │  /var/log/embediq/      │                              │
│   │  audit.jsonl            │ ──> SIEM ingestion (Splunk, │
│   └─────────────────────────┘     Elastic, etc.) via       │
│                                    on-prem agent           │
└─────────────────────────────────────────────────────────────┘

Zero outbound traffic. No OTel export. No git PRs. Manual export
of generated files via the dump endpoint.
```

### Topology B — controlled-outbound (enables Git PR autoflow + compliance webhooks)

```
┌─────────────────────────────────────────────────────────────┐
│  Internal VLAN                                              │
│                                                             │
│   ┌─────────────────────────┐                              │
│   │  EmbedIQ web container  │ ──> Outbound allow-list:    │
│   │  + autopilot enabled    │     - github.com (or         │
│   └───────────┬─────────────┘       internal GHE)          │
│               │                    - api.drata.com         │
│               ▼                      / api.vanta.com       │
│   ┌─────────────────────────┐     - OTel collector        │
│   │  Encrypted SQLite       │       (internal)             │
│   │  session store          │                              │
│   └─────────────────────────┘                              │
│                                                             │
│   Inbound allow-list:                                       │
│   - Drata / Vanta webhook IPs to                            │
│     /api/autopilot/compliance/:adapterId                    │
└─────────────────────────────────────────────────────────────┘
```

Choose Topology B when the compliance team values the automated
feedback loop (failed control → autopilot run → drift PR) more than
strict zero-outbound. Both deployments preserve the **no LLM calls
during generation** guarantee.

## Step-by-step deployment

### 1. Resolve the HIPAA domain pack at startup

The healthcare domain pack auto-activates when the wizard answer to
**STRAT_002 — Industry** is `healthcare`. No manual selection needed
in the operator config. The pack ships:

- 6 DLP patterns (MRN, DEA, NPI, ICD-10 in narrative, FHIR Patient
  refs, etc.) baked into Python pre-commit hooks
- 3 rule templates: `hipaa-phi-handling.md`, `healthcare-interop.md`,
  `security.md` — path-scoped to wherever PHI-handling code lives
- 5 validation checks that refuse generated configs missing the
  required HIPAA enforcement scaffolding
- Multi-framework registration: HIPAA, HITECH, 42 CFR Part 2

```bash
# Verify the pack is registered
curl -s http://localhost:3000/api/skills | jq '.[] | select(.id == "healthcare.full")'
```

See [`docs/architecture/domain-packs-and-skills.md`](architecture/domain-packs-and-skills.md)
for the pack internals and how to extend it for client-specific
controls.

### 2. Configure session persistence with payload encryption

Healthcare deployments should use the SQLite backend with AES-256-GCM
payload encryption. The JSON file backend works for development but
the encryption layer only engages on the database backend.

```bash
# Generate a 32-byte data key
openssl rand -hex 32 > /etc/embediq/session-data-key.txt
chmod 600 /etc/embediq/session-data-key.txt

# Environment for the container
export EMBEDIQ_SESSION_BACKEND=database
export EMBEDIQ_SESSION_DB_DRIVER=sqlite
export EMBEDIQ_SESSION_DB_URL=/var/lib/embediq/sessions.db
export EMBEDIQ_SESSION_DATA_KEY=$(cat /etc/embediq/session-data-key.txt)
export EMBEDIQ_SESSION_TTL_MS=86400000   # 24h (HIPAA "minimum necessary")
```

If you need to rotate keys, set `EMBEDIQ_SESSION_COOKIE_SECRET_PREV`
to the previous value during the rotation window — sessions signed
with the old key continue to decode until they expire.

See [`docs/operator-guide/session-backends.md`](operator-guide/session-backends.md).

### 3. Wire authentication + RBAC

Two strategies fit healthcare BPO environments:

**OIDC** (recommended) — integrates with the BPO's identity provider
(Okta, Azure AD, Ping). Audit logs auto-enrich with the authenticated
`userId` for the "who answered what" question:

```bash
export EMBEDIQ_AUTH_STRATEGY=oidc
export EMBEDIQ_OIDC_ISSUER=https://login.your-tenant.example.com
export EMBEDIQ_OIDC_CLIENT_ID=embediq-prod
export EMBEDIQ_OIDC_CLIENT_SECRET=$(cat /etc/embediq/oidc-secret.txt)
export EMBEDIQ_OIDC_ROLES_CLAIM=groups   # or whatever your IdP uses
```

**Reverse-proxy header** — when you've already terminated SSO at the
ingress layer (nginx + lua, Envoy + JWT, etc.) and want EmbedIQ to
trust headers:

```bash
export EMBEDIQ_AUTH_STRATEGY=proxy
export EMBEDIQ_PROXY_USER_HEADER=X-Forwarded-User
export EMBEDIQ_PROXY_ROLES_HEADER=X-EmbedIQ-Roles
```

Map the IdP groups onto the three-tier RBAC hierarchy. `wizard-admin`
can manage all schedules and view all dumps; `wizard-user` (or its
alias `wizard-contributor`) can run the wizard; `wizard-viewer` has
read-only access to generations, audit log, and autopilot status — a
common fit for external auditors who need to verify evidence without
touching anything. Compliance officers typically get `wizard-admin`;
analysts get `wizard-user`; external auditors get `wizard-viewer`.

See [`docs/operator-guide/authentication.md`](operator-guide/authentication.md).

### 4. Enable the autopilot + compliance feedback loop

Opt in to autopilot and wire your compliance platform:

```bash
export EMBEDIQ_AUTOPILOT_ENABLED=true
export EMBEDIQ_AUTOPILOT_DIR=/var/lib/embediq/autopilot
export EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET=$(openssl rand -hex 24)

# Optional second trust layer — per-adapter HMAC verification
export EMBEDIQ_COMPLIANCE_SECRET_DRATA=$(cat /etc/embediq/drata-hmac.txt)
export EMBEDIQ_COMPLIANCE_SECRET_VANTA=$(cat /etc/embediq/vanta-hmac.txt)
```

In Drata or Vanta, configure an outbound webhook pointing at:

```
https://embediq.internal/api/autopilot/compliance/drata
https://embediq.internal/api/autopilot/compliance/vanta
```

Carry the gateway shared secret as `X-EmbedIQ-Autopilot-Secret` and
let the platform sign the payload — EmbedIQ will verify both.
When a control fails in Drata, an autopilot drift scan runs
automatically against every schedule whose `complianceFrameworks` list
includes the affected framework. If you're on Topology B with Git PR
integration, the drift surfaces as a PR.

See [`docs/user-guide/11-compliance-webhooks.md`](user-guide/11-compliance-webhooks.md).

### 5. Set up audit logging with HIPAA-grade retention

```bash
# Single shared file across all engagements
export EMBEDIQ_AUDIT_LOG=/var/log/embediq/audit.jsonl
```

Logrotate config (`/etc/logrotate.d/embediq`):

```
/var/log/embediq/audit.jsonl {
  daily
  rotate 2190                # 6 years per HIPAA
  compress
  missingok
  notifempty
  create 0640 embediq embediq
  postrotate
    /usr/local/bin/embediq-audit-rsync   # sync to long-term storage
  endscript
}
```

Each entry carries `userId`, `requestId`, optional `engagementId`,
timestamp, and event type. Schema:
[`docs/reference/audit-log-schema.md`](reference/audit-log-schema.md).

Long-term storage rsync to S3 Glacier / GCS Archive is the common
pattern — 6-year retention floor with quarterly tier-down to cold
storage costs <$5/TB/month at typical BPO scales.

### 6. Configure per-engagement scoping if you serve multiple clients

If you run a single EmbedIQ instance shared across client engagements,
use `EMBEDIQ_ENGAGEMENT_ID` to isolate state per engagement. Each
client engagement gets its own session store, autopilot schedules,
and tagged audit entries — see
[`docs/CONSULTING-FIRM-DEPLOYMENT.md`](CONSULTING-FIRM-DEPLOYMENT.md)
for the convention. If every engagement gets its own deployment,
skip this step.

### 7. Generate the customer-facing scorecard for client deliverables

Each engagement completion can produce an audit-stamped HTML
scorecard:

```bash
npm run evaluate -- --archetype healthcare-bpo-microsoft-developer \
  --format scorecard \
  --out /deliverables/client-{id}/embediq-scorecard.html \
  --scorecard-title "{Client Name} — HIPAA AI Harness Score" \
  --scorecard-logo /etc/embediq/client-{id}-logo.png
```

Four canonical healthcare-bpo archetypes ship with the repo
(`tests/fixtures/golden-configs/healthcare-bpo-*/`) covering two stack
families and two role variants:
- `healthcare-bpo-web-developer` — TS/Python · npm · GitHub Actions, developer persona
- `healthcare-bpo-web-pm` — same stack, PM (non-technical) persona
- `healthcare-bpo-microsoft-developer` — C#/Java/Python · dotnet+pip+maven · Azure DevOps, developer persona
- `healthcare-bpo-microsoft-pm` — same Microsoft stack, PM persona

All four model a healthcare BPO running a claims platform with full
HIPAA + strict security tier. Pick the variant matching your client's
stack + the persona of the primary user. Use `hipaa-developer-strict`
for the individual-developer variant — all score against the same
Healthcare domain pack.

Hand this to the client compliance officer alongside the generated
files. See
[`docs/user-guide/06-evaluation-and-drift.md`](user-guide/06-evaluation-and-drift.md#customer-facing-scorecards).

## BAA-survivable evidence checklist

When an OCR auditor or client compliance team requests evidence,
these are the artifacts EmbedIQ produces:

| Auditor question | Evidence EmbedIQ produces |
|---|---|
| "Show me deterministic, reproducible configuration generation." | Run `npm run evaluate` against the engagement's archetype and produce the JSON report. Same answer set → byte-identical output every time. Stamped with run ID, generator version, git SHA. |
| "Who configured the harness?" | Audit log entries with `userId` (from OIDC), `requestId`, and `engagementId` (when scoped). Multi-stakeholder sessions carry `contributedBy` attribution server-stamped per answer. |
| "What compliance controls are enforced?" | Pre-write validators refuse non-compliant output. Python DLP hooks block PHI in commits. Run `npm run evaluate` and inspect the per-archetype `validatorResult` field. |
| "How are PHI patterns enforced at the developer workstation?" | Generated `.claude/hooks/*.py` files run before every tool invocation. Patterns are listed in the healthcare domain pack source. |
| "How is configuration drift detected?" | `npm run drift` produces a structured classification per file (match / missing / modified-by-user / stale-stamp / version-mismatch / extra). Autopilot scheduling automates this; failed runs surface as Git PRs. |
| "What happens when a Drata/Vanta control fails?" | Inbound compliance webhook triggers an autopilot run for every schedule whose `complianceFrameworks` includes the framework. Drift findings open a PR for remediation. Audit log records the chain. |
| "Where is the audit trail stored, and for how long?" | `/var/log/embediq/audit.jsonl` rotated daily, retained 2190 days (6 years), tier-down to cold storage per the logrotate config above. |
| "Show me the threat model." | [`SECURITY.md`](../SECURITY.md) and [`docs/evaluators/threat-coverage.md`](evaluators/threat-coverage.md). |

The customer-facing scorecard (step 7) is the cover page for this
checklist — one HTML file an auditor can keep.

## Operational runbook

### Sanity-check the deployment

```bash
# Health
curl -fsS http://localhost:3000/healthz

# Verify the healthcare pack is loaded
curl -s http://localhost:3000/api/skills | jq '.[] | select(.id == "healthcare.full")'

# Verify autopilot is enabled (only on Topology B)
curl -fsS -H "X-EmbedIQ-Autopilot-Secret: $EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET" \
  http://localhost:3000/api/autopilot/schedules
```

### Rotate the session-data key

1. Generate a new key: `openssl rand -hex 32 > /etc/embediq/session-data-key.new`
2. Set both env vars before restart:
   - `EMBEDIQ_SESSION_DATA_KEY=$(cat /etc/embediq/session-data-key.new)`
   - `EMBEDIQ_SESSION_DATA_KEY_PREV=$(cat /etc/embediq/session-data-key.txt)`
3. Rolling-restart the container
4. After all existing sessions expire (TTL), remove `_PREV`

(The active key rotation feature is on the v3.2.x follow-up roadmap;
until it ships, the manual env-var swap above is the documented path.)

### Force a compliance drift scan manually

```bash
# Replace SCHEDULE_ID with the actual schedule UUID from /api/autopilot/schedules
curl -X POST \
  -H "X-EmbedIQ-Autopilot-Secret: $EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET" \
  https://embediq.internal/api/autopilot/webhook/SCHEDULE_ID
```

### Export the audit trail for a specific time range

```bash
jq -c 'select(.timestamp >= "2026-01-01" and .timestamp < "2026-04-01")' \
  /var/log/embediq/audit.jsonl > /tmp/q1-2026-audit.jsonl
```

### Inspect what files were written for a session

```bash
jq -c 'select(.requestId == "REQUEST_ID" and .eventType == "file_written")
       | {filePath, fileSize, diffStatus}' \
  /var/log/embediq/audit.jsonl
```

## What this pattern is *not*

- **Not a PHI handler.** EmbedIQ's wizard interview never accepts
  PHI as input and the generator never produces PHI as output. This
  pattern is for deploying EmbedIQ inside a HIPAA-covered environment;
  PHI handling lives downstream in the tools EmbedIQ *configures*.
- **Not a BAA template.** Use your legal team's BAA. This runbook
  describes the technical controls that make EmbedIQ defensible under
  one; it doesn't replace contract review.
- **Not a runtime monitoring tool.** Runtime DLP is what the generated
  hooks do at every Claude Code / Cursor tool invocation. EmbedIQ
  itself generates and validates configurations; runtime governance
  is the agent's job.
- **Not a replacement for client-specific compliance reviews.** Each
  client engagement should still review the generated harness against
  their specific controls before deployment.

## See also

- [`SECURITY.md`](../SECURITY.md) — full threat model
- [`docs/evaluators/threat-coverage.md`](evaluators/threat-coverage.md) — mapping
  of threats to mitigations
- [`docs/reference/audit-log-schema.md`](reference/audit-log-schema.md) — schema +
  retention guidance per framework
- [`docs/CONSULTING-FIRM-DEPLOYMENT.md`](CONSULTING-FIRM-DEPLOYMENT.md) — per-engagement scoping
- [`docs/operator-guide/deployment.md`](operator-guide/deployment.md) — general
  deployment guide
- [`docs/operator-guide/observability.md`](operator-guide/observability.md) — audit
  + OTel ingestion
- [`docs/user-guide/06-evaluation-and-drift.md`](user-guide/06-evaluation-and-drift.md) — scorecard
  generation
- [`docs/user-guide/11-compliance-webhooks.md`](user-guide/11-compliance-webhooks.md) — Drata /
  Vanta wiring
