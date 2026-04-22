<!-- audience: public -->

# Session & resume — multi-day, multi-contributor wizard flows

Long compliance-heavy wizard runs rarely finish in one sitting. A
developer answers the stack questions, a compliance officer fills in
regulatory obligations, a tech lead supplies team-size and permission
preferences. EmbedIQ's server-side session persistence turns a 71-question
interview into a **shareable, resumable artifact** that the right person
can open on the right device at the right time — with per-answer
attribution so compliance reviewers can prove who answered what.

> **When to use this.** You need the wizard to span multiple days,
> multiple devices, or multiple contributors, and you want audit
> traceability on the answer set.

## Enable it

Server-side sessions are off by default — the stateless web API uses
volatile memory only. Turn it on by selecting a backend:

```bash
# Development — JSON file store, single node
EMBEDIQ_SESSION_BACKEND=json-file \
  EMBEDIQ_SESSION_DIR=/var/lib/embediq/sessions \
  EMBEDIQ_SESSION_COOKIE_SECRET=$(openssl rand -hex 32) \
  npm run start:web

# Production — SQLite via the database backend, with encrypted payloads
EMBEDIQ_SESSION_BACKEND=database \
  EMBEDIQ_SESSION_DB_DRIVER=sqlite \
  EMBEDIQ_SESSION_DB_URL=/var/lib/embediq/sessions.db \
  EMBEDIQ_SESSION_DATA_KEY=$(openssl rand -hex 32) \
  EMBEDIQ_SESSION_COOKIE_SECRET=$(openssl rand -hex 32) \
  npm run start:web
```

Relevant env vars (full list in
[`reference/configuration.md`](../reference/configuration.md)):

| Env var | Purpose |
|---|---|
| `EMBEDIQ_SESSION_BACKEND` | `none` (default) / `json-file` / `database`. |
| `EMBEDIQ_SESSION_DIR` | Directory for `json-file` backend. Default `./.embediq/sessions`. |
| `EMBEDIQ_SESSION_DB_DRIVER` | `sqlite` (default) / `postgres` (reserved) — when backend is `database`. |
| `EMBEDIQ_SESSION_DB_URL` | SQLite file path. Default `./.embediq/sessions.db`. `:memory:` supported for tests. |
| `EMBEDIQ_SESSION_DATA_KEY` | 64-character hex (32-byte) AES-256-GCM key for payload encryption. Optional but recommended. |
| `EMBEDIQ_SESSION_COOKIE_SECRET` | HMAC secret for the owner cookie. Required when auth is off. |
| `EMBEDIQ_SESSION_COOKIE_SECRET_PREV` | Previous cookie key during rotation; both are accepted during the overlap. |
| `EMBEDIQ_SESSION_TTL_MS` | Session lifetime in ms. Default 7 days. Clamped to [60 s, 30 d]. |

## How it works

1. The user visits the web UI. The client calls `POST /api/sessions` and
   receives `{ sessionId, resumeUrl, expiresAt }`. The resume URL is
   `/?session=<sessionId>`.
2. The server sets an HTTP-only `embediq_session_owner` cookie (HMAC-
   signed). When no auth strategy is configured, the cookie is the only
   thing proving ownership — subsequent requests that don't present it
   get a 403.
3. As the user answers questions, the client PATCHes each answer to
   `/api/sessions/:id`. The server **stamps `contributedBy`** from the
   request context on every answer — the client cannot forge this.
4. Anyone with the URL (and the cookie, or a matching authenticated
   user) can open the same session on another device and pick up where
   the last contributor left off. The frontend fetches
   `/api/sessions/:id/resume` to find the next unanswered visible
   question and renders a welcome-back banner with progress totals.

## Resume URL contract

A resume URL looks like:

```
https://embediq.example.com/?session=4b24b7e9-6f8b-4e29-9a2a-73a2d1c6e3a5
```

Share the full URL (protocol included). The opener needs either:

- **Auth enabled** — a user account that matches the session's `userId`.
- **Auth off** — the `embediq_session_owner` cookie that was set when
  the session was minted. If the cookie isn't present (different
  browser), the user must mint a new session.

For cross-device resume without auth, you can also call
`POST /api/sessions/:id/dump` (requires `wizard-admin`) to export the
session and then re-import it on the target device — see the
[session-backends operator guide](../operator-guide/session-backends.md).

## Multi-contributor workflow

Each PATCH to `/api/sessions/:id` runs under the current request
context. EmbedIQ stamps the authenticated user's ID onto every answer
in the PATCH body:

```json
{
  "questionId": "REG_003",
  "value": true,
  "timestamp": "2026-04-21T09:13:44.201Z",
  "contributedBy": "compliance@acme.com"
}
```

The resume endpoint aggregates this into a contributors map:

```bash
curl http://localhost:3000/api/sessions/<id>/resume
```

```json
{
  "session": { … },
  "nextDimensionIndex": 4,
  "nextQuestionIndex": 2,
  "complete": false,
  "profile": { "role": "developer", "industry": "healthcare", … },
  "contributors": {
    "developer@acme.com":  8,
    "compliance@acme.com": 6,
    "lead@acme.com":       2
  },
  "totals": { "answered": 16, "visible": 18 }
}
```

