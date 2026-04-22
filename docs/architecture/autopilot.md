<!-- audience: public -->

# Architecture — autopilot

The autopilot subsystem automates the drift scans the CLI's
`npm run drift` does interactively: cron-like schedules run drift
checks on a cadence, external compliance platforms trigger runs via
webhook, and every scan records an audit-grade run record.

**Source**: [`src/autopilot/`](../../src/autopilot/). Web routes live
in [`src/web/server.ts`](../../src/web/server.ts) under
`/api/autopilot/`.

For operator enablement, see
[user-guide/08-autopilot.md](../user-guide/08-autopilot.md). For the
compliance webhook side, see
[user-guide/11-compliance-webhooks.md](../user-guide/11-compliance-webhooks.md).

## Components

```
┌──────────────────────────────────────────────────────────────┐
│  AutopilotScheduler   — periodic tick, runs every 60 s       │
│       │                                                      │
│       ▼                                                      │
│  JsonAutopilotStore   — schedules + runs persisted to disk   │
│       │                                                      │
│       ▼                                                      │
│  runAutopilot(schedule, store, {trigger})                    │
│       │                                                      │
│       ▼                                                      │
│  detectDrift(...)    — shared with the drift CLI             │
│       │                                                      │
│       ▼                                                      │
│  AutopilotRun (success-clean / -drifted / -alerting / -fail) │
│       │                                                      │
│       ▼                                                      │
│  store.recordRun   + store.updateSchedule(lastRunAt, next)   │
└──────────────────────────────────────────────────────────────┘
```

## `AutopilotSchedule`

```ts
interface AutopilotSchedule {
  id: string;
  name: string;
  cadence: '@hourly' | '@daily' | '@weekly' | '@monthly';
  answerSourcePath: string;              // YAML answers file path
  targetDir: string;                     // scanned project
  targets?: TargetFormat[];              // output-target filter
  driftAlertThreshold?: number;          // promote 'drifted' to 'alerting' above this
  complianceFrameworks?: readonly string[];  // inbound-webhook matching
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt: string;
}
```

### Cadence presets (UTC)

v1 ships four presets only. Arbitrary cron expressions + timezone
support are roadmap items.

| Cadence | `nextRunAt` math after `from` |
|---|---|
| `@hourly` | `from + 60 min` |
| `@daily` | next UTC midnight |
| `@weekly` | next UTC Monday 00:00 (always rolls forward a full week when `from` is already Monday) |
| `@monthly` | first of next UTC month at 00:00 |

`isDue(schedule, now)` = `schedule.enabled && now ≥ schedule.nextRunAt`.

## `AutopilotRun`

```ts
interface AutopilotRun {
  id: string;
  scheduleId: string;
  trigger: 'cron' | 'webhook' | 'manual';
  startedAt: string;
  completedAt: string;
  status: 'success-clean' | 'success-drifted' | 'success-alerting' | 'failure';
  driftSummary?: {
    match: number;
    missing: number;
    modifiedByUser: number;
    modifiedStaleStamp: number;
    versionMismatch: number;
    extra: number;
    totalDrift: number;
  };
  error?: string;
}
```

Status classification inside `runAutopilot`:

- `totalDrift === 0` → `success-clean`.
- `totalDrift > 0` and `totalDrift > driftAlertThreshold` →
  `success-alerting`.
- `totalDrift > 0` and within threshold → `success-drifted`.
- Thrown error → `failure` with the message captured in `error`.

## `JsonAutopilotStore` — single-node persistence

Two JSON files under `EMBEDIQ_AUTOPILOT_DIR`:

- `schedules.json` — full schedule list.
- `runs.json` — run history, capped at the most recent 500 entries
  (older evicted on each append).

Writes use temp-file + atomic rename so a crash between writes never
corrupts the file. Single-process only — multi-node needs an
external adapter (SQL, Redis, DynamoDB) that implements the same
method set (`listSchedules`, `addSchedule`, `updateSchedule`,
`deleteSchedule`, `recordRun`, `listRuns`).

## `AutopilotScheduler` — periodic ticks

```ts
class AutopilotScheduler {
  constructor(options: SchedulerOptions);
  start(): void;                // setInterval every tickMs (default 60_000)
  stop(): void;
  async runTick(): Promise<void>;   // single tick, exposed for tests
}
```

Tick logic:

1. `const due = (await store.listSchedules()).filter(s => isDue(s, now()))`.
2. For each due schedule, call `runAutopilot(schedule, store, { trigger: 'cron' })`
   sequentially (no parallel — the JSON store would race).
3. `runAutopilot` itself updates `lastRunAt` + `nextRunAt` and
   records the run.

Concurrent ticks are serialized — a second tick while the first is
still running is a no-op. Node's `setInterval` is `unref`'d so
autopilot never holds the event loop open for graceful shutdown.

## Webhook triggers

Two routes, both opt-in via `EMBEDIQ_AUTOPILOT_ENABLED=true`:

| Route | Trigger source |
|---|---|
| `POST /api/autopilot/webhook/:scheduleId` | Direct manual trigger / CI pipeline. |
| `POST /api/autopilot/compliance/:adapterId` | External compliance platform (Drata, Vanta, generic). |

Shared secret guard: when `EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET` is set,
both routes require `X-EmbedIQ-Autopilot-Secret`. No HMAC signature
check on body yet — roadmap item.

### Compliance route — framework matching

1. Adapter registry (`defaultComplianceRegistry` or operator-supplied)
   looks up `:adapterId` (drata / vanta / generic / custom).
2. Adapter's `translate({ body, headers })` produces a
   `ComplianceEvent` (or `null` — the route responds 200/skipped).
3. The route iterates `store.listSchedules()`, keeps schedules where
   `enabled && complianceFrameworks.includes(event.framework)`.
4. For each match, `runAutopilot(schedule, store, { trigger: 'webhook' })`.
5. Returns `202 { event, runs: [...] }` on match or
   `200 { skipped: true, reason: "No schedules configured for framework <x>" }`.

## Failure isolation

- `runAutopilot` **never throws**. Drift-detection errors become
  `failure` runs; unexpected errors are caught and recorded.
- The scheduler's tick loop catches any unexpected throw from
  `runAutopilot` and logs to stderr, but continues processing the
  remaining due schedules.
- Store writes are best-effort — a failed write logs, doesn't
  cancel the rest of the run flow.

## Integration surface

The runner is designed so a future iteration can swap the drift
scan for a full regeneration + PR opening. When that lands,
`success-alerting` runs will optionally call `openPrForGeneration`
(see [integrations.md](integrations.md)) to put a PR in front of
reviewers — the scheduled compliance feedback loop.

The `ComplianceEvent` data already flows through to `runAutopilot`
as context, so the PR body can carry the originating Drata/Vanta
finding.

## Known limitations

- UTC-only cadences; no arbitrary cron, no timezone awareness.
- Single-node JSON-file store; no HA adapter.
- Run history capped at 500 — integrate with a durable log if you
  need longer retention (poll `GET /api/autopilot/runs` and archive
  to S3 / data warehouse).
- No HMAC signature verification on inbound webhook bodies; shared
  secret only.

All are called out in [user-guide/08-autopilot.md](../user-guide/08-autopilot.md).

## See also

- [Autopilot user guide](../user-guide/08-autopilot.md)
- [Compliance webhooks user guide](../user-guide/11-compliance-webhooks.md)
- [Evaluation architecture](evaluation.md) — the drift detector
  autopilot wraps
- [`src/autopilot/`](../../src/autopilot/) — source
