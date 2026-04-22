<!-- audience: public -->

# Session backends

Server-side sessions power the interrupt-and-resume workflow (see
[user-guide/07](../user-guide/07-session-and-resume.md)). This guide is
for the operator: pick a backend, configure keys, plan for dumps and
rotation. If sessions don't matter to your deployment, leave
`EMBEDIQ_SESSION_BACKEND` unset — EmbedIQ runs stateless.

## The backend matrix

| Backend | Env var | Use when | Persistence | HA-safe |
|---|---|---|---|---|
| **None** (`NullBackend`) | `EMBEDIQ_SESSION_BACKEND=none` (default) | Stateless single-user | Volatile (in-process) | ✅ (nothing shared) |
| **JSON file** | `EMBEDIQ_SESSION_BACKEND=json-file` | Local dev, single-node | One file per session under `EMBEDIQ_SESSION_DIR` | ❌ |
| **SQLite** (via `database` backend) | `EMBEDIQ_SESSION_BACKEND=database` + `EMBEDIQ_SESSION_DB_DRIVER=sqlite` | Single-node production, modest volume | Single SQLite file at `EMBEDIQ_SESSION_DB_URL` | ❌ (file locked per process) |
| **Postgres** / **Redis** | `database` + `postgres` / `redis` | *(reserved — not wired in this build; selecting them errors at startup)* | — | — |

Multi-node / HA deployments need an external store (Postgres, Redis)
— the `SessionBackend` interface is ready for it, but no adapter
ships today. See [the architecture docs](../architecture/sessions.md)
for what an external adapter needs to implement.

## Configuration

### Common env vars

| Env var | Default | Purpose |
|---|---|---|
| `EMBEDIQ_SESSION_BACKEND` | `none` | `none` / `json-file` / `database`. |
| `EMBEDIQ_SESSION_TTL_MS` | `604800000` (7 days) | Session lifetime. Clamped to [60s, 30d]. |
| `EMBEDIQ_SESSION_COOKIE_SECRET` | — | **Required** for owner-cookie signing when auth is off. HMAC-SHA-256 key, 32 bytes hex-encoded. |
| `EMBEDIQ_SESSION_COOKIE_SECRET_PREV` | — | Previous cookie secret accepted during rotation. |
| `EMBEDIQ_SESSION_DATA_KEY` | — | AES-256-GCM key for payload encryption. 64-character hex string (32 bytes). Optional but recommended in production. |
| `EMBEDIQ_DUMP_DIR` | `./.embediq/dumps` | Where session dumps land when admins export. |

### Backend-specific

| Env var | When it applies | Purpose |
|---|---|---|
| `EMBEDIQ_SESSION_DIR` | `json-file` | Directory holding one JSON file per session. Must be writable by the server process. Default `./.embediq/sessions`. |
| `EMBEDIQ_SESSION_DB_DRIVER` | `database` | `sqlite` (default) / `postgres` (reserved). |
| `EMBEDIQ_SESSION_DB_URL` | `database`+`sqlite` | Path to the SQLite file. Auto-created on first write. Default `./.embediq/sessions.db`. `:memory:` is supported for tests. |

### Production defaults

```bash
export EMBEDIQ_SESSION_BACKEND=database
export EMBEDIQ_SESSION_DB_DRIVER=sqlite
export EMBEDIQ_SESSION_DB_URL=/var/lib/embediq/sessions.db
export EMBEDIQ_SESSION_COOKIE_SECRET=$(openssl rand -hex 32)
export EMBEDIQ_SESSION_DATA_KEY=$(openssl rand -hex 32)
export EMBEDIQ_DUMP_DIR=/var/lib/embediq/dumps
npm run start:web
```

## `NullBackend` — the default

Zero-persistence. Every session endpoint returns `503 Session
persistence is not enabled`. Use this (or simply don't set
`EMBEDIQ_SESSION_BACKEND`) for local CLI use or anonymous one-shot
wizard flows — the web API is fully stateless and the browser holds
the answer map.

`GET /api/sessions/config` returns `{ enabled: false, backend: "none" }`
— the frontend uses this to decide whether to show resume UI.

## `JsonFileBackend` — dev / single-node

- One `<sessionId>.json` file per session under `EMBEDIQ_SESSION_DIR`.
- Atomic writes via temp-file + rename.
- No concurrency control beyond filesystem atomicity — a second
  process writing the same file wins.

### When it's the right choice

- Local development.
- Single-node production with modest session volume (<1000 active).
- Environments where SQLite's native dep (`better-sqlite3`) can't be
  installed.

### Backup

`EMBEDIQ_SESSION_DIR` is just a directory — snapshot it with your
normal filesystem backup tooling (Velero, restic, cron `tar`, etc.).
Sessions include ISO timestamps, so you can eyeball currency.

## `DatabaseBackend + SqliteDialect` — single-node production

- One SQLite DB at `EMBEDIQ_SESSION_DB_URL` (selected via
  `EMBEDIQ_SESSION_BACKEND=database` + `EMBEDIQ_SESSION_DB_DRIVER=sqlite`).
- Better-sqlite3 is an **optional** dependency; install it on your
  build image if you enable this backend.
- Monotonic `version` counter bumps on every write — used for CAS-like
  semantics in the store.
