<!-- audience: public -->

# Writing a custom webhook formatter

EmbedIQ ships three outbound webhook formatters — Slack Block Kit,
Microsoft Teams MessageCard, and a canonical JSON envelope. If your
organization uses a different chat / alerting platform (Discord,
Mattermost, Rocket.Chat, PagerDuty events API, your own Kafka ingest,
…), write a custom `WebhookFormatter` that translates EmbedIQ's event
envelope into whatever shape your target wants.

For the user-facing side of webhooks (what `EMBEDIQ_WEBHOOK_URLS`
does, event filters, reliability guarantees), see
[user-guide/10-notification-webhooks.md](../user-guide/10-notification-webhooks.md).

## The `WebhookFormatter` interface

```ts
// src/integrations/webhooks/formatter.ts
export interface WebhookFormatter {
  readonly id: WebhookFormat;
  format(env: EventEnvelope): WebhookPayload | null;
}

export interface WebhookPayload {
  contentType: string;   // e.g. 'application/json'
  body: string;          // already serialized
}
```

Return `null` to suppress delivery for a specific event (e.g. your
target platform can't render `question:presented` and shouldn't
receive it).

## Workflow

1. Write a formatter in TypeScript.
2. Register it — either by adding it to the built-in set for an
   internal fork, or by wrapping `createApp()` and injecting a
   `WebhookSubscriber` that carries your formatter.
3. Wire `EMBEDIQ_WEBHOOK_FORMAT` so your target URLs auto-select the
   new formatter (or set it per-URL).

Let's walk a Discord example — Discord webhooks accept a simple
`{ content, embeds }` shape.

## Example — Discord formatter

```ts
// src/integrations/webhooks/discord-formatter.ts
import type {
  WebhookFormatter,
  WebhookPayload,
} from './formatter.js';
import type { EventEnvelope } from '../../events/types.js';

export const discordFormatter: WebhookFormatter = {
  id: 'discord' as const,
  format(env) {
    // Suppress everything except the four chat-worthy events; match the
    // default-notification-set filter used by Slack/Teams formatters.
    if (!isChatWorthy(env.name)) return null;

    const { title, subtitle, fields } = summarize(env);
    const payload = {
      content: title,
      embeds: [{
        description: subtitle,
        fields: fields.map((f) => ({ name: f.label, value: f.value, inline: true })),
        color: env.name === 'validation:completed' && env.payload.failCount === 0
          ? 0x2ecc71    // green on pass
          : 0xe74c3c,   // red otherwise
      }],
    };
    return serialize(payload);
  },
};

function isChatWorthy(name: string): boolean {
  return [
    'generation:started',
    'validation:completed',
    'session:started',
    'session:completed',
  ].includes(name);
}

interface Summary {
  title: string;
  subtitle: string;
  fields: Array<{ label: string; value: string }>;
}

function summarize(env: EventEnvelope): Summary {
  switch (env.name) {
    case 'validation:completed': {
      const { passCount, failCount } = env.payload;
      return {
        title: `EmbedIQ: validation ${failCount === 0 ? '✅ passed' : '❌ failed'}`,
        subtitle: `${passCount} pass / ${failCount} fail.`,
        fields: [
          { label: 'Pass', value: String(passCount) },
          { label: 'Fail', value: String(failCount) },
        ],
      };
    }
    // … other cases
    default:
      return { title: `EmbedIQ: ${env.name}`, subtitle: '', fields: [] };
  }
}

function serialize(body: unknown): WebhookPayload {
  return { contentType: 'application/json', body: JSON.stringify(body) };
}
```

## Registering the formatter

The built-in registry (`resolveFormatter`, `detectFormat`) lives in
[`src/integrations/webhooks/formatter.ts`](../../src/integrations/webhooks/formatter.ts).
For internal forks, add your formatter there and extend the
`WebhookFormat` union:

