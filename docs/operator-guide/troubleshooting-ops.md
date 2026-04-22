<!-- audience: public -->

# Ops troubleshooting

Decision-tree style. Each section starts with a symptom an operator
would see, then walks through the diagnostic and the fix.

The user-facing
[user-guide/12-troubleshooting.md](../user-guide/12-troubleshooting.md)
covers user-visible symptoms (wizard output, session resume, webhook
delivery). This doc is specifically for deployment, auth, TLS, and
infrastructure-shaped problems.

---

## Server won't start

### Symptom: `EADDRINUSE`, port 3000 already in use

```bash
lsof -i :3000   # find the offender
# or: ss -tlnp | grep 3000
```

**Fix:** stop the conflicting process, or set a different `PORT`:

```bash
PORT=8080 npm run start:web
```

### Symptom: `Error: listen EACCES: permission denied 0.0.0.0:80`

You're trying to bind a privileged port (<1024) as a non-root user.

**Fix:** one of:
- Use `PORT=3000` + reverse-proxy (nginx/Caddy) on :80.
- `setcap cap_net_bind_service=+ep $(which node)` (Linux only).
- Run behind an ingress controller that handles :80.

### Symptom: `TypeError: fetch is not a function` or `AbortController is not defined`

Running on Node < 18.

**Fix:** upgrade Node. The runtime image is Node 22.

### Symptom: `Cannot find module '@inquirer/prompts'`

You ran `npm run start:web` on a fresh clone without installing deps.

**Fix:**

```bash
npm ci
```

---

## TLS

### Symptom: startup fails with `ENOENT` on the cert or key file

```
Error: ENOENT: no such file or directory, open '/secrets/server.crt'
```

**Diagnostic:** `ls -l $EMBEDIQ_TLS_CERT $EMBEDIQ_TLS_KEY` — confirm
paths exist **inside** the process's filesystem view (matters for
Docker / Kubernetes where the secret might not be mounted at the
expected path).

**Fix:** mount the secret, or terminate TLS at a reverse proxy and
drop the TLS env vars.

### Symptom: browser says "NET::ERR_CERT_COMMON_NAME_INVALID" / "certificate does not match"

The cert's SAN list doesn't include the hostname you're accessing.

**Fix:** re-issue the cert with the right CN/SAN, or switch to a
wildcard / SNI-aware reverse proxy (Caddy does this automatically).

### Symptom: EmbedIQ emits HTTPS but ingress can't reach it

Both the ingress and EmbedIQ are doing TLS.

**Fix:** pick one. Typical production: terminate at the ingress and
run EmbedIQ HTTP-only inside the cluster.

---

## Authentication

### Symptom: OIDC returns `401` on every request

**Diagnostic:**

```bash
# 1. Is the issuer reachable and well-formed?
curl -sSf "${EMBEDIQ_OIDC_ISSUER%/}/.well-known/openid-configuration" | jq .

# 2. Does your IdP publish jwks_uri? It should.
curl -sSf "$(curl -s "${EMBEDIQ_OIDC_ISSUER%/}/.well-known/openid-configuration" | jq -r .jwks_uri)"
```

**Typical fixes:**

- Trailing-slash mismatch: `EMBEDIQ_OIDC_ISSUER` must match the JWT's
  `iss` claim exactly.
- Clock skew: both the IdP and EmbedIQ need reasonably accurate clocks
  (NTP; 5-minute skew is the practical limit).
- `aud` claim doesn't include `EMBEDIQ_OIDC_CLIENT_ID` (configure the
  IdP to emit the client id in the audience list).

### Symptom: OIDC roles claim missing — everyone is anonymous

**Diagnostic:** decode the ID token client-side
(`jwt.io` — with the key redacted, not the token). Check whether the
claim at `EMBEDIQ_OIDC_ROLES_CLAIM` is present and is a string array.