- Sweeps expired sessions at read time.

### When it's the right choice

- Single-node production with hundreds to thousands of active sessions.
- Operators comfortable with SQLite + native deps.

### Backup

```bash
# Consistent snapshot
sqlite3 /var/lib/embediq/sessions.db ".backup /backup/sessions-$(date -Is).db"
```

Or use Litestream for continuous replication.

## Payload encryption

When `EMBEDIQ_SESSION_DATA_KEY` is set, the backend encrypts every
session's `answers`/`profile`/`priorities` subtree with AES-256-GCM
before writing. Metadata fields (`sessionId`, `userId`, `phase`,
timestamps) stay plaintext so the sweeper and ownership middleware
can work without decrypting.

Use it when:

- Answers may contain sensitive project metadata (compliance-framework
  selections, team sizes, industry identifiers).
- Disk isn't encrypted at rest (e.g. a shared dev VM).
- A future HA adapter backed by a shared store needs encryption in
  transit to/from that store.

## Owner-cookie signing

When auth is off, the only thing proving session ownership is the
HTTP-only `embediq_session_owner` cookie — HMAC-signed with
`EMBEDIQ_SESSION_COOKIE_SECRET`. Every session endpoint rejects
requests whose cookie doesn't match or is absent.

### Rotation

```bash
# Phase 1 — accept both keys
export EMBEDIQ_SESSION_COOKIE_SECRET_PREV=<old key>
export EMBEDIQ_SESSION_COOKIE_SECRET=<new key>
# Restart server; old and new cookies both work.

# Phase 2 — when you're confident all live sessions have re-signed,
# drop the PREV var and restart.
```

The payload-encryption key (`EMBEDIQ_SESSION_DATA_KEY`) does **not**
support side-by-side rotation today — re-encrypting existing session
records is a roadmap item. If you need to rotate it, dump all active
sessions (admin), delete the old records, set the new key, and have
users re-mint sessions.

## Dump worker (admin export)

Admins can snapshot a session to a tarball for handoff, audit, or
cross-environment migration:

```bash
# 1. Enqueue
curl -X POST http://host/api/sessions/<id>/dump \
  -H 'Authorization: …' \
  -H 'Accept: application/json'
# { "dumpId": "…", "status": "pending", "expiresAt": "…" }

# 2. Poll
curl http://host/api/sessions/dumps/<dumpId>

# 3. Download when status = ready
curl -OJ http://host/api/sessions/dumps/<dumpId>/download
```

Dumps land under `EMBEDIQ_DUMP_DIR`. The worker expires completed
dumps after a short TTL (minutes) to avoid disclosure risk — pull the
file promptly.

## Capacity planning

| Session size | ~1 KB (answers only) to ~10 KB (with partial profile) |
| Write frequency | Once per answered question (fine-grained PATCH) |
| Read frequency | Typically ≤ 1 per question (resume view + occasional re-fetch) |
| Sweep cost | O(N) per session read; expired sessions are deleted lazily |

For the SQLite backend, sessions cost a few hundred bytes on disk plus
the payload. A deployment with 10,000 active sessions averaging 5 KB
each holds well under 100 MB.

## TTL governance

- Default: 7 days.
- Floor: 1 minute (anything smaller is clamped up).
- Ceiling: 30 days (anything larger is clamped down).

Pick a TTL that matches how long you expect a multi-stakeholder wizard
to stay open. Most deployments settle on 3–7 days. The cookie shares
the session's TTL, so an expired session invalidates the owner cookie
too.

## Monotonic versioning

Every write to a session bumps an integer `version` counter. Backends
guarantee this monotonicity — callers can inspect `version` for
compare-and-swap patterns (e.g. optimistic concurrency for a multi-
contributor frontend that doesn't want to stomp on someone else's
PATCH).

## Troubleshooting

- **"Session persistence is not enabled" on every request.** Backend
  is `none`. Set `EMBEDIQ_SESSION_BACKEND=json-file` or `database`
  (with `EMBEDIQ_SESSION_DB_DRIVER=sqlite`) at server startup.
- **`Cannot find module 'better-sqlite3'`.** The SQLite backend is
  selected but the native dep isn't installed. `npm install better-
  sqlite3` (it's an optional dep; the runtime image installs it only
  if you enable the backend).
- **JSON files accumulate without bound.** Expired sessions are swept
  at read time. If no one reads sessions regularly, stale files can
  persist. Add a cron job that calls
  `GET /api/sessions?updatedAfter=<something very old>&limit=1000`
  periodically — the list call also triggers sweeping.
- **Cookie-signature errors after rotating the secret.** Either set
  `_PREV` during rotation, or accept that live sessions need to mint
  new ones after the rotation window.
- **`EMBEDIQ_SESSION_TTL_MS` ignored.** Check for parse errors in
  stderr — non-positive or non-numeric values are logged and ignored
  (falling back to the default).

## See also

- [User-guide: sessions & resume](../user-guide/07-session-and-resume.md) —
  end-user / developer perspective
- [Authentication](authentication.md) — how `userId` drives ownership
- [Security](../../SECURITY.md) — threat model for session storage
- [Sessions architecture](../architecture/sessions.md) — backend
  interface and middleware internals
