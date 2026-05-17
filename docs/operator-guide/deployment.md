<!-- audience: public -->

# Deployment

EmbedIQ ships a `Dockerfile`, a `docker-compose.yml`, and a `k8s/`
manifest tree suitable for most production shapes. This guide covers:

- Running the web server directly, in Docker, or in Kubernetes.
- TLS termination (in-process or at a reverse proxy).
- Port, health probe, and resource sizing.
- What's safe to expose, what must be private.

For authentication and session persistence, see the dedicated guides:
[`authentication.md`](authentication.md) and
[`session-backends.md`](session-backends.md).

## Prerequisites

- Node.js 18+ (the runtime image ships Node 22).
- (Optional) Docker 24+ and/or a Kubernetes cluster.
- (Optional) TLS cert + key if you terminate TLS in-process rather than
  at a reverse proxy.

## Running directly

```bash
npm ci           # deterministic install using package-lock.json
npm run build    # tsc → dist/
PORT=3000 node dist/web/server.js
```

The server binds `0.0.0.0:$PORT` (default 3000). Put it behind a
reverse proxy (nginx, Caddy, ingress-nginx, AWS ALB, CloudFront, etc.)
for production.

## Docker — single container

```bash
docker build -t embediq:latest .
docker run --rm -p 3000:3000 embediq:latest
```

What the image contains:

- Multi-stage build: `node:22-alpine` (build stage) → `node:22-alpine`
  (runtime stage).
- Non-root user `embediq` (uid/gid 101 or similar, assigned by
  `adduser -S`).
- `dist/` (compiled JS), `node_modules/` (production deps from
  `npm ci`), `templates/` (profile templates shipped in-tree), and
  the static web assets from `src/web/public/`.
- Exposed port: `3000`. Default `NODE_ENV=production`.

The image has **no mutable state** on disk. If you enable audit logs,
session persistence, or autopilot, mount the relevant directory as a
volume:

```bash
docker run --rm -p 3000:3000 \
  -e EMBEDIQ_AUDIT_LOG=/var/log/embediq/audit.jsonl \
  -v embediq-audit:/var/log/embediq \
  embediq:latest
```

## docker-compose

The shipped [`docker-compose.yml`](../../docker-compose.yml) runs one
service with an `audit-logs` named volume:

```bash
# Override port
PORT=8080 docker compose up -d

# With auth
EMBEDIQ_AUTH_STRATEGY=basic \
  EMBEDIQ_AUTH_USER=admin \
  EMBEDIQ_AUTH_PASS=$(openssl rand -hex 16) \
  docker compose up -d

# With OpenTelemetry
EMBEDIQ_OTEL_ENABLED=true \
  OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318 \
  docker compose up -d
```

## Kubernetes

The shipped [`k8s/`](../../k8s/) tree has:

- `configmap.yaml` — non-secret env vars.
- `deployment.yaml` — `replicas: 1` by default, liveness on `/health`,
  readiness on `/ready`, resource requests `128Mi / 100m` and limits
  `512Mi / 500m`.
- `service.yaml` — `ClusterIP` on port 3000.
- `ingress.yaml` — template; adapt to your ingress controller.

```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/ingress.yaml   # after editing host/TLS secret
```

### Secrets

Never put `EMBEDIQ_AUTH_PASS`, `EMBEDIQ_GIT_TOKEN`,
`EMBEDIQ_SESSION_COOKIE_SECRET`, `EMBEDIQ_SESSION_DATA_KEY`, or
`EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET` in the ConfigMap. Use a `Secret`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: embediq-secrets
type: Opaque
stringData:
  EMBEDIQ_AUTH_PASS: "…"
  EMBEDIQ_GIT_TOKEN: "ghp_…"
  EMBEDIQ_SESSION_COOKIE_SECRET: "…"
  EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET: "…"
```

Then in the deployment spec:

```yaml
envFrom:
  - configMapRef:
      name: embediq-config
  - secretRef:
      name: embediq-secrets
