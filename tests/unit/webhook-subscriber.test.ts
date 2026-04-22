import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryEventBus } from '../../src/events/bus.js';
import {
  WebhookSubscriber,
  parseWebhookTargets,
  parseWebhookTargetsFromEnv,
  type WebhookTargetConfig,
} from '../../src/events/subscribers/webhook-subscriber.js';

interface MockCall {
  url: string;
  method: string;
  contentType?: string;
  body: unknown;
}

function makeFetch(responses: Array<{ status: number; ok?: boolean }> = [{ status: 200, ok: true }]) {
  const calls: MockCall[] = [];
  let i = 0;
  const impl: typeof fetch = async (input, init = {}) => {
    const spec = responses[Math.min(i++, responses.length - 1)];
    const url = typeof input === 'string' ? input : (input as URL | Request).toString();
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const headers = asHeaderRecord(init.headers);
    calls.push({ url, method: init.method ?? 'GET', contentType: headers['Content-Type'], body });
    return new Response('{}', { status: spec.status });
  };
  return { impl, calls };
}

function asHeaderRecord(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) {
    const out: Record<string, string> = {};
    h.forEach((v, k) => { out[k] = v; });
    return out;
  }
  if (Array.isArray(h)) return Object.fromEntries(h);
  return h as Record<string, string>;
}

describe('parseWebhookTargets', () => {
  it('returns an empty array for an empty input', () => {
    expect(parseWebhookTargets('')).toEqual([]);
    expect(parseWebhookTargets('   ')).toEqual([]);
  });

  it('parses a comma-separated list of URLs', () => {
    const targets = parseWebhookTargets(
      'https://hooks.slack.com/a,https://outlook.office.com/b,https://example.com/c',
    );
    expect(targets).toHaveLength(3);
    expect(targets.map((t) => t.format)).toEqual(['slack', 'teams', 'generic']);
  });

  it('parses repeated events= query params and strips them from the outbound URL', () => {
    const [target] = parseWebhookTargets(
      'https://example.com/hook?events=generation:started&events=validation:completed',
    );
    expect(target.events).toEqual(['generation:started', 'validation:completed']);
    expect(target.url).toBe('https://example.com/hook');
  });

  it('also accepts URL-encoded comma-separated events in a single params value', () => {
    const [target] = parseWebhookTargets(
      'https://example.com/hook?events=generation%3Astarted%2Cvalidation%3Acompleted',
    );
    expect(target.events).toEqual(['generation:started', 'validation:completed']);
  });

  it('keeps other query params intact', () => {
    const [target] = parseWebhookTargets(
      'https://example.com/hook?foo=bar&events=generation:started',
    );
    expect(target.url).toBe('https://example.com/hook?foo=bar');
  });

  it('skips malformed URLs without throwing', () => {
    // Silence the console.error the subscriber emits on bad URLs.
    const orig = console.error;
    console.error = () => {};
    try {
      const targets = parseWebhookTargets('not-a-url,https://example.com/ok');
      expect(targets).toHaveLength(1);
      expect(targets[0].url).toBe('https://example.com/ok');
    } finally {
      console.error = orig;
    }
  });

  it('honors the format override', () => {
    const [target] = parseWebhookTargets('https://example.com/hook', 'slack');
    expect(target.format).toBe('slack');
  });
});

describe('parseWebhookTargetsFromEnv', () => {
  const ENV_KEYS = ['EMBEDIQ_WEBHOOK_URLS', 'EMBEDIQ_WEBHOOK_FORMAT'] as const;
  let snapshot: Record<string, string | undefined>;
  beforeEach(() => {
    snapshot = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (snapshot[k] !== undefined) process.env[k] = snapshot[k]!;
      else delete process.env[k];
    }
  });

  it('returns [] when EMBEDIQ_WEBHOOK_URLS is unset', () => {
    expect(parseWebhookTargetsFromEnv()).toEqual([]);
  });

  it('reads targets from the env var', () => {
    process.env.EMBEDIQ_WEBHOOK_URLS = 'https://example.com/hook';
    const targets = parseWebhookTargetsFromEnv();
    expect(targets).toHaveLength(1);
    expect(targets[0].format).toBe('generic');
  });

  it('applies EMBEDIQ_WEBHOOK_FORMAT as an override', () => {
    process.env.EMBEDIQ_WEBHOOK_URLS = 'https://example.com/hook';
    process.env.EMBEDIQ_WEBHOOK_FORMAT = 'slack';
    expect(parseWebhookTargetsFromEnv()[0].format).toBe('slack');
  });
});