**Fix:** add a role mapper on the IdP. For Keycloak's nested
`realm_access.roles` use `EMBEDIQ_OIDC_ROLES_CLAIM=realm_access.roles`
— dotted paths are supported.

### Symptom: proxy-header strategy lets everyone in

The proxy isn't setting the user header, or a direct connection bypasses
the proxy.

**Diagnostic:**

```bash
# Does the proxy set the header?
curl -sI https://your-proxy/path
# Is EmbedIQ reachable directly?
curl -sI http://<embediq-pod-ip>:3000/health
```

**Fix:**
- Ensure `EMBEDIQ_PROXY_USER_HEADER` matches what your proxy actually
  sets.
- **Critical**: block direct access to EmbedIQ from outside the
  proxy's network. If anyone can set `X-Forwarded-User: admin` in a
  request, the whole auth model collapses.

---

## Session backends

### Symptom: every session endpoint returns `503 Session persistence is not enabled`

`EMBEDIQ_SESSION_BACKEND` is unset or `none`.

**Fix:** set it to `json-file` or `database` at startup:

```bash
EMBEDIQ_SESSION_BACKEND=database \
  EMBEDIQ_SESSION_DB_DRIVER=sqlite \
  EMBEDIQ_SESSION_DB_URL=/var/lib/embediq/sessions.db \
  EMBEDIQ_SESSION_COOKIE_SECRET=$(openssl rand -hex 32) \
  npm run start:web
```

### Symptom: `Cannot find module 'better-sqlite3'`

SQLite backend selected without the native dep installed.

**Fix:** install the optional dep:

```bash
npm install better-sqlite3
```

Check `package.json`'s `optionalDependencies` for the pinned version.

### Symptom: JSON session files accumulate

Expired sessions are swept at read time. Without regular reads, stale
files persist.

**Fix:** schedule a cron job (or a systemd timer) that runs a cheap
read against the API:

```bash
curl -H "Authorization: Bearer $(…)" \
  "http://host/api/sessions?updatedAfter=2020-01-01T00:00:00Z&limit=1000"
```

The list call triggers the sweeper.

### Symptom: users see `403 Session belongs to a different user`

Auth is on; the caller isn't the session's owner.

**Fix:** sessions are intentionally per-user. Use the admin dump/import
flow to transfer ownership when genuinely needed:

```bash
# Source
curl -XPOST http://host/api/sessions/<id>/dump -H 'Authorization: …'
# Poll /api/sessions/dumps/<dumpId>, download the tarball.
# Target: re-create the session server-side as the new user.
```

---

## Autopilot

### Symptom: `EMBEDIQ_AUTOPILOT_ENABLED=true` set, but the route returns 404

The env var was set **after** the process started. Opt-in is read at
`createApp()` time.

**Fix:** restart the server with the env var in scope.

### Symptom: schedules sit with past `nextRunAt` but no runs recorded

**Diagnostic:**

```bash
# 1. Is the scheduler actually ticking?
curl http://host/api/autopilot/schedules | jq '.[].nextRunAt'

# 2. Is the writer path writable?
ls -l "${EMBEDIQ_AUTOPILOT_DIR:-.embediq/autopilot}"
```

**Typical fixes:**

- `EMBEDIQ_AUTOPILOT_TICK_MS` set unreasonably large (e.g. a full
  day). Revert to the default 60_000.
- Write permission on `$EMBEDIQ_AUTOPILOT_DIR` is denied.
- The scheduler timer got killed (`clearInterval` called). In
  production that's a bug; in tests it's expected — integration
  tests call `scheduler.runTick()` directly.

### Symptom: webhook returns 200+skipped for every event

No schedules match the event's framework.

**Fix:** check `complianceFrameworks` on your schedules. The event's
normalized framework (`soc2`, `pci`, `hipaa`, …) must appear in at
least one enabled schedule's list.

---

## Webhooks

### Symptom: outbound webhooks never deliver

**Diagnostic:**

```bash
echo "$EMBEDIQ_WEBHOOK_URLS"
```

