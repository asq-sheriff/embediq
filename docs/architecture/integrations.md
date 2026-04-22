<!-- audience: public -->

# Architecture — integrations

Everything under `src/integrations/` — the outward-facing connectors
that let EmbedIQ's pipeline interact with the rest of the world
without embedding external assumptions into the core.

**Source**: [`src/integrations/`](../../src/integrations/).

- `git/` — GitHub PR integration.
- `webhooks/` — outbound notification formatters.
- `compliance/` — inbound compliance platform adapters.

Each integration lives behind an interface that the CLI / web server
consumes; adding a new platform is a new file implementing the
interface, not a diff across the codebase.

## Git platform (`src/integrations/git/`)

```
GitPlatform (interface)
   │
   ├── createBranchWithFiles(branchName, files, message)
   └── openPullRequest(branchName, title, body)
        │
        ▼
   GitPullRequestRef  { url, number, title, branch }

GitHubAdapter implements GitPlatform
   Uses GitHub REST v3 Git Data API:
     GET  /git/ref/heads/:baseBranch   → base SHA
     GET  /git/commits/:sha            → base tree SHA
     POST /git/blobs                   × N              (one per file)
     POST /git/trees                   → new tree
     POST /git/commits                 → new commit
     POST|PATCH /git/refs              → create or move branch
     POST /pulls                       → open PR
```

Why Git Data API rather than shelling out to `git`? **Atomic
multi-file commits without a working tree.** No local clone, no temp
dir, no dirty-state cleanup if the CLI crashes mid-flow. GitHub
reference-counts blob objects, so an incomplete commit leaves
orphans that are garbage-collected rather than visible.

### `openPrForGeneration` — the orchestrator

Higher-level wrapper that:

1. Resolves a `GitPlatform` from `config.provider` +
   `config.platformOptions` (or from env via
   `resolveGitConfigFromEnv`).
2. Builds a PR template via `buildPrTemplate(input)` —
   Summary / Changes (grouped by generator) / Validation /
   Contributors (from 6C session data) / Drift (from 6E autopilot).
3. Names the branch (`embediq/<UTC-YYYYMMDD-HHMMSS>` by default).
4. Commits every file atomically.
5. Opens the PR.
6. Returns `{ pullRequest, branchName, fileCount }`.

Errors wrap as `GitIntegrationError` (with HTTP status when
available) or `GitConfigurationError` (bad config). Both are
exported so CLI callers can distinguish "fix the env var" from
"GitHub is down."

### Provider coverage

GitHub, GitLab, and Bitbucket are all first-class. The
`GitPlatform` interface (createBranchWithFiles + openPullRequest)
is platform-agnostic — each adapter is a ~300-line file that
translates the two operations into the platform's REST API.

Per-platform mechanics worth noting:

**GitHub** — Git Data API: separate blob/tree/commit primitives;
new branch via `POST /git/refs`, existing branch via
`PATCH /git/refs/heads/<name>`.

**GitLab** —
- Atomic multi-file commit via `POST /repository/commits` with a
  single `actions[]` array (no separate blob/tree/commit calls).
- Per-action mode is `create` or `update` (no upsert), so the
  adapter pre-walks the base-branch tree once and classifies each
  file accordingly. Empty repo / missing base ref → all `create`.
- Branch idempotency is delete-then-recreate to mirror GitHub's
  ref-move semantic; without that, a second commit on the same
  branch name would stack on top of the previous one rather than
  reset to base.
- Project path is URL-encoded once at construction so callers can
  pass the human-readable `group/sub-group/project` form rather
  than numeric project ids.
- Self-hosted GitLab honours `EMBEDIQ_GIT_API_BASE_URL`
  (e.g. `https://gitlab.example.com`) the same way the GitHub
  adapter handles GitHub Enterprise.

**Bitbucket** —
- Atomic multi-file commit via `POST /2.0/repositories/.../src`
  with `multipart/form-data` where each form field's **name is the
  file path** and its value is the file content. Branch creation
  and the commit happen in the same call when the branch doesn't
  yet exist.
- Branch idempotency uses the same delete-then-recreate pattern as
  the GitLab adapter so that a re-run of PR mode against an
  existing autopilot branch resets to base rather than appending.
- Base-branch HEAD is fetched once via the `refs/branches/<name>`
  endpoint and threaded through as the `parents` field on the
  `/src` call.
- Auth is Bearer with a Bitbucket Repository Access Token or
  Workspace Access Token. App-password Basic auth is legacy and
  not supported — Bearer keeps the auth-header convention
  identical across all three adapters.

## Outbound webhooks (`src/integrations/webhooks/`)

```
WebhookFormatter (interface)
   │
   └── format(env: EventEnvelope) → WebhookPayload | null
        │
        ▼
   WebhookPayload  { contentType, body }

Built-in formatters:
   slackFormatter     (Block Kit;  auto-detect: hooks.slack.com)
   teamsFormatter     (MessageCard; auto-detect: outlook.office.com)
   genericFormatter   (JSON envelope; fallback)

WebhookSubscriber — consumes EventBus
   Parses EMBEDIQ_WEBHOOK_URLS
   Per-URL: detectFormat(url) + optional ?events= filter
   On every event: for each target, format(env) and POST
     AbortController timeout (3 s default)
     Per-target failure isolation, no retries
```

