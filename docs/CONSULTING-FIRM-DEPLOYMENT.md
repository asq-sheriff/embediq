<!-- audience: public -->

# Per-Engagement Deployment Pattern

A documented convention for running EmbedIQ as a self-hosted tool with isolated
state per client engagement. Targets consulting firms, systems integrators, and
any organization that needs the same EmbedIQ codebase to maintain disjoint
session, autopilot, and audit state across multiple concurrent projects.

One engagement per process. Multiple engagements means multiple processes,
each with its own `EMBEDIQ_ENGAGEMENT_ID`. There is no shared control plane,
no admin UI, and no per-request engagement switching — those are tracked under
"Multi-Tenant SaaS — Out of Scope for v3.x" in the roadmap.

## What gets scoped

When `EMBEDIQ_ENGAGEMENT_ID` is set, the following **default** state paths nest
under `.embediq/engagements/<id>/`:

| Default path | Scoped path |
|---|---|
| `.embediq/sessions` (json-file backend) | `.embediq/engagements/<id>/sessions` |
| `.embediq/sessions.db` (sqlite backend) | `.embediq/engagements/<id>/sessions.db` |
| `.embediq/autopilot` (schedules + runs) | `.embediq/engagements/<id>/autopilot` |

Audit log entries (`EMBEDIQ_AUDIT_LOG`) are auto-tagged with `engagementId`
in the JSONL output — see the audit strategy section below.

**Explicit env-var paths always win.** If you set `EMBEDIQ_SESSION_DIR`,
`EMBEDIQ_AUTOPILOT_DIR`, or `EMBEDIQ_SESSION_DB_URL` explicitly, engagement
scoping does not modify them. The operator is in control.

## What does *not* get scoped

These are shared inputs that you usually want to keep identical across
engagements:

- `templates/*.yaml` — pre-filled answer templates
- `EMBEDIQ_SKILLS_DIR` — composable skills directory
- `EMBEDIQ_PLUGINS_DIR` — external domain pack plugins
- Generator implementations (built into the codebase)
- stdout / stderr logs (use process-level redirection if you want per-engagement files)

This is by design: a consulting firm's reusable IP (skills, templates, plugins)
compounds across engagements. The boundary is *state*, not *IP*.

## Reference archetype

`tests/fixtures/golden-configs/consulting-engagement-default/` ships
as a starting point — developer role, SaaS industry, SOC 2 obligations,
balanced security tier, multi-agent target set (Claude + AGENTS.md +
Cursor). Generate a scorecard for it with:

```bash
npm run evaluate -- --archetype consulting-engagement-default \
  --format scorecard \
  --out /deliverables/{client}/scorecard.html \
  --scorecard-title "{Client} — Engagement AI Harness Score"
```

Override its answer set per engagement to model client-specific
requirements before deployment.

## Minimum viable setup

```bash
# Engagement A — start in its own process
EMBEDIQ_ENGAGEMENT_ID=eng-alpha \
EMBEDIQ_SESSION_BACKEND=json-file \
EMBEDIQ_AUTOPILOT_ENABLED=true \
EMBEDIQ_AUDIT_LOG=./logs/eng-alpha-audit.jsonl \
PORT=3001 npm run start:web

# Engagement B — separate process, separate port, separate state
EMBEDIQ_ENGAGEMENT_ID=eng-beta \
EMBEDIQ_SESSION_BACKEND=json-file \
EMBEDIQ_AUTOPILOT_ENABLED=true \
EMBEDIQ_AUDIT_LOG=./logs/eng-beta-audit.jsonl \
PORT=3002 npm run start:web
```

After both processes have run a generation, the layout on disk is:

```
.embediq/
├── engagements/
│   ├── eng-alpha/
│   │   ├── sessions/
│   │   └── autopilot/
│   │       ├── schedules.json
│   │       └── runs.json
│   └── eng-beta/
│       ├── sessions/
│       └── autopilot/
│           ├── schedules.json
│           └── runs.json
```

## Engagement-ID rules

- Allowed characters: letters, digits, `.`, `_`, `-`
- Maximum length: 64 characters
- Not all-dots (`.` and `..` are rejected)
- No path separators, traversal sequences, or shell-special characters

Invalid IDs fail fast at startup with a clear error message. There is no
silent fallback.

## Audit log strategy

Two patterns, both supported. Pick whichever fits your operational model.

### Pattern 1 — per-engagement file (recommended for client deliverables)

```bash
EMBEDIQ_AUDIT_LOG=./logs/eng-alpha-audit.jsonl
EMBEDIQ_AUDIT_LOG=./logs/eng-beta-audit.jsonl
```

Each engagement writes to a separate JSONL file. Easy to hand a client the
audit trail for their engagement at the end. Entries still carry
`engagementId` for cross-checking.

### Pattern 2 — shared file with `engagementId` tag (recommended for ops)

```bash
EMBEDIQ_AUDIT_LOG=/var/log/embediq/audit.jsonl   # shared across processes
```

All processes append to the same file. Every entry is tagged with
`engagementId` from the process's `EMBEDIQ_ENGAGEMENT_ID`. Filter with `jq`:

```bash
# All entries for engagement alpha
jq -c 'select(.engagementId == "eng-alpha")' < /var/log/embediq/audit.jsonl

# File-write events grouped by engagement
jq -c 'select(.eventType == "file_written") | {engagementId, filePath}' \
   < /var/log/embediq/audit.jsonl
```

The audit log uses `appendFileSync`, which is safe across concurrent
processes on POSIX filesystems — last-write wins at the line level, but
individual lines are never interleaved.

## Git PR identity per engagement

Each process gets its own git credentials by setting `EMBEDIQ_GIT_REPO` and
`EMBEDIQ_GIT_TOKEN` per process. Useful when each engagement targets a
different client repository:

```bash
EMBEDIQ_ENGAGEMENT_ID=eng-alpha \
EMBEDIQ_GIT_REPO=client-a-org/their-repo \
EMBEDIQ_GIT_TOKEN=ghp_xxx_for_client_a \
npm start -- --git-pr
```

## Migration

Zero migration cost. Unset `EMBEDIQ_ENGAGEMENT_ID` and EmbedIQ behaves
identically to its pre-scoping default. Existing single-process deployments
keep their `.embediq/sessions` and `.embediq/autopilot` directories in place.

## What this pattern is *not*

- **Not a multi-tenant control plane.** No cross-engagement admin UI,
  no engagement-level RBAC, no engagement directory.
- **Not per-request scoping.** Engagement is set once at process start.
  An incoming HTTP request cannot select a different engagement via header
  or query parameter.
- **Not enforced isolation.** A misconfigured `EMBEDIQ_SESSION_DIR` pointing
  at a shared directory will leak state. Operators are responsible for
  keeping per-process env vars correctly scoped.
- **Not a substitute for OS-level isolation.** If you need defense-in-depth,
  run each engagement in its own container or VM with its own filesystem.

When all three of (a) v3.3 evaluation data, (b) v4.0 provider abstraction, and
(c) commercial validation supporting hosted multi-tenant land, this pattern
will be superseded by a real SaaS control plane — see "Multi-Tenant SaaS"
in the roadmap.