The PR template and notification-webhook messages surface this
attribution automatically, so compliance reviewers can prove on the
PR itself that the regulatory questions were answered by the
compliance officer, not the developer.

## Worked example — three-stakeholder HIPAA wizard

```
08:30   Alice (developer) visits /              → mint session → https://embediq.example.com/?session=4b24b…
08:45   Alice answers: role, tech stack, build tools. 12 answers PATCHed.
09:00   Alice shares the URL with Bob (compliance) on Slack.
09:30   Bob opens the URL in his browser        → /resume sees 12 answers, jumps to REG_001.
09:45   Bob answers: HIPAA, PHI, audit, DLP.      8 answers PATCHed as contributedBy=bob@acme.com.
10:00   Bob shares the URL with Carol (tech lead).
10:15   Carol opens the URL                     → /resume sees 20 answers, jumps to FIN_001.
10:25   Carol finalizes: budget tier, permission tier, CI/CD. 4 answers.
10:30   Carol clicks "Generate"                 → 24-file configuration written.
```

The resulting PR (via [`--git-pr`](09-git-pr-integration.md)) contains
a **Contributors** table:

| Contributor | Answers |
|---|---|
| `alice@acme.com` | 12 |
| `bob@acme.com` | 8 |
| `carol@acme.com` | 4 |

Reviewers reading that PR know exactly who signed off on which part of
the wizard. This is the multi-stakeholder audit trail the compliance
team cares about.

## Session lifecycle endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/sessions/config` | none | Feature discovery — returns `{ enabled, backend }`. |
| `POST /api/sessions` | none | Mint a new session, return ID + resume URL + cookie. |
| `GET /api/sessions/:id` | cookie or user | Fetch the raw session record. |
| `GET /api/sessions/:id/resume` | cookie or user | Fetch resume coordinates + partial profile + contributors map. |
| `PATCH /api/sessions/:id` | cookie or user | Merge new answers / phase / currentDimension. Stamps `contributedBy` server-side. |
| `DELETE /api/sessions/:id` | cookie or user | Delete the session (irreversible). |
| `GET /api/sessions` | `wizard-admin` | List sessions with pagination + filter. |
| `POST /api/sessions/:id/dump` | `wizard-admin` | Enqueue an async tarball export. |
| `GET /api/sessions/dumps/:dumpId` | `wizard-admin` | Job status. |
| `GET /api/sessions/dumps/:dumpId/download` | `wizard-admin` | Download the tarball. |

Full request/response shapes in
[`reference/rest-api.md`](../reference/rest-api.md).

## Security considerations

- **HTTPS is strongly recommended in any shared deployment.** The
  owner-token cookie is HTTP-only but still cookie-based; use TLS
  (`EMBEDIQ_TLS_CERT` + `EMBEDIQ_TLS_KEY` or terminate at a reverse
  proxy) to prevent it leaking over the wire.
- **`contributedBy` is authoritative only when auth is on.** Without
  auth, every contributor in a shared session is effectively
  anonymous — `contributedBy` stays unset. For multi-stakeholder
  traceability, configure `EMBEDIQ_AUTH_STRATEGY`.
- **Session TTL applies to both the record and the cookie.** After
  `EMBEDIQ_SESSION_TTL_MS` (default 7 days), the session is removed
  and the cookie is rejected — plan your wizard windows accordingly.
- **Payload encryption is opt-in.** Without
  `EMBEDIQ_SESSION_DATA_KEY`, the on-disk representation contains
  answer values in plaintext. Turn it on if answers might contain
  sensitive project metadata.

## Troubleshooting

- **403 on `GET /api/sessions/:id`.** The caller isn't authenticated
  and isn't sending the owner cookie. Re-open the wizard in the same
  browser profile that minted the session, or enable auth and assign
  the session's `userId`.
- **"Session belongs to a different user".** The authenticated user
  doesn't match the session's `userId`. Sessions are scoped — they
  can't be shared across user accounts. Use the dump/import admin
  flow if you genuinely need to hand off ownership.
- **Contributors map is empty.** Auth is off — `contributedBy` isn't
  being stamped. Turn on auth (Basic / OIDC / reverse-proxy header)
  to populate the map.
- **Session exists on disk but `/api/sessions/:id` returns 404.** The
  TTL expired. The backend sweeps expired sessions at read time.
- **Resume URL doesn't advance to the right question.** Make sure the
  client is calling `GET /api/sessions/:id/resume` (not
  `GET /api/sessions/:id`) — only `/resume` computes coordinates.

## See also

- [Operator guide: session backends](../operator-guide/session-backends.md) —
  backend selection, encryption, dump worker
- [Authentication](../operator-guide/authentication.md) — how
  `contributedBy` gets populated
- [Git PR integration](09-git-pr-integration.md) — PR template
  includes the contributors table
- [Sessions architecture](../architecture/sessions.md) — backend
  interface, middleware, resume computation