### Design constraints

- **Fire-and-forget.** The subscriber never blocks the emitting
  code path. A slow Slack endpoint doesn't slow the wizard.
- **Pure formatters.** `format()` takes an `EventEnvelope`, returns
  a payload or `null`. No I/O, no state.
- **Auto-detection over configuration.** A Slack URL doesn't need
  `format=slack` — the host suffix drives the default. Override via
  `EMBEDIQ_WEBHOOK_FORMAT` when needed.
- **Opt-in events.** Only the four "chat-worthy" events
  (`generation:started`, `validation:completed`, `session:started`,
  `session:completed`) format to platform payloads by default.
  High-frequency wizard events (`question:presented`, etc.) fall
  through to the generic JSON envelope when a URL opts in via
  `?events=`.

## Compliance (`src/integrations/compliance/`)

```
ComplianceEventAdapter (interface)
   │
   └── translate({ body, headers }) → ComplianceEvent | null

Built-in adapters:
   drataAdapter     (maps monitor.failed / finding.opened → gap_opened)
   vantaAdapter     (maps test.failing / observation.* → gap_opened)
   genericComplianceAdapter  (accepts canonical { framework, action, … })

ComplianceAdapterRegistry
   register(adapter)
   get(id)
   list()  (sorted by id)

POST /api/autopilot/compliance/:adapterId
   1. Look up adapter by :adapterId
   2. adapter.translate({ body, headers })
   3. If null → 200 { skipped, reason: "Adapter ignored" }
   4. For each schedule matching event.framework → runAutopilot(...)
   5. 202 { event, runs } or 200 { skipped, reason: "No schedules..." }
```

### Canonical `ComplianceEvent`

```ts
interface ComplianceEvent {
  source: string;       // adapter id
  framework: string;    // normalized EmbedIQ id (hipaa / soc2 / pci / ...)
  action: 'gap_opened' | 'gap_resolved' | 'other';
  controlId?: string;
  findingId?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  title?: string;
  rawPayload: unknown;
}
```

Framework normalization is the load-bearing piece — each adapter
converts its platform's identifier vocabulary (`soc_2`, `pci-dss`,
`iso_27001`) to EmbedIQ's canonical keys (`soc2`, `pci`, `iso27001`).
Schedules match on the canonical keys, not the platform's raw
string.

### Why adapters rather than one giant switch?

- **Platform-shaped parsing.** Drata's `event` + `data.control`
  lives at different paths than Vanta's `type` + `data.test`. An
  adapter owns its platform's wire format.
- **Custom adapters.** Operators can register a Secureframe or
  AWS Audit Manager adapter without forking EmbedIQ. See
  [extension-guide/writing-compliance-adapters.md](../extension-guide/writing-compliance-adapters.md).
- **Signed-payload verification.** Platforms that sign webhook
  bodies (HMAC) can verify inside `translate()` against a header in
  `input.headers` — return `null` on mismatch.

## Security posture (shared across all integrations)

- **Inbound-webhook auth (two layers, independently configurable).**
  `EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET` gates both autopilot and
  compliance routes via the `X-EmbedIQ-Autopilot-Secret` header.
  In addition, each compliance adapter can verify the platform's
  own HMAC-SHA256 signature when its
  `EMBEDIQ_COMPLIANCE_SECRET_<ADAPTER>` env var is set — Drata's
  `X-Drata-Signature`, Vanta's `X-Vanta-Signature`, the generic
  adapter's `X-EmbedIQ-Signature`. Constant-time compare, raw body
  captured by `express.json({ verify })`. Mismatch → 401. Both
  layers must pass when both are configured. Outbound webhook URLs
  carry their own secret path components (Slack/Teams incoming
  webhook URLs are credentials by design — treat them like any
  secret).
- **Token scope tight.** GitHub PR integration requires
  `contents: write` + `pull_requests: write`; avoid PATs with
  broader scope.
- **No automatic outbound.** Every integration requires an explicit
  env var or CLI flag.

See [SECURITY.md](../../SECURITY.md) for the threat matrix.

## Where each integration plugs in

| Integration | Consumes | Called from |
|---|---|---|
| Git PR | `GeneratedFile[]` + profile/validation/session context | CLI `--git-pr` in `src/index.ts`; future autopilot PR mode |
| Outbound webhooks | `EventEnvelope` (via the bus) | `WebhookSubscriber` auto-registered by `registerDefaultSubscribers` |
| Compliance webhooks | HTTP POST body | `POST /api/autopilot/compliance/:adapterId` route |

None of them are in the synthesizer's hot path — they're orthogonal
consumers of the same data the core produces.

## See also

- [Git PR user guide](../user-guide/09-git-pr-integration.md)
- [Notification webhooks user guide](../user-guide/10-notification-webhooks.md)
- [Compliance webhooks user guide](../user-guide/11-compliance-webhooks.md)
- [Extension guides](../extension-guide/) — adding custom adapters
- [`src/integrations/`](../../src/integrations/) — source