```ts
export type WebhookFormat = 'generic' | 'slack' | 'teams' | 'discord';

export function resolveFormatter(format: WebhookFormat): WebhookFormatter {
  switch (format) {
    case 'slack':   return slackFormatter;
    case 'teams':   return teamsFormatter;
    case 'discord': return discordFormatter;
    case 'generic':
    default:        return genericFormatter;
  }
}

export function detectFormat(url: URL): WebhookFormat {
  const host = url.host.toLowerCase();
  if (host.endsWith('hooks.slack.com'))       return 'slack';
  if (host.endsWith('outlook.office.com'))    return 'teams';
  if (host.endsWith('discord.com'))           return 'discord';   // ← added
  return 'generic';
}
```

After that, a URL like
`https://discord.com/api/webhooks/<id>/<token>` auto-detects as
`discord`.

## Registering without forking — at app boot

If you can't modify EmbedIQ source, wrap `createApp()`:

```ts
import { createApp } from 'embediq/web';
import {
  WebhookSubscriber,
  parseWebhookTargetsFromEnv,
} from 'embediq/events';
import { getEventBus, registerDefaultSubscribers } from 'embediq/events';
import { discordFormatter } from './discord-formatter.js';

const bus = getEventBus();

// Pull out targets parsed from EMBEDIQ_WEBHOOK_URLS
const targets = parseWebhookTargetsFromEnv();

// Swap in a subscriber that knows about discord format. For discord
// URLs, set EMBEDIQ_WEBHOOK_FORMAT=discord or add a per-URL
// format annotation (future extension).
registerDefaultSubscribers(bus, { enableWebhooks: false }); // don't auto-register the default
const subscriber = new WebhookSubscriber({
  targets: targets.map((t) => ({
    ...t,
    format: t.url.includes('discord.com') ? 'discord' : t.format,
  })),
  // Custom resolver that honors the discord format
  // (patching not shown — a v4 follow-up exposes a resolver hook).
});
subscriber.register(bus);

const app = createApp();
```

A clean pluggability hook (`resolverOverrides`) is a roadmap item;
until then, forking is the cleanest path for new formatters.

## What the event envelope contains

```ts
interface EventEnvelope {
  name: EventName;                 // e.g. 'validation:completed'
  payload: WizardEvents[EventName];// event-specific body
  emittedAt: string;               // ISO 8601
  seq: number;                     // bus-assigned sequence number
  sessionId?: string;
  userId?: string;
  requestId?: string;
}
```

Which event families the formatter should care about depends on your
platform's ergonomics — Slack / Teams handle about four chat-worthy
events well; PagerDuty only wants `validation:completed` with
`failCount > 0` as an incident trigger; a Kafka ingest might consume
everything. Suppress (return `null`) when you don't want to deliver.

## Reliability

The `WebhookSubscriber` wraps every `format()` call in fire-and-forget
dispatch with a 3-second timeout. Formatters never need to worry
about retries or timeouts — they just need to be:

- **Pure**: no I/O, no state mutation.
- **Fast**: formatters run synchronously on the event loop.
- **Defensive**: handle missing optional fields without throwing.

A formatter that throws logs the error and the delivery is skipped.

## Testing

```ts
import { describe, it, expect } from 'vitest';
import { discordFormatter } from '../src/integrations/webhooks/discord-formatter.js';

describe('discordFormatter', () => {
  it('formats validation:completed with green color on pass', () => {
    const payload = discordFormatter.format({
      name: 'validation:completed',
      payload: { passCount: 15, failCount: 0, checks: [] },
      emittedAt: '2026-04-21T12:00:00Z',
      seq: 1,
    });
    expect(payload).not.toBeNull();
    const body = JSON.parse(payload!.body);
    expect(body.embeds[0].color).toBe(0x2ecc71);
  });

  it('suppresses high-frequency wizard events', () => {
    expect(discordFormatter.format({
      name: 'question:presented',
      payload: { questionId: 'STRAT_000', dimension: 'Strategic Intent' as never },
      emittedAt: '…',
      seq: 1,
    })).toBeNull();
  });
});
```

## See also

- [Notification webhooks user guide](../user-guide/10-notification-webhooks.md)
- [Event bus architecture](../architecture/event-bus.md)
- [Source: built-in formatters](../../src/integrations/webhooks/formatter.ts)
- [Source: webhook subscriber](../../src/events/subscribers/webhook-subscriber.ts)
