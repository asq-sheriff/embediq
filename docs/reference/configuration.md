<!-- audience: public -->

# Configuration reference

Every environment variable EmbedIQ reads, grouped by subsystem.
Each row lists the canonical name, its default, its type, and a
one-line purpose. **Secrets** (passwords, tokens, signing keys) are
called out explicitly — store them in your secret manager, not in
plaintext ConfigMaps or docker-compose files.

All env vars are **opt-in** — unset variables fall back to sensible
defaults. An EmbedIQ deployment with zero env vars set is a valid,
stateless, offline, unauthenticated local wizard.

## Server runtime

| Env var | Default | Type | Purpose |
|---|---|---|---|
| `PORT` | `3000` | integer | HTTP port the web server binds. |
| `EMBEDIQ_TLS_CERT` | — | path | TLS certificate (PEM). Setting both cert+key enables HTTPS in-process. |
| `EMBEDIQ_TLS_KEY` | — | path **(secret)** | TLS private key (PEM). |

See [operator-guide/deployment.md](../operator-guide/deployment.md).

## Multi-engagement deployment

Optional scoping for self-hosted operators running EmbedIQ as multiple
processes — one per client engagement, project, or workspace — out of
the same checkout.

| Env var | Default | Type | Purpose |
|---|---|---|---|
| `EMBEDIQ_ENGAGEMENT_ID` | — | string | Engagement identifier. When set, default state paths (session dir, sqlite file, autopilot dir) nest under `.embediq/engagements/<id>/`, and audit-log entries are auto-tagged with `engagementId`. Allowed chars: `[a-zA-Z0-9._-]{1,64}`, not all-dots. Explicit `EMBEDIQ_SESSION_DIR` / `EMBEDIQ_SESSION_DB_URL` / `EMBEDIQ_AUTOPILOT_DIR` always win — engagement scoping never modifies operator-set paths. |

One engagement per process; multiple engagements means multiple
processes. Per-request engagement switching is intentionally not
supported.

See [`docs/CONSULTING-FIRM-DEPLOYMENT.md`](../CONSULTING-FIRM-DEPLOYMENT.md)
for the full deployment pattern (directory layout, audit strategies,
out-of-scope clarifications).

## Authentication

| Env var | Default | Type | Purpose |
|---|---|---|---|
| `EMBEDIQ_AUTH_STRATEGY` | (none) | enum | `basic` / `oidc` / `proxy` / `demo` / `none`. Unset = open mode. The `demo` strategy enables the admin/user persona switcher for demo recordings — never for production. |
| `EMBEDIQ_AUTH_USER` | — | string | Basic auth username. Auto-enables `basic` when `EMBEDIQ_AUTH_PASS` is also set. |
| `EMBEDIQ_AUTH_PASS` | — | string **(secret)** | Basic auth password. |
| `EMBEDIQ_OIDC_ISSUER` | — | URL | OIDC issuer URL. Must exactly match the JWT `iss` claim. |
| `EMBEDIQ_OIDC_CLIENT_ID` | — | string | OIDC client id registered with the IdP. |
| `EMBEDIQ_OIDC_CLIENT_SECRET` | — | string **(secret)** | OIDC client secret. |
| `EMBEDIQ_OIDC_ROLES_CLAIM` | `roles` | string | JWT claim path carrying the user's role array. Dotted paths supported. |
| `EMBEDIQ_PROXY_USER_HEADER` | `X-Forwarded-User` | string | Header injected by an identity-aware proxy identifying the user. |
| `EMBEDIQ_PROXY_ROLES_HEADER` | `X-EmbedIQ-Roles` | string | Header carrying a comma-separated role list from the proxy. |

See [operator-guide/authentication.md](../operator-guide/authentication.md).

## Session persistence

