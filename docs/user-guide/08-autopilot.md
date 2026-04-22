<!-- audience: public -->

# Autopilot — scheduled drift scans & compliance-triggered runs

Autopilot turns EmbedIQ's drift detector (see
[evaluation and drift](06-evaluation-and-drift.md)) into a scheduled
service: every hour / day / week / month it checks whether your target
project's generated files still match the expected output, and it
records a run for every scan. External systems (Drata, Vanta, CI
pipelines, your own dashboards) can also trigger a run via an HTTP
webhook. When 6H git PR integration is enabled, a future release will
turn "drift detected" into an automatic PR; today autopilot produces an
audit-grade run record you can alert on.

> **When to use this.** You already run `npm run drift` on demand, and
> you want that check to happen on a schedule or fire from a compliance
> platform.

## Enable it

Autopilot is **off by default**. Turn it on:

```bash
export EMBEDIQ_AUTOPILOT_ENABLED=true
npm run start:web
```

Behavior when enabled:

| Env var | Default | Purpose |
|---|---|---|
| `EMBEDIQ_AUTOPILOT_ENABLED` | `false` | Must be `true` to mount the autopilot routes and start the scheduler. |
| `EMBEDIQ_AUTOPILOT_DIR` | `.embediq/autopilot/` | JSON store for schedules and run history. Make it persistent (volume mount) in production. |
| `EMBEDIQ_AUTOPILOT_TICK_MS` | `60000` | How often the scheduler polls for due schedules. |
| `EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET` | — | Optional shared secret. When set, webhooks must pass `X-EmbedIQ-Autopilot-Secret: <value>`. Use this in production. |

## Lifecycle

1. Create a **schedule** that binds an answer set (`answers.yaml`) to a
   target project directory and a cadence.
2. The scheduler fires the schedule when its `nextRunAt` is reached;
   external systems can also fire it via webhook.
3. Each fire produces a **run record** (`success-clean` /
   `success-drifted` / `success-alerting` / `failure`) stored in
   `$EMBEDIQ_AUTOPILOT_DIR/runs.json`.
4. You consume run records by polling `GET /api/autopilot/runs` or by
   subscribing to outbound webhooks (see
   [notification webhooks](10-notification-webhooks.md)).

## REST API

### Create a schedule

```bash
curl -X POST http://localhost:3000/api/autopilot/schedules \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "nightly-hipaa",
    "cadence": "@daily",
    "answerSourcePath": "/ops/hipaa-answers.yaml",
    "targetDir": "/srv/my-project",
    "driftAlertThreshold": 0,
    "complianceFrameworks": ["hipaa"]
  }'
```