describe('WebhookSubscriber — event delivery', () => {
  it('POSTs to targets that match the default notification event set', async () => {
    const { impl, calls } = makeFetch();
    const bus = new InMemoryEventBus();
    const subscriber = new WebhookSubscriber({
      targets: [{ url: 'https://example.com/hook', events: [], format: 'generic' }],
      fetchImpl: impl,
    });
    subscriber.register(bus);

    bus.emit('generation:started', { generatorCount: 3 });
    bus.emit('answer:received', { questionId: 'x', answerValue: 'y' }); // not default
    await subscriber.flush();

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('https://example.com/hook');
    expect(calls[0].contentType).toBe('application/json');
    expect((calls[0].body as { event: string }).event).toBe('generation:started');
  });

  it('honors the per-target events filter when set', async () => {
    const { impl, calls } = makeFetch();
    const bus = new InMemoryEventBus();
    const subscriber = new WebhookSubscriber({
      targets: [{
        url: 'https://example.com/hook',
        events: ['answer:received'],
        format: 'generic',
      }],
      fetchImpl: impl,
    });
    subscriber.register(bus);

    // generation:started is in the DEFAULT set but not in this target's filter
    bus.emit('generation:started', { generatorCount: 1 });
    // answer:received is not default but IS in the target's filter
    bus.emit('answer:received', { questionId: 'STRAT_000', answerValue: 'developer' });
    await subscriber.flush();

    expect(calls).toHaveLength(1);
    expect((calls[0].body as { event: string }).event).toBe('answer:received');
  });

  it('fans out to multiple targets', async () => {
    const { impl, calls } = makeFetch();
    const bus = new InMemoryEventBus();
    const subscriber = new WebhookSubscriber({
      targets: [
        { url: 'https://example.com/a', events: [], format: 'generic' },
        { url: 'https://example.com/b', events: [], format: 'generic' },
      ],
      fetchImpl: impl,
    });
    subscriber.register(bus);
    bus.emit('generation:started', { generatorCount: 1 });
    await subscriber.flush();
    expect(calls.map((c) => c.url).sort()).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ]);
  });

  it('isolates per-target failures — one bad URL does not block the other', async () => {
    const errors: unknown[] = [];
    const bus = new InMemoryEventBus();
    const subscriber = new WebhookSubscriber({
      targets: [
        { url: 'https://bad.example.com/hook', events: [], format: 'generic' },
        { url: 'https://good.example.com/hook', events: [], format: 'generic' },
      ],
      fetchImpl: async (input) => {
        const url = typeof input === 'string' ? input : (input as URL | Request).toString();
        if (url.includes('bad')) throw new Error('connection refused');
        return new Response('{}', { status: 200 });
      },
      onError: (err, target) => errors.push({ err, target }),
    });
    subscriber.register(bus);
    bus.emit('generation:started', { generatorCount: 1 });
    await subscriber.flush();
    expect(errors).toHaveLength(1);
    expect((errors[0] as { target: WebhookTargetConfig }).target.url).toBe(
      'https://bad.example.com/hook',
    );
  });

  it('reports non-2xx responses via onError', async () => {
    const errors: unknown[] = [];
    const { impl } = makeFetch([{ status: 500 }]);
    const bus = new InMemoryEventBus();
    const subscriber = new WebhookSubscriber({
      targets: [{ url: 'https://example.com/hook', events: [], format: 'generic' }],
      fetchImpl: impl,
      onError: (err) => errors.push(err),
    });
    subscriber.register(bus);
    bus.emit('generation:started', { generatorCount: 1 });
    await subscriber.flush();
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain('500');
  });

  it('does not register any handlers when the target list is empty', () => {
    const bus = new InMemoryEventBus();
    const subscriber = new WebhookSubscriber({ targets: [] });
    const unsubs = subscriber.register(bus);
    expect(unsubs).toEqual([]);
  });
});