With `EMBEDIQ_SESSION_BACKEND=none` (the default) the API is fully stateless — `POST /api/sessions` returns `503 "Session persistence is not enabled"`. The session-dependent features are unavailable until a backend is configured: **interrupt-and-resume**, **multi-contributor `contributedBy` attribution**, and the **versioned profile audit trail** (`GET /api/sessions/:id/profile-history` and the per-generation profile snapshots). For a demo or single node, `EMBEDIQ_SESSION_BACKEND=json-file` (optionally with `EMBEDIQ_SESSION_DIR`) is enough; for multi-replica, use `database` with `EMBEDIQ_SESSION_DB_DRIVER=postgres`. The profile snapshots are also written to the tamper-evident audit chain when `EMBEDIQ_AUDIT_LOG` + `EMBEDIQ_AUDIT_CHAIN_ENABLED=true` are set (see [Observability](#observability)).

| Env var | Default | Type | Purpose |
|---|---|---|---|
| `EMBEDIQ_SESSION_BACKEND` | `none` | enum | `none` / `json-file` / `database` / `redis`. `redis` is reserved. `database` is the multi-node-ready backend (SQLite default; Postgres via `EMBEDIQ_SESSION_DB_DRIVER=postgres`). Must be non-`none` for resume, contributor attribution, and the versioned profile-history. |
| `EMBEDIQ_SESSION_TTL_MS` | `604800000` (7d) | integer | Session lifetime in ms. Clamped to [60 000, 2 592 000 000] (1 min – 30 d). |
| `EMBEDIQ_SESSION_DIR` | `./.embediq/sessions` (or `./.embediq/engagements/<id>/sessions` when [`EMBEDIQ_ENGAGEMENT_ID`](#multi-engagement-deployment) is set) | path | Per-session JSON file directory. Applies only when `EMBEDIQ_SESSION_BACKEND=json-file`. Explicit value always wins over engagement scoping. |
| `EMBEDIQ_SESSION_DB_DRIVER` | `sqlite` | enum | `sqlite` / `postgres`. Applies when `EMBEDIQ_SESSION_BACKEND=database`. Postgres is the multi-node-ready driver — every web replica shares the same session store. SQLite stays single-node. |
| `EMBEDIQ_SESSION_DB_URL` | `./.embediq/sessions.db` (or `./.embediq/engagements/<id>/sessions.db` when [`EMBEDIQ_ENGAGEMENT_ID`](#multi-engagement-deployment) is set) | path or connection string | For `sqlite`: file path (`:memory:` supported for tests). For `postgres`: a libpq connection string (e.g. `postgres://user:pass@host:5432/embediq`) — required, no default. Explicit value always wins over engagement scoping. |
| `EMBEDIQ_SESSION_COOKIE_SECRET` | — | hex string **(secret)** | HMAC-SHA-256 signing key for the `embediq_session_owner` cookie. Required when auth is off. 32 bytes recommended. |
| `EMBEDIQ_SESSION_COOKIE_SECRET_PREV` | — | hex string **(secret)** | Previous cookie signing key accepted during rotation. |
| `EMBEDIQ_SESSION_DATA_KEY` | — | hex string **(secret)** | AES-256-GCM key for payload encryption. 64-character hex (32 bytes). Optional but recommended in production. |
| `EMBEDIQ_SESSION_DATA_KEY_PREV` | — | hex string(s) **(secret)** | Previous data key(s) accepted during rotation. Comma-separated for multi-step rotation. Each entry must be a 64-char hex string. Used for decryption only — new writes always use the active key. See [session rotation runbook](../operator-guide/session-backends.md#rotating-the-payload-encryption-key). |
| `EMBEDIQ_DUMP_DIR` | `./.embediq/dumps` | path | Where admin session-dump tarballs land before download. |

See [operator-guide/session-backends.md](../operator-guide/session-backends.md).

## Autopilot

| Env var | Default | Type | Purpose |
|---|---|---|---|
| `EMBEDIQ_AUTOPILOT_ENABLED` | `false` | boolean | Must be `true` at startup to mount autopilot routes and start the scheduler. |
| `EMBEDIQ_AUTOPILOT_STORE` | `json-file` | enum | `json-file` (single-node, dev convenience — current default) / `database` (**recommended for production**, multi-node-ready via SQLite or Postgres; required for horizontally scaled deployments). |
| `EMBEDIQ_AUTOPILOT_DIR` | `./.embediq/autopilot` (or `./.embediq/engagements/<id>/autopilot` when [`EMBEDIQ_ENGAGEMENT_ID`](#multi-engagement-deployment) is set) | path | JSON store directory (schedules + run history). Applies only when `EMBEDIQ_AUTOPILOT_STORE=json-file`. Mount a persistent volume in production. Explicit value always wins over engagement scoping. |
| `EMBEDIQ_AUTOPILOT_DB_DRIVER` | `sqlite` | enum | `sqlite` / `postgres`. Applies when `EMBEDIQ_AUTOPILOT_STORE=database`. Postgres is the multi-node-ready driver — every scheduler replica claim-and-advances on the shared row. |
| `EMBEDIQ_AUTOPILOT_DB_URL` | `./.embediq/autopilot.db` (or `./.embediq/engagements/<id>/autopilot.db` when [`EMBEDIQ_ENGAGEMENT_ID`](#multi-engagement-deployment) is set) | path or connection string | For `sqlite`: file path (`:memory:` for tests). For `postgres`: a libpq connection string. Auto-creates the `embediq_autopilot_schedules` + `embediq_autopilot_runs` tables on first use. |
| `EMBEDIQ_AUTOPILOT_TICK_MS` | `60000` | integer | Scheduler poll interval. |
| `EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET` | — | string **(secret)** | Shared secret required on `X-EmbedIQ-Autopilot-Secret` header for autopilot + compliance webhooks. |
| `EMBEDIQ_AUTOPILOT_ALERT_FAILURE_STREAK` | `3` | integer | Default consecutive-failure count at which the runner emits a one-shot `autopilot:alerting` event. Per-schedule override via the schedule's `alertOnFailureStreak` field. Set to `0` to disable failure-streak alerting globally. |
| `EMBEDIQ_COMPLIANCE_SECRET_DRATA` | — | string **(secret)** | HMAC-SHA256 signing secret for the Drata adapter. Header `X-Drata-Signature` is verified against `HMAC(secret, raw-body)`. Unset → verification skipped. |
| `EMBEDIQ_COMPLIANCE_SECRET_VANTA` | — | string **(secret)** | Same scheme for Vanta — header `X-Vanta-Signature`. |
| `EMBEDIQ_COMPLIANCE_SECRET_GENERIC` | — | string **(secret)** | Same scheme for the generic adapter — header `X-EmbedIQ-Signature` (accepts bare hex or `sha256=<hex>`). |

Custom adapters follow the same convention: `EMBEDIQ_COMPLIANCE_SECRET_<ADAPTER_ID_UPPERCASED>`.

## v4.0 governance outputs

| Env var | Default | Type | Purpose |
|---|---|---|---|
| `EMBEDIQ_AUDIT_CHAIN_ENABLED` | `false` | boolean | v4.0. When `true` and `EMBEDIQ_AUDIT_LOG` is also set, every audit entry carries a SHA-256 `prevHash` linking it to its predecessor (RFC-6962-pattern linked log). Verify with `npm run verify-audit-log -- --input <path>`. Mixing chain-mode + plain-JSONL entries against the same file produces a broken chain — rotate the file when switching modes. |
| `EMBEDIQ_OSCAL_SSP_PROFILE_HREF` | placeholder | string | v4.0. Stamped into the generated SSP fragment's `import-profile.href`. Operators set this to the operator-owned reference (relative path / URL / `#<uuid>`) so audit-pipeline reviewers can resolve the profile this SSP claims compliance against. |
| `EMBEDIQ_OSCAL_SSP_SYSTEM_NAME` | placeholder | string | v4.0. Stamped into `system-characteristics.system-name` + the SSP's metadata title. Operators set this to the authoritative system name from their authorization paperwork. |
| `EMBEDIQ_OSCAL_SSP_SENSITIVITY` | `fips-199-moderate` | enum | v4.0. FIPS-199 categorization for the system. Valid values: `fips-199-low`, `fips-199-moderate`, `fips-199-high`. Unknown values silently fall back to the default. |

See `docs/operator-guide/audit-chain.md` for the chain-mode threat
model and `docs/extension-guide/exporting-oscal-ssp-fragments.md` for
the SSP fragment's operator-completion checklist.

See [user-guide/08-autopilot.md](../user-guide/08-autopilot.md) and
[user-guide/11-compliance-webhooks.md](../user-guide/11-compliance-webhooks.md).

## Output targets

| Env var | Default | Type | Purpose |
|---|---|---|---|
| `EMBEDIQ_OUTPUT_TARGETS` | `claude` | list | Comma/space-separated list of any of the 16 target tokens — `claude` / `agents-md` / `cursor` / `copilot` / `gemini` / `windsurf` plus the local-AI / RAG / router / governance tokens (`continue-dev`, `aider`, `zed-ai`, `ollama`, `rag-scaffold`, `local-router`, `cyclonedx-aibom`, `oscal-component`, `oscal-ssp-fragment`, `provenance`) — or `all`. Case-insensitive. See [user-guide/05-multi-agent-targets.md](../user-guide/05-multi-agent-targets.md). |

See [user-guide/05-multi-agent-targets.md](../user-guide/05-multi-agent-targets.md).

## Git PR integration

| Env var | Default | Type | Purpose |
|---|---|---|---|
| `EMBEDIQ_GIT_PROVIDER` | `github` | enum | `github`, `gitlab`, `bitbucket`, or `azure-repos`. |
| `EMBEDIQ_GIT_REPO` | — | string | Repository identifier. GitHub: `owner/repo`. GitLab: full project path `group/project` (or `parent-group/sub-group/project`). Bitbucket: `workspace/repo`. Azure Repos: `organization/project/repository`. Required when `--git-pr` is used. |
| `EMBEDIQ_GIT_TOKEN` | — | string **(secret)** | GitHub PAT/fine-grained token (`contents: write`, `pull_requests: write`); GitLab PAT/group/project token (`api` scope); Bitbucket Repository/Workspace Access Token (Bearer auth — app-password Basic is not supported); or an Azure DevOps PAT with **Code (Read & Write)** + **Pull Request** scopes (sent via HTTP Basic with an empty username). |
| `EMBEDIQ_GIT_BASE_BRANCH` | `main` | string | Branch the new branch is forked from and the PR/MR targets. |
| `EMBEDIQ_GIT_API_BASE_URL` | — | URL | Override the API base for self-hosted instances. GitHub Enterprise: `https://git.example.com/api/v3`. Self-hosted GitLab: `https://gitlab.example.com` (the adapter appends `/api/v4`). Bitbucket Cloud always uses `https://api.bitbucket.org`; override only for proxies. Azure DevOps Server: the collection URL, e.g. `https://tfs.example.com/tfs/DefaultCollection` (Azure DevOps Services defaults to `https://dev.azure.com`). |

See [user-guide/09-git-pr-integration.md](../user-guide/09-git-pr-integration.md).

## Outbound notification webhooks

| Env var | Default | Type | Purpose |
|---|---|---|---|
| `EMBEDIQ_WEBHOOK_URLS` | — | list **(secret URLs)** | Comma-separated webhook URLs. Optional per-URL event filter via repeated `?events=…&events=…` query params. Webhook URLs from Slack/Teams/etc. carry secret path components — treat like secrets. |
| `EMBEDIQ_WEBHOOK_FORMAT` | (auto) | enum | `slack` / `teams` / `generic`. Overrides host-based auto-detection. |

See [user-guide/10-notification-webhooks.md](../user-guide/10-notification-webhooks.md).

## Observability

| Env var | Default | Type | Purpose |
|---|---|---|---|
| `EMBEDIQ_AUDIT_LOG` | — | path | JSONL audit-log file path. Writer is a no-op when unset. |
| `EMBEDIQ_OTEL_ENABLED` | `false` | boolean | `true` → load the OpenTelemetry SDK at startup and export OTLP traces + metrics. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | URL | Base URL used for both traces and metrics unless the per-signal vars below are set. |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | (derived) | URL | Traces endpoint override. Defaults to `<base>/v1/traces`. |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | (derived) | URL | Metrics endpoint override. Defaults to `<base>/v1/metrics`. |

See [operator-guide/observability.md](../operator-guide/observability.md).

## Evaluation

| Env var | Default | Type | Purpose |
|---|---|---|---|
| `EMBEDIQ_COMMIT_SHA` | — | string | Optional git SHA recorded in evaluation/benchmark reports' `meta.commitSha` for provenance. Normally set by CI. |

See [user-guide/06-evaluation-and-drift.md](../user-guide/06-evaluation-and-drift.md).

## Extension loading

| Env var | Default | Type | Purpose |
|---|---|---|---|
| `EMBEDIQ_PLUGINS_DIR` | `./plugins` | path | External domain-pack directory. Subdirectories / `*.js` / `*.mjs` files with a default export matching `DomainPack` load at startup. |
| `EMBEDIQ_SKILLS_DIR` | `./skills` | path | External skills directory. Each subdirectory containing a `SKILL.md` file becomes a registered skill. |
| `EMBEDIQ_TEMPLATES_DIR` | `./templates` | path | Profile template directory. YAML files here surface via `GET /api/templates`. |

See [extension-guide/](../extension-guide/).

## Related pointers

- [Security model](../../SECURITY.md) — which of the above are
  secrets, how each is used cryptographically, and the recommended
  rotation procedure.
- [`docker-compose.yml`](../../docker-compose.yml) — example of
  threading env vars through to the container.
- [`k8s/configmap.yaml`](../../k8s/configmap.yaml) — non-secret
  baseline; pair with a `Secret` manifest for the secret vars above.

## Discovering every `process.env` read

This table is regenerated by grepping the source. Out-of-band
changes without updating this doc are caught by the proposed
`make docs-check`. The canonical grep:

```bash
grep -rn "process\.env\.\(EMBEDIQ_[A-Z_]*\|OTEL_[A-Z_]*\|PORT\)" src/
```
