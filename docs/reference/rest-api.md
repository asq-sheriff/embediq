<!-- audience: public -->

# REST API reference

Every HTTP endpoint EmbedIQ exposes, grouped by subsystem. Request
bodies are JSON (`Content-Type: application/json`) unless noted.
Response bodies are JSON. Authentication column indicates which auth
model gates the route when an auth strategy is configured — with no
strategy, all routes are open (not recommended for production).

For the handshake details of each auth strategy, see
[operator-guide/authentication.md](../operator-guide/authentication.md).

## Health & readiness

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Liveness probe — returns 200 with version + uptime. |
| GET | `/ready` | none | Readiness probe — 200 + question count once the bank is loaded. |

Responses:

```json
// GET /health
{ "status": "ok", "version": "3.2.0", "uptime": 1234.5, "timestamp": "2026-04-21T…" }

// GET /ready
{ "ready": true, "questionCount": 71 }
```

## Discovery

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/templates` | any | Organizational profile templates (HIPAA, PCI, SOC2, plus any in `EMBEDIQ_TEMPLATES_DIR`). |
| GET | `/api/domain-packs` | any | Built-in + external domain pack summaries. |
| GET | `/api/dimensions` | any | Dimensions in order, 0-indexed. |
| GET | `/api/skills` | any | Every registered skill summary (built-in + external from `EMBEDIQ_SKILLS_DIR`). |
| GET | `/api/skills/:id` | any | Single skill summary by id. 404 on unknown. |

### Example — list domain packs

```bash
curl http://localhost:3000/api/domain-packs
```

```json
[
  { "id": "healthcare", "name": "Healthcare", "version": "1.0.0",
    "description": "…", "questionCount": 6,
    "complianceFrameworks": ["hipaa", "hitech", "42cfr_part2"] },
  { "id": "finance",    "name": "Finance",    "version": "1.0.0", … },
  { "id": "education",  "name": "Education",  "version": "1.0.0", … }
]
```

## Q&A engine

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/questions` | any | Given `{ dimension, answers }`, return the visible questions for that dimension. |
| POST | `/api/profile` | any | Given `{ answers }`, return the built `UserProfile` + computed priorities. |

### Example — next visible question

```bash
curl -X POST http://localhost:3000/api/questions \
  -H 'Content-Type: application/json' \
  -d '{
    "dimension": "Strategic Intent",
    "answers": {
      "STRAT_000": { "value": "developer", "timestamp": "2026-04-21T…" }
    }
  }'
```

## Generation

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/generate` | `wizard-admin` | Synthesize, validate, write files to `targetDir`. Emits events on the bus (`generation:started`, `file:generated`, `validation:completed`). |
| POST | `/api/preview` | any | Same as generate but returns files in-memory (no disk write). |
| POST | `/api/diff` | any | Compare generated files against `targetDir` contents; returns new/modified/unchanged/conflict counts. |

Each accepts the same base body shape:

```json
{
  "answers": { "<questionId>": { "value": "...", "timestamp": "..." } },
  "targetDir": "/path/to/project",
  "sessionId": "optional — links the run to an existing session",
  "targets": ["claude", "cursor"]   // optional; defaults to EMBEDIQ_OUTPUT_TARGETS or ["claude"]
}
```

Response (generate):

```json
{
  "files": [
    { "path": "CLAUDE.md", "description": "…", "written": true },
    { "path": ".claude/settings.json", "description": "…", "written": true },
    …
  ],
  "errors": [],
  "totalWritten": 16,
  "validation": {
    "passed": true,
    "summary": "…",
    "checks": [
      { "name": "…", "passed": true, "severity": "error", "message": "" }
    ]
  }
}
```

`/api/preview` omits `written` + `errors` + `totalWritten` and adds a
`content` field per file. `/api/diff` returns diff counts instead of
`totalWritten`.

## Sessions

All session endpoints require the cookie `embediq_session_owner` (when
auth is off) or a matching authenticated user (when auth is on).
Configure persistence via `EMBEDIQ_SESSION_BACKEND` — see
[operator-guide/session-backends.md](../operator-guide/session-backends.md).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/sessions/config` | any | Feature discovery — returns `{ enabled, backend }`. |
| POST | `/api/sessions` | any | Mint a new session. Sets the owner cookie. Body: `{ templateId?, domainPackId? }`. |
| GET | `/api/sessions/:id` | owner | Full session record. |
| GET | `/api/sessions/:id/resume` | owner | Resume coordinates + partial profile + contributors map. |
| PATCH | `/api/sessions/:id` | owner | Merge answers / currentDimension / phase. Server stamps `contributedBy`. |
| DELETE | `/api/sessions/:id` | owner | Delete the session (irreversible). |
| GET | `/api/sessions` | `wizard-admin` | Paginated session list. Filters: `userId`, `updatedAfter`, `cursor`, `limit`. |
| POST | `/api/sessions/:id/dump` | `wizard-admin` | Enqueue an async tarball export. |
| GET | `/api/sessions/dumps/:dumpId` | `wizard-admin` | Job status (`pending`/`ready`/`failed`/`expired`). |
| GET | `/api/sessions/dumps/:dumpId/download` | `wizard-admin` | Stream the completed tarball. |

