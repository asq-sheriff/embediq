<!-- audience: public -->

# Troubleshooting

A playbook grouped by subsystem. Every entry follows the same shape:
**symptom → diagnostic command → fix**. If your issue isn't listed,
check the subsystem-specific guides' Troubleshooting sections (linked
from each section heading below), or open an issue.

---

## Installation & build

### `node --version` reports < 18

**Symptom:** `TypeError: fetch is not a function` or `AbortController
is not defined` at CLI startup.

**Diagnostic:** `node --version`.

**Fix:** upgrade to Node 18 or newer. EmbedIQ uses global `fetch` and
`AbortController` — both require Node 18+.

### `npm install` fails on `better-sqlite3` (optional dependency)

**Symptom:** `npm install` prints an error about `node-gyp` or Python.
Install completes anyway.

**Fix:** this is expected. `better-sqlite3` is an **optional**
dependency used only by the SQLite session backend. If you aren't
enabling server-side sessions, ignore the error. If you are, install
the native build toolchain (`xcode-select --install` on macOS,
`build-essential` + `python3` on Linux) and re-run.

### Tests fail with `EADDRINUSE`

**Symptom:** `Error: listen EADDRINUSE: address already in use :::3000`
during `npm test`.

**Diagnostic:** `lsof -i :3000`.

**Fix:** kill the stale process. The integration test suite stands up
the Express app via supertest in-process, so it shouldn't bind to
`:3000`. If you see this, a CLI `npm run start:web` is running in
another shell.

---

## Generation — see also [generated-files reference](../reference/generated-files.md)

### Wizard emits far fewer files than expected

**Symptom:** Target directory has only a handful of files; `docs/user-
guide/02-generated-files.md` promised 15–40.

**Diagnostic:** check the role answer. `STRAT_000=ba` / `pm` / `executive`
skips hooks, association-map, and role-technical generators.

**Fix:** re-run as `developer` (or any technical role) if the target
audience is developers.

### `.mcp.json.template` shows up as `modified-by-user` in drift

**Symptom:** Drift report flags the MCP template even though you
haven't touched it.

**Fix:** you committed `.mcp.json` (the filled-in version) instead of
`.mcp.json.template`. The template is intentionally JSONC (with
comments); EmbedIQ writes `.mcp.json.template` and ignores
`.mcp.json` (which is gitignored in the generated `.gitignore`
fragment). Delete `.mcp.json` from the managed subtree or regenerate.

### Files I don't recognize appear under `.claude/`

**Symptom:** `drift` reports files as `extra` that you don't remember
generating.

**Diagnostic:** check the filename — domain packs add their own rule
templates (e.g. `hipaa-phi-handling.md`, `pci-cardholder.md`).

**Fix:** if the domain matches your profile, the files are expected —
your drift answer set is missing an industry answer. Re-run with
`STRAT_002=healthcare` (or whatever industry applies).

---

## Sessions — see [session and resume](07-session-and-resume.md)

### `403 Session belongs to a different user`

**Symptom:** Auth is on; a user clicks a resume URL from a teammate
and gets denied.

