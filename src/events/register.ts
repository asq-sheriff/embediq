import type { WebSocketServer } from 'ws';
import type { EventBus, Unsubscribe } from './bus.js';
import type { SessionBackend } from '../web/sessions/session-backend.js';
import { AuditSubscriber } from './subscribers/audit-subscriber.js';
import { MetricsCollector } from './subscribers/metrics-collector.js';
import { StatusReconciler } from './subscribers/status-reconciler.js';
import { OtelSubscriber } from './subscribers/otel-subscriber.js';
import { WebSocketHub } from './subscribers/websocket-hub.js';
import {
  WebhookSubscriber,
  parseWebhookTargetsFromEnv,
  type WebhookTargetConfig,
} from './subscribers/webhook-subscriber.js';

export interface RegisterSubscribersOptions {
  /** Wire the audit log subscriber (noop when EMBEDIQ_AUDIT_LOG is unset). */
  enableAudit?: boolean;
  /** Wire the in-memory metrics aggregator. */
  enableMetrics?: boolean;
  /** Wire the session status reconciler. */
  enableStatus?: boolean;
  /**
   * Wire the OpenTelemetry subscriber. When OTel SDK is not initialized,
   * the @opentelemetry/api noop implementations mean zero runtime cost.
   */
  enableOtel?: boolean;
  /**
   * Attach a WebSocketHub to the provided ws server. The caller owns the
   * server (upgrade handler, auth, close). When omitted, no WS fan-out
   * happens.
   */
  wsServer?: WebSocketServer;
  /**
   * Session persistence backend. When present, the StatusReconciler rehydrates
   * phase from the backend on `session:started` so process restarts do not
   * lose phase tracking.
   */
  sessionBackend?: SessionBackend;
  /**
   * Wire the outbound webhook subscriber. Auto-enables when
   * `EMBEDIQ_WEBHOOK_URLS` is set — callers can force-disable by passing
   * `false`, or pre-supply a target list by passing an array (bypasses
   * the env parser, e.g. for tests).
   */
  enableWebhooks?: boolean | readonly WebhookTargetConfig[];
}

export interface RegisteredSubscribers {
  /** Tear down every registered handler. Idempotent. */
  teardown: () => void;
  /** Metrics collector instance when `enableMetrics` was set. */
  metrics: MetricsCollector | undefined;
  /** Status reconciler instance when `enableStatus` was set. */
  status: StatusReconciler | undefined;
  /** WebSocket hub instance when `wsServer` was provided. */
  wsHub: WebSocketHub | undefined;
  /** Webhook subscriber instance when outbound webhooks were configured. */
  webhooks: WebhookSubscriber | undefined;
}

/**
 * Wire default subscribers onto a bus. The returned handle holds references
 * to any stateful subscribers so callers can query them (metrics snapshots,
 * session phase lookups) and a teardown function to remove every handler
 * on shutdown or test cleanup.
 */
export function registerDefaultSubscribers(
  bus: EventBus,
  opts: RegisterSubscribersOptions = {},
): RegisteredSubscribers {
  const unsubscribers: Unsubscribe[] = [];
  let metrics: MetricsCollector | undefined;
  let status: StatusReconciler | undefined;
  let wsHub: WebSocketHub | undefined;
  let webhooks: WebhookSubscriber | undefined;

  if (opts.enableAudit) {
    const audit = new AuditSubscriber();
    unsubscribers.push(...audit.register(bus));
  }

  if (opts.enableMetrics) {
    metrics = new MetricsCollector();
    unsubscribers.push(...metrics.register(bus));
  }

  if (opts.enableStatus) {
    status = new StatusReconciler({ backend: opts.sessionBackend });
    unsubscribers.push(...status.register(bus));
  }

  if (opts.enableOtel) {
    const otel = new OtelSubscriber();
    unsubscribers.push(...otel.register(bus));
  }

  if (opts.wsServer) {
    wsHub = new WebSocketHub(opts.wsServer, { backend: opts.sessionBackend });
    unsubscribers.push(...wsHub.register(bus));
  }

  // Webhook subscriber. Auto-detect from EMBEDIQ_WEBHOOK_URLS, honor an
  // explicit `false`, or use a caller-supplied target list (tests).
  const webhooksOption = opts.enableWebhooks;
  if (webhooksOption !== false) {
    const targets = Array.isArray(webhooksOption)
      ? webhooksOption
      : parseWebhookTargetsFromEnv();
    if (targets.length > 0) {
      webhooks = new WebhookSubscriber({ targets });
      unsubscribers.push(...webhooks.register(bus));
    }
  }

  return {
    teardown: () => {
      while (unsubscribers.length > 0) {
        const fn = unsubscribers.pop();
        try {
          fn?.();
        } catch {
          // subscribers tear down best-effort
        }
      }
    },
    metrics,
    status,
    wsHub,
    webhooks,
  };
}
