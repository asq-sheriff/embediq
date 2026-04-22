import { WebSocket, WebSocketServer } from 'ws';
import type { EventBus, Unsubscribe } from '../bus.js';
import type { EventEnvelope } from '../types.js';
import type { Subscriber } from '../subscriber.js';
// `import type` keeps this file free of a runtime dependency on the sessions
// module; the hub only needs the shape for ownership checks.
import type { SessionBackend } from '../../web/sessions/session-backend.js';

/** Threshold at which a slow client's buffered bytes cause events to be dropped. */
const DEFAULT_BACKPRESSURE_LIMIT_BYTES = 1_048_576; // 1 MB

/**
 * Metadata associated with each active WebSocket connection. Populated
 * when the client sends a `subscribe` frame.
 */
interface Subscription {
  sessionId: string;
  /** Set when the upgrade was authenticated; undefined in no-auth mode. */
  userId?: string;
  /** Events dropped for this client because of backpressure. */
  dropped: number;
}

/** Payload accepted on the client→server direction of the socket. */
type ClientMessage =
  | { type: 'subscribe'; sessionId: string }
  | { type: 'unsubscribe' };

/**
 * Broadcasts bus events to WebSocket clients, filtered by the sessionId
 * each client supplied in its subscribe frame. When the HTTP upgrade was
 * authenticated, events are further gated by `userId` so clients cannot
 * observe other users' sessions even if they guess a session ID.
 *
 * Clients connect to `/ws/events`, then immediately send:
 *   { "type": "subscribe", "sessionId": "<uuid>" }
 *
 * Server frames are the full EventEnvelope as JSON. Late subscribers only
 * see events emitted after their subscribe frame lands — there is no
 * backfill or replay in 6A.
 */
export interface WebSocketHubOptions {
  backpressureLimitBytes?: number;
  /**
   * Session persistence backend. When present, the hub verifies that the
   * authenticated user owns the session named in the subscribe frame.
   * Omitted or `name === 'none'` disables the cross-check.
   */
  backend?: SessionBackend;
}

export class WebSocketHub implements Subscriber {
  readonly name = 'websocket-hub';

  private subscriptions = new Map<WebSocket, Subscription>();
  private readonly backpressureLimit: number;
  private readonly backend?: SessionBackend;

  constructor(
    private readonly server: WebSocketServer,
    opts: WebSocketHubOptions = {},
  ) {
    this.backpressureLimit = opts.backpressureLimitBytes ?? DEFAULT_BACKPRESSURE_LIMIT_BYTES;
    this.backend = opts.backend;
    this.server.on('connection', (ws, req) => this.onConnection(ws, req));
  }

  register(bus: EventBus): Unsubscribe[] {
    return [bus.onAny((env) => this.broadcast(env))];
  }

  /** Number of currently-connected clients (includes pre-subscribe). */
  clientCount(): number {
    return this.subscriptions.size;
  }

  private onConnection(ws: WebSocket, req: unknown): void {
    // Pre-subscribe placeholder — the client must send a subscribe frame
    // before it will receive any events.
    const userId =
      (req as { embediqUser?: { userId: string } } | undefined)?.embediqUser?.userId;
    this.subscriptions.set(ws, { sessionId: '', userId, dropped: 0 });

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // ignore malformed frames — never send an error payload
      }
      if (msg.type === 'subscribe' && typeof msg.sessionId === 'string' && msg.sessionId) {
        this.handleSubscribe(ws, msg.sessionId).catch(() => {
          // Best-effort; verification errors are surfaced via ws.close.
        });
      } else if (msg.type === 'unsubscribe') {
        const current = this.subscriptions.get(ws);
        if (current) current.sessionId = '';
      }
    });

    ws.on('close', () => {
      this.subscriptions.delete(ws);
    });

    ws.on('error', () => {
      this.subscriptions.delete(ws);
    });
  }

  /**
   * Verify a subscribe frame against the backend. sessionId is only
   * stamped onto the subscription once the verification passes, so events
   * emitted while the verification is in-flight do not leak to a client
   * that may ultimately be rejected.
   */
  private async handleSubscribe(ws: WebSocket, sessionId: string): Promise<void> {
    const sub = this.subscriptions.get(ws);
    if (!sub) return;

    if (!this.backend || this.backend.name === 'none') {
      sub.sessionId = sessionId;
      return;
    }

    let session;
    try {
      session = await this.backend.get(sessionId);
    } catch {
      // Backend failure: fail closed.
      ws.close(4500, 'Internal error verifying session ownership');
      return;
    }

    // Freshly-created sessions may not yet be persisted when their first
    // event fires. Allow subscribes to unknown ids; broadcast filtering
    // still requires sessionId match + envelope.userId cross-check.
    if (!session) {
      sub.sessionId = sessionId;
      return;
    }

    if (session.userId && sub.userId && session.userId !== sub.userId) {
      ws.close(4403, 'Forbidden: session belongs to a different user');
      return;
    }

    sub.sessionId = sessionId;
  }

  private broadcast(env: EventEnvelope): void {
    if (this.subscriptions.size === 0) return;
    let payload: string | undefined;

    for (const [ws, sub] of this.subscriptions) {
      if (!sub.sessionId) continue;
      if (env.sessionId !== sub.sessionId) continue;
      // Under auth, prevent cross-user access even if a client guesses a session ID.
      if (sub.userId !== undefined && env.userId !== undefined && sub.userId !== env.userId) {
        continue;
      }
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (ws.bufferedAmount > this.backpressureLimit) {
        sub.dropped++;
        continue;
      }
      if (payload === undefined) payload = JSON.stringify(env);
      try {
        ws.send(payload);
      } catch {
        sub.dropped++;
      }
    }
  }
}
