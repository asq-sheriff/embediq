<!-- audience: public -->

# Outbound notification webhooks

EmbedIQ's event bus can fan wizard activity out to any HTTP endpoint:
Slack, Microsoft Teams, PagerDuty, Datadog, your own ingestion pipeline.
A dedicated `WebhookSubscriber` (wired alongside the audit, metrics,
status, OTel, and WebSocket subscribers) auto-detects the right format
per target host and posts asynchronously with per-target failure
isolation.

> **When to use this.** You want the team to see `validation:completed`
> results in Slack, or you want every `session:completed` to kick off a
> downstream audit workflow in your SIEM.

## Enable it

```bash
export EMBEDIQ_WEBHOOK_URLS='https://hooks.slack.com/services/T../B../x,https://outlook.office.com/webhook/y'
npm run start:web
```

- **Comma-separated URL list.** Invalid URLs are logged and skipped —
  a typo in one entry doesn't crash the wizard.
- **Auto-detected formatter.**
  - Host contains `hooks.slack.com` → **Slack Block Kit** message.
  - Host contains `outlook.office.com` → **Microsoft Teams
    MessageCard**.
  - Everything else → **generic JSON envelope**.
- **Override.** Set `EMBEDIQ_WEBHOOK_FORMAT=slack` / `teams` / `generic`
  to force a format regardless of the target host.

## Default event set

By default the subscriber only fires on the four chat-worthy events:

| Event | Fired when | Default payload |
|---|---|---|
| `generation:started` | Orchestrator begins a run | Generator count + session ID |
| `validation:completed` | Output validator finishes | Pass / fail / warn counts |
| `session:started` | Wizard session opens | Session ID, user (if auth on) |
| `session:completed` | Files written | Session ID, file count |

Per-wizard-question events (`question:presented`, `answer:received`,
`dimension:completed`, `file:generated`, `profile:built`) are
**suppressed by default** — they'd flood a Slack channel. Opt a
specific URL in to more events via the query filter below.

## Per-URL event filter

Use repeated `events=` query params (preferred) or URL-encoded
comma-separated values to opt a URL into a non-default event set:

```bash
# Preferred — repeated query params
export EMBEDIQ_WEBHOOK_URLS='https://hooks.slack.com/services/T../B../x?events=generation:started&events=validation:completed'

# Also supported — URL-encoded commas
export EMBEDIQ_WEBHOOK_URLS='https://example.com/hook?events=generation%3Astarted%2Cvalidation%3Acompleted'
```

The `events=` query param is **stripped from the outbound URL** before
the POST, so the filter is never leaked to the receiving platform.

To receive high-frequency events, opt in explicitly:

```
?events=question:presented&events=answer:received
```

Most teams won't want this — use it for SIEM ingestion or debugging.

## Payload shapes

### Generic JSON envelope

Emitted for any URL that isn't auto-detected as Slack or Teams:

```json
{
  "event": "validation:completed",
  "payload": {
    "passCount": 15,
    "failCount": 0,
    "warningCount": 0,
    "checks": [ … ]
  },
  "emittedAt": "2026-04-21T12:34:56.789Z",
  "sessionId": "4b24b7e9-6f8b-4e29-9a2a-73a2d1c6e3a5",
  "userId": "alice@acme.com",
  "requestId": "req-abc",
  "seq": 42
}
```

### Slack Block Kit

Compact message with a header section and a fields section:

```json
{
  "text": "EmbedIQ: validation ✅ passed",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*EmbedIQ: validation ✅ passed*\n15 pass / 0 fail across compliance and universal checks."
      }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*Pass*\n15" },
        { "type": "mrkdwn", "text": "*Fail*\n0" },
        { "type": "mrkdwn", "text": "*Session*\n4b24b7e9-…" }
      ]
    }
  ]
}
```

Non-chat-worthy events fall through to the generic envelope so opt-in
filters still receive something useful.

### Microsoft Teams MessageCard

```json
{
  "@type": "MessageCard",
  "@context": "http://schema.org/extensions",
  "summary": "EmbedIQ: validation ✅ passed",
  "title": "EmbedIQ: validation ✅ passed",
  "text": "15 pass / 0 fail across compliance and universal checks.",
  "sections": [
    {
      "facts": [
        { "name": "Pass", "value": "15" },
        { "name": "Fail", "value": "0" },
        { "name": "Session", "value": "4b24b7e9-…" }
      ]
    }
  ]
}
```

