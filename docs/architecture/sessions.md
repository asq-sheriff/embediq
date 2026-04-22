<!-- audience: public -->

# Architecture — sessions

Server-side sessions turn the stateless web API into a resumable,
multi-contributor workflow without compromising the zero-persistence
default.

**Source**: [`src/web/sessions/`](../../src/web/sessions/).

For operator setup, see
[operator-guide/session-backends.md](../operator-guide/session-backends.md).
For the user-visible resume flow, see
[user-guide/07-session-and-resume.md](../user-guide/07-session-and-resume.md).

## Components

```
┌────────────────────────────────────────────────────────────────┐
│  sessionMiddleware   (Express middleware)                      │
│  Loads sessionId from header / body / query into request ctx.  │
│  Installs res.on('finish') that persists dirty state.          │
└──────────────────────────────┬─────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────┐
│  RequestSessionStore   (in-request state)                      │
│  Hydrates the session snapshot. Callers mutate via store.mutate│
│  which marks the store dirty.                                  │
└──────────────────────────────┬─────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────┐
│  SessionBackend   (pluggable interface)                        │
│  NullBackend / JsonFileBackend / DatabaseBackend               │
│   + PayloadCipher (AES-256-GCM when EMBEDIQ_SESSION_DATA_KEY   │
│     is set)                                                    │
└────────────────────────────────────────────────────────────────┘
```

Dump worker (`DumpWorker`) is a separate component that handles
async session exports — admin enqueues a dump, worker builds a
tarball, admin downloads it. Not on the request path.

## `WizardSession` — the canonical record

```ts
interface WizardSession {
  sessionId: string;
  userId?: string;                 // set when auth is on
  ownerToken?: string;             // set when auth is off — HMAC anchor
  templateId?: string;
  domainPackId?: string;
  phase: WizardPhase;              // discovery | playback | edit | generate | complete
  currentDimension?: string;
  answers: Record<string, SerializedAnswer>;
  profile?: SerializedProfile;
  priorities?: SerializedPriority[];
  generationHistory: GenerationHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  version: number;                 // monotonic, bumped per write
}
```

`SerializedAnswer` is a JSON-safe projection of `Answer` with a
string timestamp. It gained a `contributedBy` field in v3.2 — stamped
server-side from the request context on every PATCH.

## Ownership

Two models, selected automatically based on whether auth is on:

- **Auth on** (`EMBEDIQ_AUTH_STRATEGY` set). The session's `userId`
  is set at mint time. Every subsequent request's authenticated
  user must match or return 403.
- **Auth off** (no strategy). The session mints a random 24-byte
  `ownerToken`, HMAC-signs it with `EMBEDIQ_SESSION_COOKIE_SECRET`,
  and sets it as the HTTP-only `embediq_session_owner` cookie.
  Every subsequent request must present the same signed cookie.

The middleware's 403 short-circuit is the enforcement point — if the
caller isn't the owner, the route handler never runs.

## The backend interface

```ts
interface SessionBackend {
  readonly name: SessionBackendName;
  get(id: string): Promise<WizardSession | null>;
  put(session: WizardSession): Promise<WizardSession>;
  delete(id: string): Promise<boolean>;
  list(filter: SessionListFilter): Promise<SessionListResult>;
}
```

Three implementations ship:

| Backend | `name` | `EMBEDIQ_SESSION_BACKEND` |
|---|---|---|
| `NullBackend` | `none` | `none` (default) |
| `JsonFileBackend` | `json-file` | `json-file` |
| `DatabaseBackend` (with `SqliteDialect`) | `database` | `database` + `EMBEDIQ_SESSION_DB_DRIVER=sqlite` |

Every non-Null backend guarantees `version` is monotonically
increasing across writes. `put(session)` bumps `version` and
returns the stored snapshot.

## `PayloadCipher` — optional encryption

When `EMBEDIQ_SESSION_DATA_KEY` is set, the backend encrypts the
`answers`/`profile`/`priorities` subtree with AES-256-GCM (Node's
`crypto` standard library) before writing. Metadata fields
(`sessionId`, `userId`, `phase`, timestamps) stay plaintext so:

- Sweep expired sessions doesn't need to decrypt each one.
- Ownership enforcement reads `userId`/`ownerToken` without decryption.
- Admin list responses can surface sessions without decrypting their
  contents.

Current limitation: the key rotates one-at-a-time (no side-by-side
_PREV key acceptance). Rotation means re-encrypting existing records
— admin dump → delete → re-mint is the interim path.

## Middleware flow

```
request lands
  ↓
sessionMiddleware:
  if backend.name === 'none' → next() (noop)
  else:
    ctx.sessionStore = new RequestSessionStore()
    sessionId = extractFrom(req)
    if sessionId:
      session = await backend.get(sessionId)
      if session && ownership matches:
        store.hydrate(session)
        ctx.sessionId = sessionId
      else if ownership mismatch:
        res.status(403).end(); return
  
  res.on('finish', () => {
    if store.isDirty() && res.statusCode < 500:
      backend.put(store.snapshot()).catch(logError)
  })
  next()
```

Why `finish` rather than awaiting the write? Writes are best-effort
and don't block the response. Failures log to stderr. Pending writes
are tracked in a module-level Set so tests and graceful-shutdown
code can flush them.

## `buildResumeView` — where to jump

`GET /api/sessions/:id/resume` calls `buildResumeView(session)`
which:

1. Hydrates answers into a `Map<string, Answer>`.
2. Resolves the domain pack (via `STRAT_002` answer).
3. Walks every dimension's visible questions, counting total +
   answered, recording the first unanswered as the resume target.
4. Builds the partial profile + priorities (so the UI can preview
   state before generation).
5. Aggregates `contributors: Record<userId, count>` from the answer
   records' `contributedBy` fields.

Output: `{ session, nextDimensionIndex, nextQuestionIndex, complete,
profile, contributors, totals }`.

## Dump worker

Admin flow: `POST /api/sessions/:id/dump` enqueues a job. The worker
reads the session, serializes to a tarball under `EMBEDIQ_DUMP_DIR`,
marks the job `ready`. Admin downloads via
`GET /api/sessions/dumps/:dumpId/download`. Completed dumps expire on
a short TTL so tarballs don't accumulate.

## Rate limits

Per-route limits shipped via `express-rate-limit` — see
[reference/rest-api.md](../reference/rest-api.md) for the matrix.
`POST /api/sessions/:id/dump` is capped at 3/minute/user to prevent
a single admin from flooding the worker.

## Why stateless as default?

A web wizard that stores every visitor's answers on the server is a
PII hazard for regulated deployments. Defaulting to NullBackend —
literally no persistence — lets operators opt in based on their own
threat model.

The `json-file` backend is the dev convenience; `database + sqlite`
is the production default. Multi-node deployments need an external
adapter (Postgres, Redis); the interface is stable for it, no
adapter ships today.

## See also

- [Session backends operator guide](../operator-guide/session-backends.md)
- [Session & resume user guide](../user-guide/07-session-and-resume.md)
- [REST API](../reference/rest-api.md)
- [`src/web/sessions/`](../../src/web/sessions/) — source tree
