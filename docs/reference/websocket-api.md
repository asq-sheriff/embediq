<!-- audience: public -->

# WebSocket event stream

EmbedIQ's web server exposes a single WebSocket endpoint — `/ws/events`
— that streams live wizard activity to interested clients. The
frontend uses it to render progress while the server-side synthesizer
runs; external integrations can use it to implement near-real-time
dashboards without polling.

## Endpoint

```
ws://<host>:<port>/ws/events
wss://<host>:<port>/ws/events
```

Connect using any standard WebSocket client. When the server is
configured with TLS (in-process or at a reverse proxy), use `wss://`.

## Authentication

- When the main server auth strategy is **off**, the upgrade succeeds
  unconditionally.
- When auth is **on** (`basic`, `oidc`, or `proxy`), the HTTP upgrade
  request is authenticated exactly like a normal API call. The
  resulting user identity is attached to the connection.
- Authorization (who can *see* which events) happens at the
  subscribe frame — see next.

## Protocol

The protocol is deliberately minimal: two client-initiated frames,
one server frame type, JSON over text.

### Client → server frames

```json
{ "type": "subscribe",   "sessionId": "<uuid>" }
{ "type": "unsubscribe" }
```

`subscribe` binds the connection to a specific `sessionId`. The server
checks ownership:

- **Auth on**: the authenticated user must match the session's
  `userId`.
- **Auth off**: the connection must have presented the
  `embediq_session_owner` cookie at upgrade time, signed with the
  current or previous `EMBEDIQ_SESSION_COOKIE_SECRET`.

Subscribes to unknown session ids are accepted (the server can't tell
if the id will be created shortly). Broadcast filtering happens on
emit — the client simply won't see events for sessions that don't
exist.

Only one `subscribe` at a time per connection. Sending a second
`subscribe` replaces the binding.

### Server → client frames

Every server frame is an `EventEnvelope` serialized as JSON:

```json
{
  "name": "validation:completed",
  "payload": {
    "passCount": 15,
    "failCount": 0,
    "checks": [ … ]
  },
  "emittedAt": "2026-04-21T12:34:56.789Z",
  "seq": 42,
  "sessionId": "<uuid>",
  "userId": "alice@acme.com",
  "requestId": "req-abc"
}
```

`name` comes from the event bus vocabulary — see
[`events/types.ts`](../../src/events/types.ts). The event families the
server broadcasts today:

| Event name | Meaning |
|---|---|
| `session:started` | Wizard session opened. |
| `session:completed` | Session finalized (files written). |
| `question:presented` | User was shown a question. |
| `answer:received` | Answer recorded. |
| `dimension:completed` | Visible questions in a dimension exhausted. |
| `profile:built` | Profile computed from answers. |
| `generation:started` | Orchestrator begins. |
| `file:generated` | One file produced. |
| `validation:completed` | Output validator finished. |

Frames **only** include events whose `sessionId` matches the
subscriber's binding. The per-emit context fill happens in
`InMemoryEventBus.emit` — see
[architecture/event-bus.md](../architecture/event-bus.md).

### Ordering guarantees

- Events within a single session are delivered in `seq` order.
- No replay: a subscriber that connects mid-generation sees only
  events emitted *after* its subscribe frame lands. There is no
  history buffer.
- The server drops frames on connection error without notifying the
  peer (the connection then closes).

## Example client (browser)

```js
const ws = new WebSocket('wss://embediq.example.com/ws/events');
ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'subscribe', sessionId: '<uuid>' }));
};
ws.onmessage = (frame) => {
  const env = JSON.parse(frame.data);
  console.log(env.name, env.payload);
};
ws.onclose = (e) => console.warn('closed', e.code, e.reason);
```

## Example client (Node / Python)

### Node (`ws`)

```js
import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3000/ws/events', {
  headers: { Cookie: 'embediq_session_owner=<signed-token>' },
});
ws.on('open',    () => ws.send(JSON.stringify({ type: 'subscribe', sessionId: '<uuid>' })));
ws.on('message', (data) => {
  const env = JSON.parse(data.toString());
  console.log(env.name, env.payload);
});
```

### Python (`websockets`)

```python
import json, asyncio, websockets

async def main():
    async with websockets.connect('ws://localhost:3000/ws/events',
                                  extra_headers={'Cookie': 'embediq_session_owner=<token>'}) as ws:
        await ws.send(json.dumps({'type': 'subscribe', 'sessionId': '<uuid>'}))
        async for frame in ws:
            env = json.loads(frame)
            print(env['name'], env['payload'])

asyncio.run(main())
```

## Capacity & limits

- No explicit per-connection limit is enforced by EmbedIQ; your
  reverse proxy / ingress is the bottleneck.
- The event bus is in-process — all subscribers share the same Node
  event loop. A deployment with thousands of active subscribers needs
  the same horizontal-scale planning as any other long-lived
  WebSocket workload (sticky sessions, sharded by session id, etc.).
- WebSocket messages are push-only; the client never receives
  acknowledgements beyond TCP backpressure.

## Troubleshooting

- **Connection upgrades to HTTP 401.** Auth is on and the upgrade
  request failed auth. For OIDC, attach the bearer token to the
  upgrade (browsers can't set custom headers on `new WebSocket(…)` —
  route via a reverse proxy that forwards the cookie or use an
  authenticated tunnel like `oauth2-proxy`).
- **No frames after subscribe.** The session has no activity yet, or
  the `sessionId` doesn't match any activity on this server instance.
  Confirm with `GET /api/sessions/:id/resume` — if that 404s, the id
  is wrong or expired.
- **`ws.readyState === CLOSED` immediately after open.** The server
  rejected the subscribe (ownership mismatch). Check stderr for a
  `WebSocketHub: subscribe denied` line.
- **Client stops receiving frames mid-session.** The WS connection
  went idle and a proxy closed it. Configure ping/pong at your
  reverse proxy (nginx: `proxy_read_timeout` > expected idle time;
  or have the client send a periodic no-op to keep the connection
  warm).

## See also

- [Event bus architecture](../architecture/event-bus.md) — how
  handlers dispatch, ordering semantics
- [Sessions & resume](../user-guide/07-session-and-resume.md) —
  where `sessionId` comes from
- [REST API](rest-api.md) — HTTP endpoints that emit the events this
  stream carries
