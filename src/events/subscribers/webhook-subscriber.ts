import type { EventBus, Unsubscribe } from '../bus.js';
import type { EventEnvelope, EventName } from '../types.js';
import type { Subscriber } from '../subscriber.js';
import {
  DEFAULT_NOTIFICATION_EVENTS,
  detectFormat,
  resolveFormatter,
  type WebhookFormat,
  type WebhookFormatter,
} from '../../integrations/webhooks/formatter.js';

const DEFAULT_TIMEOUT_MS = 3_000;

export interface WebhookTargetConfig {
  /** Fully-resolved URL (sans the `events=` query filter). */
  url: string;
  /** Event names this target opted into. Empty = default notification set. */
  events: readonly EventName[];
  /** Explicit formatter override — otherwise autodetected from the host. */
  format?: WebhookFormat;
}

export interface WebhookSubscriberOptions {
  targets: readonly WebhookTargetConfig[];
  /** HTTP timeout per webhook call; defaults to 3 000 ms. */
  timeoutMs?: number;
  /** Injectable fetch for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Called when a webhook POST fails — defaults to console.error. */
  onError?: (err: unknown, target: WebhookTargetConfig) => void;
}

/**
 * Event-bus subscriber that POSTs formatted notifications to external
 * webhook URLs. Runs alongside the five existing subscribers; designed to
 * be fully fire-and-forget — a slow Slack endpoint must never slow the
 * wizard down.
 */
export class WebhookSubscriber implements Subscriber {
  readonly name = 'webhook';

  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly onError: (err: unknown, target: WebhookTargetConfig) => void;
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly options: WebhookSubscriberOptions) {
    this.fetchImpl = options.fetchImpl
      ?? (typeof fetch === 'function' ? fetch : undefined as never);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onError = options.onError ?? defaultOnError;
  }

  register(bus: EventBus): Unsubscribe[] {
    if (this.options.targets.length === 0) return [];
    return [bus.onAny((env) => this.handle(env))];
  }

  /**
   * Await every in-flight POST — useful for tests and graceful shutdown.
   * The event bus dispatches handlers via `queueMicrotask`, so a caller
   * that emits and immediately flushes needs us to yield first; otherwise
   * we'd snapshot `pending` before the dispatch has happened. Loop a few
   * times so a dispatch that itself fan-outs via the bus still drains.
   */
  async flush(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      // Yield once per iteration so queued event-bus microtasks can run.
      await Promise.resolve();
      if (this.pending.size === 0) {
        // Give one more microtask tick to catch a freshly-enqueued dispatch.
        await Promise.resolve();
        if (this.pending.size === 0) return;
      }
      await Promise.allSettled(Array.from(this.pending));
    }
  }

  private handle(env: EventEnvelope): void {
    for (const target of this.options.targets) {
      if (!shouldDeliver(env.name, target)) continue;
      const formatter = resolveFormatter(target.format ?? 'generic');
      const payload = formatter.format(env);
      if (!payload) continue;
      this.dispatch(target, formatter, env, payload.contentType, payload.body);
    }
  }

  private dispatch(
    target: WebhookTargetConfig,
    _formatter: WebhookFormatter,
    _env: EventEnvelope,
    contentType: string,
    body: string,
  ): void {
    const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
    const timeoutHandle = controller
      ? setTimeout(() => controller.abort(), this.timeoutMs)
      : undefined;

    const send = (async () => {
      try {
        const response = await this.fetchImpl(target.url, {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body,
          signal: controller?.signal,
        });
        if (!response.ok) {
          this.onError(
            new Error(`Webhook ${target.url} responded ${response.status}`),
            target,
          );
        }
      } catch (err) {
        this.onError(err, target);
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    })();

    this.pending.add(send);
    send.finally(() => this.pending.delete(send));
  }
}

// ─── URL / env parsing ────────────────────────────────────────────────────

/**
 * Parse `EMBEDIQ_WEBHOOK_URLS` into target configs. The env var is a
 * comma-separated list of URLs; each URL may include an `events=` query
 * parameter listing the event names to opt into. Invalid URLs are logged
 * and skipped — one typo must not crash the wizard.
 *
 *   https://hooks.slack.com/services/T/B/x?events=generation:started,validation:completed
 *   https://outlook.office.com/webhook/x
 *   https://example.com/hook
 */
export function parseWebhookTargetsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): WebhookTargetConfig[] {
  const raw = env.EMBEDIQ_WEBHOOK_URLS ?? '';
  const formatOverride = env.EMBEDIQ_WEBHOOK_FORMAT as WebhookFormat | undefined;
  return parseWebhookTargets(raw, formatOverride);
}

export function parseWebhookTargets(
  raw: string,
  formatOverride?: WebhookFormat,
): WebhookTargetConfig[] {
  if (!raw) return [];
  const out: WebhookTargetConfig[] = [];
  for (const token of raw.split(',').map((t) => t.trim()).filter(Boolean)) {
    try {
      const url = new URL(token);
      const events = parseEventsQuery(url);
      // Strip the events filter from the outbound URL so we don't send it
      // to the provider (Slack ignores it, but some auditors will flag it).
      url.searchParams.delete('events');
      const format = formatOverride ?? detectFormat(url);
      out.push({
        url: url.toString(),
        events,
        format,
      });
    } catch (err) {
      defaultOnError(
        new Error(`Ignoring malformed webhook URL "${token}": ${err instanceof Error ? err.message : String(err)}`),
        { url: token, events: [] } as WebhookTargetConfig,
      );
    }
  }
  return out;
}

function parseEventsQuery(url: URL): readonly EventName[] {
  // Support both `?events=a,b,c` AND `?events=a&events=b&events=c`. The
  // repeated-param form is preferred because comma is also the separator
  // between URLs in the env var — a single URL containing `?events=a,b`
  // gets split at the top level and only the first event survives.
  const all = url.searchParams.getAll('events');
  if (all.length === 0) return []; // [] means "use default notification set"
  const tokens: string[] = [];
  for (const value of all) {
    for (const part of value.split(',').map((t) => t.trim()).filter(Boolean)) {
      tokens.push(part);
    }
  }
  return tokens as EventName[];
}

function shouldDeliver(name: EventName, target: WebhookTargetConfig): boolean {
  if (target.events.length === 0) {
    return (DEFAULT_NOTIFICATION_EVENTS as readonly string[]).includes(name);
  }
  return (target.events as readonly string[]).includes(name);
}

function defaultOnError(err: unknown, target: WebhookTargetConfig): void {
  const url = target.url || '<unknown>';
  // eslint-disable-next-line no-console
  console.error(`Webhook subscriber failed for ${url}:`, err);
}
