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

## Authentication

| Env var | Default | Type | Purpose |
|---|---|---|---|
| `EMBEDIQ_AUTH_STRATEGY` | (none) | enum | `basic` / `oidc` / `proxy` / `none`. Unset = open mode. |
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

| Env var | Default | Type | Purpose |
|---|---|---|---|
| `EMBEDIQ_SESSION_BACKEND` | `none` | enum | `none` / `json-file` / `database` / `redis`. `redis` is reserved; `database` + `postgres` driver is reserved. |
| `EMBEDIQ_SESSION_TTL_MS` | `604800000` (7d) | integer | Session lifetime in ms. Clamped to [60 000, 2 592 000 000] (1 min – 30 d). |
| `EMBEDIQ_SESSION_DIR` | `./.embediq/sessions` | path | Per-session JSON file directory. Applies only when `EMBEDIQ_SESSION_BACKEND=json-file`. |
| `EMBEDIQ_SESSION_DB_DRIVER` | `sqlite` | enum | `sqlite` / `postgres` (reserved). Applies when `EMBEDIQ_SESSION_BACKEND=database`. |
| `EMBEDIQ_SESSION_DB_URL` | `./.embediq/sessions.db` | path | SQLite file path. `:memory:` is supported for tests. |
| `EMBEDIQ_SESSION_COOKIE_SECRET` | — | hex string **(secret)** | HMAC-SHA-256 signing key for the `embediq_session_owner` cookie. Required when auth is off. 32 bytes recommended. |
| `EMBEDIQ_SESSION_COOKIE_SECRET_PREV` | — | hex string **(secret)** | Previous cookie signing key accepted during rotation. |
| `EMBEDIQ_SESSION_DATA_KEY` | — | hex string **(secret)** | AES-256-GCM key for payload encryption. 64-character hex (32 bytes). Optional but recommended in production. |
| `EMBEDIQ_DUMP_DIR` | `./.embediq/dumps` | path | Where admin session-dump tarballs land before download. |

See [operator-guide/session-backends.md](../operator-guide/session-backends.md).

## Autopilot

| Env var | Default | Type | Purpose |
|---|---|---|---|
| `EMBEDIQ_AUTOPILOT_ENABLED` | `false` | boolean | Must be `true` at startup to mount autopilot routes and start the scheduler. |
| `EMBEDIQ_AUTOPILOT_DIR` | `./.embediq/autopilot` | path | JSON store directory (schedules + run history). Mount a persistent volume in production. |
| `EMBEDIQ_AUTOPILOT_TICK_MS` | `60000` | integer | Scheduler poll interval. |
| `EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET` | — | string **(secret)** | Shared secret required on `X-EmbedIQ-Autopilot-Secret` header for autopilot + compliance webhooks. |
| `EMBEDIQ_COMPLIANCE_SECRET_DRATA` | — | string **(secret)** | HMAC-SHA256 signing secret for the Drata adapter. Header `X-Drata-Signature` is verified against `HMAC(secret, raw-body)`. Unset → verification skipped. |
| `EMBEDIQ_COMPLIANCE_SECRET_VANTA` | — | string **(secret)** | Same scheme for Vanta — header `X-Vanta-Signature`. |
| `EMBEDIQ_COMPLIANCE_SECRET_GENERIC` | — | string **(secret)** | Same scheme for the generic adapter — header `X-EmbedIQ-Signature` (accepts bare hex or `sha256=<hex>`). |

Custom adapters follow the same convention: `EMBEDIQ_COMPLIANCE_SECRET_<ADAPTER_ID_UPPERCASED>`.

See [user-guide/08-autopilot.md](../user-guide/08-autopilot.md) and
[user-guide/11-compliance-webhooks.md](../user-guide/11-compliance-webhooks.md).

## Output targets

| Env var | Default | Type | Purpose |
|---|---|---|---|
| `EMBEDIQ_OUTPUT_TARGETS` | `claude` | list | Comma/space-separated list of `claude` / `agents-md` / `cursor` / `copilot` / `gemini` / `windsurf`, or `all`. Case-insensitive. |

See [user-guide/05-multi-agent-targets.md](../user-guide/05-multi-agent-targets.md).

## Git PR integration

| Env var | Default | Type | Purpose |
|---|---|---|---|
| `EMBEDIQ_GIT_PROVIDER` | `github` | enum | `github`, `gitlab`, or `bitbucket`. |
| `EMBEDIQ_GIT_REPO` | — | string | Repository identifier. GitHub: `owner/repo`. GitLab: full project path `group/project` (or `parent-group/sub-group/project`). Bitbucket: `workspace/repo`. Required when `--git-pr` is used. |
| `EMBEDIQ_GIT_TOKEN` | — | string **(secret)** | GitHub PAT/fine-grained token (`contents: write`, `pull_requests: write`); GitLab PAT/group/project token (`api` scope); or Bitbucket Repository/Workspace Access Token (Bearer auth — app-password Basic is not supported). |
| `EMBEDIQ_GIT_BASE_BRANCH` | `main` | string | Branch the new branch is forked from and the PR/MR targets. |
| `EMBEDIQ_GIT_API_BASE_URL` | — | URL | Override the API base for self-hosted instances. GitHub Enterprise: `https://git.example.com/api/v3`. Self-hosted GitLab: `https://gitlab.example.com` (the adapter appends `/api/v4`). Bitbucket Cloud always uses `https://api.bitbucket.org`; override only for proxies. |

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