**Fix:** sessions are scoped to the `userId` that minted them. Use
the admin **dump/import** flow (`POST /api/sessions/:id/dump` →
admin uploads the tarball to the new user's device) or have each
contributor mint their own session and reconcile via a shared
document.

### Resume URL doesn't jump to the right question

**Symptom:** Opening the resume URL starts from dimension 0 question 0
instead of where the last contributor left off.

**Fix:** the client is calling `GET /api/sessions/:id` instead of
`GET /api/sessions/:id/resume`. Only `/resume` computes next-question
coordinates.

### `401` on every session endpoint

**Symptom:** Every API call returns 401 even though auth is off.

**Fix:** missing `embediq_session_owner` cookie. The cookie is set on
the `POST /api/sessions` response — if your client doesn't forward
cookies (e.g. a `curl` in CI), pass `--cookie-jar` + `--cookie`.

---

## Autopilot — see [autopilot](08-autopilot.md)

### Scheduler never fires

**Symptom:** Schedules sit with `nextRunAt` in the past but no runs
get recorded.

**Diagnostic:**
```bash
echo $EMBEDIQ_AUTOPILOT_ENABLED    # must be 'true'
curl http://localhost:3000/api/autopilot/schedules
```

**Fix:** set `EMBEDIQ_AUTOPILOT_ENABLED=true` before
`npm run start:web`. The env var is read at app creation — restarting
the server is necessary after setting it.

### Run status is always `failure`

**Symptom:** Every autopilot run reports `failure`; the `error` field
explains.

**Typical errors:**

- `Answer source does not exist` → `answerSourcePath` is wrong or the
  server process can't read it. Use absolute paths; check the file's
  owner/permissions.
- `Target directory does not exist` → `targetDir` is wrong.
- `Malformed YAML in <path>` → the answers file has a syntax error.

### Run history disappears

**Symptom:** After a few hundred runs, older ones stop appearing in
`GET /api/autopilot/runs`.

**Fix:** the JSON store caps history at the most recent 500 entries.
Poll and archive to a durable store if you need longer retention.

---

## Git PR integration — see [git-pr-integration](09-git-pr-integration.md)

### `401 Bad credentials`

**Fix:** `EMBEDIQ_GIT_TOKEN` is missing, expired, or lacks scope.
Required scopes: `contents: write` + `pull_requests: write` on the
target repo.

### `404 Not Found` on base ref

**Fix:** `EMBEDIQ_GIT_REPO` is wrong (typo, wrong case) or
`EMBEDIQ_GIT_BASE_BRANCH` doesn't exist. Confirm with
`curl -H "Authorization: Bearer $EMBEDIQ_GIT_TOKEN"
https://api.github.com/repos/$EMBEDIQ_GIT_REPO`.

### `422 Unprocessable Entity` on `POST /pulls`

**Fix:** an identical PR is already open, or the base branch is
protected from PRs. Check the GitHub UI — the response body includes
the specific validation failure.

### PR title/body includes the wrong target list

**Fix:** the PR body is built from `files` passed to
`openPrForGeneration`. If you filtered `--targets` to a subset,
that's what lands in the PR — as intended.

---

## Webhooks — see [notification webhooks](10-notification-webhooks.md) / [compliance webhooks](11-compliance-webhooks.md)

### Outbound webhooks: nothing delivers

**Diagnostic:** `echo $EMBEDIQ_WEBHOOK_URLS`. Watch stderr for
`Webhook subscriber failed for …` lines.

**Typical fixes:**

- URL failed to parse (typo, missing scheme) → fix the string.
- Only one URL fires because commas inside a `?events=` query split
  the list prematurely → use repeated `&events=` query params
  instead, or URL-encode the commas (`%2C`).
- Target returns non-2xx → subscriber logs the error; check the
  target's own incoming-webhook console.

### Slack shows a raw JSON blob

**Fix:** the URL didn't match `hooks.slack.com` (autodetection fell
back to generic). Verify the URL, or force `EMBEDIQ_WEBHOOK_FORMAT=slack`.

### Inbound compliance webhook returns `200 skipped`

**Diagnostic:** check the `reason` in the response body:
- `Adapter ignored the payload` → the adapter decided it's not a
  compliance signal (e.g. Drata `user.created`). Expected.
- `No schedules configured for framework "X"` → no schedule's
  `complianceFrameworks` list includes `X`. Either add the schedule,
  add the framework to an existing schedule, or the event really
  isn't actionable.

### Inbound compliance webhook returns `401`

**Fix:** `X-EmbedIQ-Autopilot-Secret` header missing or mismatched.

---

## Evaluation — see [evaluation and drift](06-evaluation-and-drift.md)

### `Failed to parse JSON at <path>`

**Fix:** the file is malformed JSON. For JSONC files (`.json.template`)
the scorer routes to the text comparator automatically; if you hit
this on a real `.json` file, fix the file.

### Archetype score is 0

**Diagnostic:** run with `--show-failures --failure-limit 20`. The
worst failing checks will surface.

**Typical causes:**

- Generator output differs from `expected/` — either the generator
  changed (regenerate goldens) or the archetype's `answers.yaml` is
  stale.
- `expected/` directory is missing or has a typo in the file path.

### Drift reports stamp-only differences

**Fix:** this shouldn't happen — stamps are stripped before
comparison. If it does, you likely modified the stamp line itself
(rare). Re-generate to restore the current stamp.

---

## Observability — see [operator-guide/observability](../operator-guide/observability.md)

### OpenTelemetry traces not arriving

**Diagnostic:** `echo $EMBEDIQ_OTEL_ENABLED` and check the collector
logs.

**Fix:** `EMBEDIQ_OTEL_ENABLED=true` must be set **at server boot**
(not mid-process). The OTLP endpoint defaults to `http://localhost:4318`
— override via `OTEL_EXPORTER_OTLP_ENDPOINT` if your collector is
elsewhere.

### Audit log is empty

**Fix:** `EMBEDIQ_AUDIT_LOG` must be set to a writable file path. When
unset, `auditLog()` short-circuits to a no-op.

---

## Still stuck?

- Re-read the subsystem guide linked at the top of each section — many
  edge cases have more detail there.
- Check [CHANGELOG.md](../../CHANGELOG.md) for behavior changes between
  versions.
- File an issue with:
  - EmbedIQ version (`cat package.json | jq .version`)
  - Node version (`node --version`)
  - The command you ran + full stderr output
  - The answer set (redact secrets)