## Walkthroughs

### Slack

1. Create an **Incoming Webhook** in your Slack workspace:
   [https://api.slack.com/apps](https://api.slack.com/apps) → New App →
   Incoming Webhooks → Add New Webhook.
2. Copy the webhook URL. It'll look like
   `https://hooks.slack.com/services/T…/B…/…`.
3. Export it:
   ```bash
   export EMBEDIQ_WEBHOOK_URLS='https://hooks.slack.com/services/T…/B…/…'
   npm run start:web
   ```
4. Run the wizard. Within seconds the Slack channel shows the
   `session:started` message, then `generation:started`, then
   `validation:completed` with the pass/fail counts.

### Microsoft Teams

1. In Teams, open the target channel → **⋯** → **Connectors** →
   **Incoming Webhook** → Configure.
2. Copy the webhook URL. It'll look like
   `https://outlook.office.com/webhook/…`.
3. Export it:
   ```bash
   export EMBEDIQ_WEBHOOK_URLS='https://outlook.office.com/webhook/…'
   ```
4. Messages arrive as MessageCards with the same title/text/facts
   shape as the sample above.

### Generic ingestion (SIEM / Datadog / webhook.site)

Any endpoint that accepts a JSON POST works:

```bash
export EMBEDIQ_WEBHOOK_URLS='https://intake.corp-siem.example/api/v1/events'
```

Optionally opt in to additional events:

```bash
export EMBEDIQ_WEBHOOK_URLS='https://intake.corp-siem.example/api/v1/events?events=session:started&events=session:completed&events=validation:completed&events=file:generated'
```

## Multiple targets

The env var is a **comma-separated list** — fan out to as many targets
as you like:

```bash
export EMBEDIQ_WEBHOOK_URLS='\
  https://hooks.slack.com/services/T../B../x,\
  https://hooks.slack.com/services/T../B../y,\
  https://outlook.office.com/webhook/z,\
  https://intake.corp-siem.example/api/v1/events?events=session:completed'
```

Each URL dispatches independently. A slow or failing target never
blocks the others.

## Reliability guarantees

- **Fire-and-forget.** The subscriber never blocks the wizard on HTTP
  latency.
- **3-second timeout per POST.** Controlled by an AbortController —
  a hanging endpoint is cancelled so it doesn't accumulate in-flight
  requests.
- **Per-target isolation.** If one URL rejects or times out, the others
  still receive their message.
- **No retries.** Lost deliveries are lost. If you need at-least-once
  semantics, post to a durable queue you control (SQS, NATS, Kafka)
  and consume from there.
- **No secret rotation story.** Webhook URLs themselves carry their
  authentication (Slack/Teams URLs contain a secret path component).
  Treat them like passwords; rotate by creating a new webhook and
  updating the env var.

## Troubleshooting

- **Nothing fires.** `EMBEDIQ_WEBHOOK_URLS` isn't set, or every URL
  failed to parse. The subscriber logs every parse failure to stderr.
- **Slack shows a raw JSON block instead of a formatted message.** The
  URL didn't match `hooks.slack.com` — usually because you pasted the
  HTTP debug URL instead of the webhook URL. Fix the URL, or set
  `EMBEDIQ_WEBHOOK_FORMAT=slack`.
- **Teams shows "The incoming webhook is incompatible".** The
  MessageCard format is legacy; Microsoft is migrating to Adaptive
  Cards. Our formatter ships MessageCards today; if you're on a
  tenant that has fully deprecated them, use the generic format and
  consume via a Power Automate flow instead.
- **Expected events aren't arriving.** The default set is only four
  events; add `?events=…` to opt in.
- **`flush()` timing in tests.** The subscriber's `flush()` method
  drains the microtask queue before awaiting in-flight POSTs. If
  you're asserting delivery in a test, always `await subscriber.flush()`
  after emitting.

## See also

- [Compliance webhooks](11-compliance-webhooks.md) — inbound side
  (Drata / Vanta firing autopilot runs)
- [Autopilot](08-autopilot.md) — pair scheduled drift scans with
  Slack/Teams alerts
- [Event bus architecture](../architecture/event-bus.md) — how the
  subscriber dispatches
- [Audit log](../reference/audit-log-schema.md) — an on-disk
  alternative to webhooks