Watch server stderr for `Webhook subscriber failed for …` lines.

**Typical fixes:**

- Env var unset → no subscriber → no delivery.
- Every URL failed to parse (typo, missing scheme). The subscriber
  logs and skips; fix the string.
- The receiving endpoint times out. Default per-POST timeout is
  3 seconds; a hung endpoint drops the delivery (no retry).

### Symptom: Slack returns 400 / message doesn't appear

The URL didn't match `hooks.slack.com`, so auto-detection fell back
to the generic format.

**Fix:** force the format:

```bash
export EMBEDIQ_WEBHOOK_FORMAT=slack
```

Or fix the URL to the real Slack webhook URL (`hooks.slack.com/services/…`).

### Symptom: compliance webhook returns 401

Missing or mismatched `X-EmbedIQ-Autopilot-Secret` header. Regenerate
the secret and update both sides:

```bash
NEW_SECRET=$(openssl rand -hex 32)
# Set EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET=$NEW_SECRET on the server.
# Update Drata/Vanta webhook header to match.
```

---

## OpenTelemetry

### Symptom: `EMBEDIQ_OTEL_ENABLED=true` but no traces appear

**Diagnostic:** watch stderr during startup. The SDK packages are
optional deps loaded via dynamic `import()`; a failure logs
`Failed to initialize OpenTelemetry SDK` and continues as a no-op.

**Fix:**

```bash
npm install \
  @opentelemetry/sdk-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/sdk-metrics \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions
```

All are in `package.json`'s `optionalDependencies` — the runtime image
skips installing them unless you explicitly opt in.

### Symptom: traces arrive but metrics don't

Metric reader pushes on a 30-second interval. Wait 30s, then verify
the collector has a metrics receiver enabled on the OTLP endpoint.

Your collector config should include:

```yaml
receivers:
  otlp:
    protocols:
      http:   # EmbedIQ uses OTLP/HTTP on :4318 by default
```

### Symptom: OTel adds measurable latency

Highly unlikely at EmbedIQ's request rate; metric export is async.
If you suspect it, disable (`unset EMBEDIQ_OTEL_ENABLED`) and
benchmark. Typical per-request overhead when the collector is local
is in the microseconds.

---

## Audit log

### Symptom: `EMBEDIQ_AUDIT_LOG` set but the file stays empty

The path isn't writable by the process user. `chown` to the embediq
user (in the shipped container image: `embediq:embediq`) or mount
the volume with appropriate uid/gid mapping.

### Symptom: file grows unbounded

No rotation. Set up `logrotate` (see
[observability.md](observability.md) for the config).

### Symptom: audit entries lack `userId`

Auth is off; the request context has no authenticated user. Turn on
auth, or rely on the `requestId` for cross-referencing.

---

## Event bus (rare)

### Symptom: `Event subscriber failed for …` lines in stderr

One of the subscribers threw. The bus catches and logs; the event
still reaches the remaining subscribers.

**Diagnostic:** identify the failing subscriber from the error. The
built-ins are audit, metrics, status, otel, websocket-hub, webhook —
each logs its own error prefix.

**Fix:** if a custom subscriber is the culprit, fix its handler to
catch internally. Event-bus subscribers must be resilient by
contract — the wizard doesn't retry failed notifications.

---

## Escalation

If none of the above matches:

1. Collect: EmbedIQ version (`cat package.json | jq .version`), Node
   version, the deployment shape (Docker / K8s / bare), the failing
   command, full stderr output, and the relevant env vars (redacting
   secrets).
2. Check [CHANGELOG.md](../../CHANGELOG.md) for behavior changes
   between versions.
3. File an issue with the collected data.

## See also

- [Deployment](deployment.md)
- [Authentication](authentication.md)
- [Session backends](session-backends.md)
- [Observability](observability.md)
- [User-facing troubleshooting](../user-guide/12-troubleshooting.md)
