<!-- audience: public -->

# Architecture — event bus

An in-process typed event bus decouples the wizard pipeline from
cross-cutting observers (audit, metrics, telemetry, WebSocket fan-out,
outbound webhooks). Emitters declare what happened; subscribers
consume independently without the emitter caring who's listening.

**Source**: [`src/events/`](../../src/events/).

## The `EventBus` interface

```ts
interface EventBus {
  emit<K extends EventName>(name: K, payload: WizardEvents[K]): void;
  on<K extends EventName>(name: K, handler: EventHandler<K>): Unsubscribe;
  off<K extends EventName>(name: K, handler: EventHandler<K>): void;
  onAny(handler: AnyEventHandler): Unsubscribe;
  setErrorHandler(handler: ErrorHandler): void;
}
```

Single implementation ships: `InMemoryEventBus`. Multi-process or
distributed dispatch would need a new adapter but no callers change —
they only see the interface.

## `EventEnvelope` — what subscribers receive

```ts
type EventEnvelope<K extends EventName = EventName> = K extends EventName
  ? {
      name: K;
      payload: WizardEvents[K];
      requestId?: string;
      userId?: string;
      sessionId?: string;
      emittedAt: string;    // ISO 8601, stamped at emit time
      seq: number;          // monotonic per-bus
    }
  : never;
```

Metadata (`requestId`, `userId`, `sessionId`) is auto-populated from
the `AsyncLocalStorage` request context at emit time. Callers don't
thread them through function signatures.

## Nine core events

```ts
interface WizardEvents {
  'question:presented': { questionId; dimension };
  'answer:received':    { questionId; answerValue };
  'dimension:completed':{ dimension; questionsAnswered };
  'profile:built':      { profileSummary };
  'generation:started': { generatorCount };
  'file:generated':     { relativePath; size };
  'validation:completed':{ passCount; failCount; checks };
  'session:started':    { sessionId; templateId? };
  'session:completed':  { sessionId; fileCount };
}
```

Adding a new event: extend `WizardEvents` + the enum in
`src/events/types.ts`, update emitters to fire it, update subscribers
that should observe it. TypeScript's discriminated-union narrowing
works inside `switch (env.name)` in every subscriber.

## Dispatch semantics — `queueMicrotask`

```ts
// InMemoryEventBus.emit
emit(name, payload) {
  const envelope = buildEnvelope(name, payload);  // sync
  queueMicrotask(() => {
    for (const handler of namedSnapshot) runSafely(handler, envelope);
    for (const handler of anySnapshot)   runSafely(handler, envelope);
  });
}
```

Why `queueMicrotask` rather than direct calls?

- **Emitter stays synchronous.** A slow subscriber can't extend the
  emitting request's latency.
- **Handler failure isolation.** An exception in one subscriber
  doesn't abort others — `runSafely` catches and forwards to the
  error handler.
- **Ordering guarantee.** Within one bus, events deliver in the
  order they were emitted (queueMicrotask is FIFO).

One subtle consequence: `bus.emit(…)` returns **before any subscriber
runs**. Tests that emit and then immediately assert on subscriber
side-effects must either `await` a microtask or call a subscriber-
specific `flush()` (e.g. `WebhookSubscriber.flush()`).

## `Subscriber` — the convention

Not a strict interface, but every built-in subscriber follows:

```ts
interface Subscriber {
  readonly name: string;
  register(bus: EventBus): Unsubscribe[];
}
```

`register` subscribes to whichever events the subscriber cares about
and returns the unsubscribe functions. The `registerDefaultSubscribers`
helper composes these into a single teardown function.

## The six built-in subscribers

| Subscriber | Source | Purpose |
|---|---|---|
| **AuditSubscriber** | `audit-subscriber.ts` | Writes JSONL audit entries (no-op when `EMBEDIQ_AUDIT_LOG` unset). |
| **MetricsCollector** | `metrics-collector.ts` | In-memory counts — callers query for dashboards. |
| **StatusReconciler** | `status-reconciler.ts` | Tracks session phase; rehydrates from backend on `session:started`. |
| **OtelSubscriber** | `otel-subscriber.ts` | OTel counters (`embediq.files_generated`, `embediq.generation_runs`, `embediq.validations`). |
| **WebSocketHub** | `websocket-hub.ts` | Fan-out to subscribed WS clients; ownership-gated by session. |
| **WebhookSubscriber** | `webhook-subscriber.ts` | Outbound HTTP POSTs to Slack / Teams / generic endpoints. |

All six are opt-in or opt-out via booleans / env vars on
`registerDefaultSubscribers()`. Missing dependencies (OTel SDK,
ws server) degrade gracefully to noop rather than erroring.

## `registerDefaultSubscribers` — the composition point

```ts
function registerDefaultSubscribers(
  bus: EventBus,
  options: RegisterSubscribersOptions,
): RegisteredSubscribers;
```

Returns a `teardown()` closure plus references to stateful
subscribers (metrics, status reconciler, WS hub, webhooks) so
callers can query them (e.g. the health endpoint reads the status
reconciler).

Both the CLI (`src/index.ts`) and web server (`src/web/server.ts`)
call this at app boot.

## Error handling

`bus.setErrorHandler(handler)` lets tests / custom deployments
override the default `console.error` behavior. The default logs the
subscriber name + error + envelope name — enough to identify the
bad subscriber without dumping the whole payload.

A subscriber that throws on every event will spam the error log
but won't break the bus. `onAny` handlers that throw don't prevent
named handlers from running.

## Ordering guarantees

- **Within a bus instance**: events deliver in `seq` order.
- **Across subscribers**: named subscribers run before `onAny`
  subscribers (consequence of iteration order in `emit`).
- **Across event types**: no cross-event-type ordering guarantee —
  a subscriber seeing `validation:completed` can't assume every
  `file:generated` has already arrived, since they're handled in a
  single microtask batch and the handler order is unspecified.
  Subscribers that need "after all files" semantics should listen
  for `session:completed` or `validation:completed` (emitted by the
  orchestrator after every generator finishes).

## Why in-memory?

- **Low event volume.** A wizard run emits tens of events, not
  thousands.
- **Same-process subscribers.** Audit log writes, OTel metric
  increments, WS broadcasts — all in the same Node process. A
  queue/broker would add complexity without value.
- **Testability.** Unit tests construct an `InMemoryEventBus`
  directly, register a spy subscriber, emit, and assert on the
  spy.

When a future feature needs cross-process fan-out (distributed
tracing that spans an external worker, say), the `EventBus` interface
supports a new adapter without touching emitters or subscribers.

## See also

- [Event-bus types](../../src/events/types.ts) — canonical
  `WizardEvents` map
- [`InMemoryEventBus` source](../../src/events/bus.ts)
- [Subscribers source](../../src/events/subscribers/)
- [Observability operator guide](../operator-guide/observability.md) —
  consumer perspective
- [WebSocket reference](../reference/websocket-api.md) — the
  client-visible event stream