```

### Scaling

EmbedIQ's stateless web API (no session, no autopilot) scales
horizontally without coordination. Beyond that, two backends matter
when `replicas > 1`:

- **Sessions**: set `EMBEDIQ_SESSION_BACKEND=database` plus
  `EMBEDIQ_SESSION_DB_DRIVER=postgres` and point
  `EMBEDIQ_SESSION_DB_URL` at a managed Postgres instance. Every web
  replica reads/writes the same session table; users land on any
  replica and continue their wizard run. Single-node SQLite
  (`EMBEDIQ_SESSION_DB_DRIVER=sqlite`) and the `json-file` backend
  are **not HA-safe** — they're for single-replica deployments only.
- **Autopilot**: the v1 store is still single-node JSON-file. Pin
  the autopilot scheduler to a single replica (e.g. a separate
  Deployment with `replicas: 1`) or disable it on the public web
  replicas (`EMBEDIQ_AUTOPILOT_ENABLED=false`) and run it from a
  dedicated worker.

See [`session-backends.md`](session-backends.md) for the full backend
matrix.

#### Multi-node Postgres deployment

```bash
# every web replica gets identical env
EMBEDIQ_SESSION_BACKEND=database
EMBEDIQ_SESSION_DB_DRIVER=postgres
EMBEDIQ_SESSION_DB_URL=postgres://embediq:$PASSWORD@db-host:5432/embediq
# Recommended in production:
EMBEDIQ_SESSION_DATA_KEY=$(openssl rand -hex 32)  # AES-256-GCM at-rest encryption
EMBEDIQ_SESSION_COOKIE_SECRET=$(openssl rand -hex 32)
```

The Postgres-backed session table (`embediq_sessions`) is auto-created
on first use. The schema is portable — no Postgres-specific column
types or extensions, just `TEXT`/`INTEGER`. Restoring from a SQLite
dump → Postgres is a `pg_dump --data-only` from SQLite via an ORM is
out of scope; for migrations, drain sessions to expiry rather than
attempting a hot copy.

Install the Postgres driver in the runtime image:

```dockerfile
# Add to your Dockerfile after npm install
RUN npm install --save pg @types/pg
```

The `pg` package is an `optionalDependency` of EmbedIQ — it's not in
the default install set, so non-Postgres deployments stay slim.

### Health probes

| Endpoint | Returns | Use |
|---|---|---|
| `GET /health` | 200 + `{ status: "ok", version, uptime, timestamp }` | Liveness |
| `GET /ready` | 200 + `{ ready: true, questionCount }` | Readiness |

Both are unauthenticated by design — ingresses and load balancers need
to hit them without credentials.

## TLS

Two options:

**1. Terminate at a reverse proxy (recommended).** Put EmbedIQ behind
nginx, Caddy, ingress-nginx, an AWS ALB, or a Cloud Load Balancer.
Run EmbedIQ HTTP-only inside the cluster. Simplest and most
flexible — you also get request logs, rate limiting, and static
asset caching for free.

**2. Terminate in-process.** Set both env vars and the server will
bind HTTPS:

```bash
export EMBEDIQ_TLS_CERT=/secrets/server.crt
export EMBEDIQ_TLS_KEY=/secrets/server.key
npm run start:web
```

Use when you can't add a reverse proxy (bare VM, desktop kiosk mode).
Certificate rotation requires a restart.

## Rate limiting

EmbedIQ enables per-endpoint rate limits out of the box via
[`express-rate-limit`](https://github.com/express-rate-limit/express-rate-limit):

| Route family | Window | Limit |
|---|---|---|
| `POST /api/generate` | 15 min | 10 requests |
| `POST /api/sessions` | 60 sec | 20 per IP |
| `GET /api/sessions/…` (reads) | 60 sec | 120 per IP |
| `PATCH /api/sessions/…` | 60 sec | 120 per IP |
| `DELETE /api/sessions/…` | 60 sec | 10 per IP |
| `GET /api/sessions` (admin list) | 60 sec | 30 per user |
| `POST /api/sessions/:id/dump` | 60 sec | 3 per user |

These limits are conservative; adjust in `src/web/server.ts` and
`src/web/sessions/routes.ts` if your deployment needs more throughput.
Rate limits are in addition to any limits at your ingress or CDN.

## Capacity guidance

| Load profile | Recommendation |
|---|---|
| Single-team internal use | 1 replica, 128Mi / 100m. `NullBackend` (stateless) is fine. |
| Multi-team, session persistence | 1 replica, 256Mi / 200m. `sqlite` backend on a PVC. |
| Per-engagement (consulting firm / SI) | One replica per engagement; set `EMBEDIQ_ENGAGEMENT_ID` to isolate state. See [`docs/CONSULTING-FIRM-DEPLOYMENT.md`](../CONSULTING-FIRM-DEPLOYMENT.md). |
| Healthcare BPO / regulated services | Air-gapped or controlled-outbound topology with HIPAA domain pack, encrypted SQLite sessions, autopilot + compliance feedback loop, 6-year audit retention. See [`docs/HEALTHCARE-BPO-DEPLOYMENT.md`](../HEALTHCARE-BPO-DEPLOYMENT.md). |
| Multi-tenant SaaS | Horizontal scaling behind a sticky-session ingress for auth flows; stateless API otherwise. Autopilot pinned to one replica. |

CPU cost is dominated by synthesizer runs (up to 22 generators in parallel — 12 Claude Code + 5 multi-agent + 4 local-AI + 1 RAG scaffold when active).
Typical generation: tens of milliseconds. Memory usage is bounded by
the answer set + session cache (a few KB per session).

## Network model

Outbound traffic is **opt-in**:

| Feature | Env var | Outbound to |
|---|---|---|
| OpenTelemetry export | `EMBEDIQ_OTEL_ENABLED=true` | `OTEL_EXPORTER_OTLP_ENDPOINT` |
| Git PR integration | `--git-pr` flag | `EMBEDIQ_GIT_API_BASE_URL` (default: api.github.com) |
| Outbound notification webhooks | `EMBEDIQ_WEBHOOK_URLS` | Every listed URL |

Inbound traffic is **opt-in for compliance/autopilot**:

| Feature | Env var | Inbound from |
|---|---|---|
| Autopilot + compliance webhooks | `EMBEDIQ_AUTOPILOT_ENABLED=true` | External compliance platforms (Drata, Vanta, CI, etc.) |

For air-gap deployments: unset every env var above and your EmbedIQ
instance makes zero outbound calls. Compliance webhooks obviously
require inbound reachability from your compliance platform.

## See also

- [Authentication](authentication.md)
- [Session backends](session-backends.md)
- [Observability](observability.md)
- [Ops troubleshooting](troubleshooting-ops.md)
- [Configuration reference](../reference/configuration.md) — every
  env var in one table
- [Per-engagement deployment pattern](../CONSULTING-FIRM-DEPLOYMENT.md) —
  consulting-firm / systems-integrator scoping via
  `EMBEDIQ_ENGAGEMENT_ID`
- [Healthcare BPO deployment pattern](../HEALTHCARE-BPO-DEPLOYMENT.md) —
  HIPAA-covered services firms, air-gap topology, Drata/Vanta
  feedback loop, 6-year audit retention