### Example — mint and resume

```bash
# 1. Mint
curl -c /tmp/cookies -X POST http://localhost:3000/api/sessions \
  -H 'Content-Type: application/json' -d '{}'
# → { "sessionId": "…", "resumeUrl": "/?session=…", "expiresAt": "…", "version": 1 }

# 2. Later: fetch resume coordinates
curl -b /tmp/cookies http://localhost:3000/api/sessions/<id>/resume
```

### Rate limits

| Route family | Window | Limit |
|---|---|---|
| `POST /api/sessions` | 60 s | 20 per IP |
| `GET /api/sessions/…` (reads) | 60 s | 120 per IP |
| `PATCH /api/sessions/…` | 60 s | 120 per IP |
| `DELETE /api/sessions/…` | 60 s | 10 per IP |
| `GET /api/sessions` (admin) | 60 s | 30 per user |
| `POST /api/sessions/:id/dump` | 60 s | 3 per user |

## Autopilot

Mounted only when `EMBEDIQ_AUTOPILOT_ENABLED=true`. Shared secret
auth: if `EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET` is set, webhook routes
require `X-EmbedIQ-Autopilot-Secret: <value>`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/autopilot/schedules` | (feature) | List all schedules. |
| GET | `/api/autopilot/schedules/:id` | (feature) | One schedule by id. |
| POST | `/api/autopilot/schedules` | (feature) | Create. Body: `{ name, cadence, answerSourcePath, targetDir, targets?, driftAlertThreshold?, complianceFrameworks?, enabled? }`. |
| DELETE | `/api/autopilot/schedules/:id` | (feature) | Delete. |
| GET | `/api/autopilot/runs` | (feature) | Runs list. Query: `scheduleId?`, `limit?`. |
| POST | `/api/autopilot/webhook/:scheduleId` | shared secret | Manual trigger — returns the run record (`202`). |
| POST | `/api/autopilot/compliance/:adapterId` | shared secret | Inbound compliance webhook. `:adapterId` = `drata` / `vanta` / `generic` (or any registered adapter). Returns `202` on match, `200 { skipped }` when adapter ignored payload or no schedule framework matched. |

### Example — create a schedule

```bash
curl -X POST http://localhost:3000/api/autopilot/schedules \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "nightly-hipaa",
    "cadence": "@daily",
    "answerSourcePath": "/ops/hipaa-answers.yaml",
    "targetDir": "/srv/my-project",
    "complianceFrameworks": ["hipaa"]
  }'
```

See [user-guide/08-autopilot.md](../user-guide/08-autopilot.md) and
[user-guide/11-compliance-webhooks.md](../user-guide/11-compliance-webhooks.md)
for full walkthroughs.

## Status codes

Consistent across all endpoints:

| Status | Meaning |
|---|---|
| 200 | Success. |
| 201 | Resource created (session mint, schedule create). |
| 202 | Accepted — async job enqueued (session dumps, autopilot webhook triggers). |
| 400 | Malformed request (bad JSON, missing required field, invalid enum). |
| 401 | Authentication required or failed (auth strategy active, credentials missing/invalid). |
| 403 | Authenticated but not authorized (role missing, session ownership mismatch). |
| 404 | Resource not found. |
| 503 | Feature not enabled (e.g. session persistence when `EMBEDIQ_SESSION_BACKEND=none`). |

## WebSocket

See [websocket-api.md](websocket-api.md) for the event-stream
subscription protocol at `/ws/events`.

## See also

- [CLI reference](cli-reference.md)
- [Configuration reference](configuration.md)
- [Generated files reference](generated-files.md)
- [Audit log schema](audit-log-schema.md)