Response includes the generated `id` and the computed `nextRunAt`.
Cadences: `@hourly`, `@daily`, `@weekly`, `@monthly` (all UTC in v1 —
see [known limitations](#known-limitations)).

### Fields

| Field | Required | Notes |
|---|---|---|
| `name` | ✅ | Displayed in run records and notifications. |
| `cadence` | ✅ | `@hourly` / `@daily` / `@weekly` / `@monthly`. |
| `answerSourcePath` | ✅ | Path to an `answers.yaml` readable by the server process. |
| `targetDir` | ✅ | Directory whose managed subtrees get scanned. |
| `targets` | — | Output-target filter (default: `claude`). See [multi-agent targets](05-multi-agent-targets.md). |
| `driftAlertThreshold` | — | Run marked `success-alerting` when `totalDrift > threshold`. Defaults to 0 (any drift alerts). |
| `complianceFrameworks` | — | Used by inbound compliance webhooks to decide which schedules to fire. |
| `enabled` | — | Defaults to `true`. Set `false` to pause without deleting. |

### Trigger a run manually

```bash
curl -X POST http://localhost:3000/api/autopilot/webhook/<scheduleId> \
  -H "X-EmbedIQ-Autopilot-Secret: $EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET"
```

Returns the `AutopilotRun` record. Useful for CI pipelines that want to
gate deploys on a clean drift scan.

### List schedules and runs

```bash
curl http://localhost:3000/api/autopilot/schedules
curl 'http://localhost:3000/api/autopilot/runs?scheduleId=<id>&limit=20'
```

### Delete a schedule

```bash
curl -X DELETE http://localhost:3000/api/autopilot/schedules/<id>
```

## Worked example — nightly HIPAA drift

You operate a HIPAA-covered project at `/srv/patient-portal` generated
from `/ops/answers/hipaa.yaml`. You want a nightly scan with alerts on
any drift, plus a webhook that Drata can fire when a HIPAA control
flips to failing.

```bash
# 1. Persistent autopilot state
export EMBEDIQ_AUTOPILOT_ENABLED=true
export EMBEDIQ_AUTOPILOT_DIR=/var/lib/embediq/autopilot
export EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET=$(openssl rand -hex 32)

# 2. Start the server
npm run start:web

# 3. Create the schedule
curl -X POST http://localhost:3000/api/autopilot/schedules \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "patient-portal-nightly",
    "cadence": "@daily",
    "answerSourcePath": "/ops/answers/hipaa.yaml",
    "targetDir": "/srv/patient-portal",
    "driftAlertThreshold": 0,
    "complianceFrameworks": ["hipaa"]
  }'

# 4. Send the webhook URL to Drata; point it to:
#    POST /api/autopilot/compliance/drata
#    Header: X-EmbedIQ-Autopilot-Secret: <secret>
```

When Drata fires a `monitor.failed` event tagged with the `hipaa`
framework, autopilot matches it to `patient-portal-nightly` and runs
the scan — producing a run record within seconds. Pair with
[notification webhooks](10-notification-webhooks.md) to get Slack
alerts on `success-alerting` runs.

## Run statuses

| Status | Meaning | Typical action |
|---|---|---|
| `success-clean` | No drift. | Record and move on. |
| `success-drifted` | Drift detected, below threshold. | Monitor trend; consider lowering threshold. |
| `success-alerting` | Drift detected, above threshold. | Investigate; the target project has diverged from expected. |
| `failure` | Drift scan itself failed (missing answers file, unreachable target). | Fix the underlying issue — no drift conclusion reached. |

## Tuning the alert threshold

`driftAlertThreshold` is the count of drifted entries above which a run
is promoted from `success-drifted` to `success-alerting`. Picking a
value depends on how strict you want to be:

| Threshold | Behavior |
|---|---|
| `0` (default) | Any drift at all alerts. Strictest option — use for regulated projects where every modified file matters. |
| `1–3` | Tolerate a small number of manual edits without paging ops. Useful when teams are allowed to append a custom block to `CLAUDE.md`. |
| `10+` | Only alert on substantial divergence (typical when the target project was originally generated from an older EmbedIQ version). |

## Troubleshooting

- **Scheduler never fires.** Check `EMBEDIQ_AUTOPILOT_ENABLED=true` and
  look at stderr for `Autopilot tick failed`. The scheduler unrefs its
  timer, so a single-process test runner may exit before the first
  tick — call `scheduler.runTick()` directly in tests.
- **Webhook returns 401.** The shared secret is set; supply
  `X-EmbedIQ-Autopilot-Secret` on every webhook POST.
- **Compliance webhook returns `{ skipped: true, reason: "No schedules
  configured for framework …" }`.** The event's framework didn't match
  any schedule's `complianceFrameworks`. Add the framework to the
  schedule you want fired.
- **Run history is capped.** The JSON store keeps the most recent 500
  runs. Export periodically if you need longer retention — poll
  `GET /api/autopilot/runs` from your SIEM or data warehouse.
- **Schedule fires but `failure` with "Target directory does not
  exist".** The server process can't reach `targetDir` (permission or
  path issue). Paths are relative to the server's CWD; absolute paths
  are safer.

## Known limitations (v3.2)

- Cadences are UTC-only. Arbitrary cron expressions and timezone-aware
  scheduling are on the roadmap. Use an external cron job firing the
  manual-trigger webhook if you need finer control today.
- The store is JSON-file backed and single-node. For HA, pin autopilot
  to one replica.
- The autopilot run is a drift scan today. Once
  [git PR integration](09-git-pr-integration.md) is combined with
  autopilot in a future release, `success-alerting` will optionally
  open a PR that restores the generated configuration.

## See also

- [Evaluation and drift](06-evaluation-and-drift.md) — the drift
  detector autopilot wraps
- [Compliance webhooks](11-compliance-webhooks.md) — Drata / Vanta /
  generic adapters
- [Notification webhooks](10-notification-webhooks.md) — Slack / Teams
  alerts on runs
- [REST API reference](../reference/rest-api.md) — full autopilot
  endpoint contract
- [Autopilot architecture](../architecture/autopilot.md) — design
  decisions
