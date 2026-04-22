import type { EventEnvelope, EventName } from '../../events/types.js';

/** HTTP body produced by a formatter. `null` means "suppress this event". */
export interface WebhookPayload {
  contentType: string;
  body: string;
}

/**
 * A formatter transforms EmbedIQ event envelopes into platform-specific
 * HTTP bodies. Formatters are pure — no I/O, no state — so the subscriber
 * can swap them per URL based on the target host (`hooks.slack.com` gets
 * the Slack formatter, `outlook.office.com` the Teams formatter, etc.).
 */
export interface WebhookFormatter {
  readonly id: WebhookFormat;
  /** Return the payload to POST, or null to drop this event silently. */
  format(env: EventEnvelope): WebhookPayload | null;
}

export type WebhookFormat = 'generic' | 'slack' | 'teams';

/**
 * Events the webhook subscriber considers "notification-worthy" by default.
 * Everything else is dropped — wizard question-level events are too noisy
 * for a Slack channel. Callers can still opt a URL into additional events
 * via the `?events=` query filter.
 */
export const DEFAULT_NOTIFICATION_EVENTS: readonly EventName[] = [
  'generation:started',
  'validation:completed',
  'session:started',
  'session:completed',
];

export function isDefaultEvent(name: EventName): boolean {
  return (DEFAULT_NOTIFICATION_EVENTS as readonly string[]).includes(name);
}

/**
 * Pick a formatter by ID. Centralized so the subscriber does not have to
 * branch on the format string — it just calls this.
 */
export function resolveFormatter(format: WebhookFormat): WebhookFormatter {
  switch (format) {
    case 'slack':   return slackFormatter;
    case 'teams':   return teamsFormatter;
    case 'generic':
    default:        return genericFormatter;
  }
}

/**
 * Auto-detect a format from the target URL's host. Falls back to `generic`
 * for anything we don't recognize. Overridable by the caller via
 * `EMBEDIQ_WEBHOOK_FORMAT` or per-URL config.
 */
export function detectFormat(url: URL): WebhookFormat {
  const host = url.host.toLowerCase();
  if (host.endsWith('hooks.slack.com')) return 'slack';
  if (host.endsWith('outlook.office.com') || host.endsWith('office.com')) return 'teams';
  return 'generic';
}

// ─── Generic formatter (JSON envelope) ───────────────────────────────────

const JSON_CONTENT_TYPE = 'application/json';

function serialize(body: unknown): WebhookPayload {
  return { contentType: JSON_CONTENT_TYPE, body: JSON.stringify(body) };
}

export const genericFormatter: WebhookFormatter = {
  id: 'generic',
  format(env) {
    return serialize({
      event: env.name,
      payload: env.payload,
      emittedAt: env.emittedAt,
      sessionId: env.sessionId,
      userId: env.userId,
      requestId: env.requestId,
      seq: env.seq,
    });
  },
};

// ─── Slack Block Kit formatter ───────────────────────────────────────────

/**
 * Produces a compact Slack message with a one-line header and a fields
 * block. Non-default events fall through to the generic JSON so callers
 * who opt them in via the event filter still get something useful.
 */
export const slackFormatter: WebhookFormatter = {
  id: 'slack',
  format(env) {
    const summary = summarizeForChat(env);
    if (!summary) return genericFormatter.format(env);
    const blocks = [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${summary.title}*\n${summary.subtitle}` },
      },
    ];
    if (summary.fields.length > 0) {
      blocks.push({
        type: 'section',
        // Slack wants up to 10 field objects in a section; we clip to 8
        // to leave room for future diff-vs-baseline pairs without truncating.
        // @ts-expect-error Block Kit allows a `fields` variant; the shape below matches the API.
        fields: summary.fields.slice(0, 8).map((f) => ({
          type: 'mrkdwn',
          text: `*${f.label}*\n${f.value}`,
        })),
      });
    }
    return serialize({ text: summary.title, blocks });
  },
};

// ─── Microsoft Teams Adaptive Card / connector message card ─────────────

export const teamsFormatter: WebhookFormatter = {
  id: 'teams',
  format(env) {
    const summary = summarizeForChat(env);
    if (!summary) return genericFormatter.format(env);
    return serialize({
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: summary.title,
      title: summary.title,
      text: summary.subtitle,
      sections: summary.fields.length > 0
        ? [{
            facts: summary.fields.map((f) => ({ name: f.label, value: String(f.value) })),
          }]
        : undefined,
    });
  },
};

// ─── Shared human summarization for chat-style formatters ────────────────

interface ChatSummary {
  title: string;
  subtitle: string;
  fields: Array<{ label: string; value: string }>;
}

function summarizeForChat(env: EventEnvelope): ChatSummary | null {
  switch (env.name) {
    case 'generation:started':
      return {
        title: 'EmbedIQ: generation started',
        subtitle: `${env.payload.generatorCount} generator${env.payload.generatorCount === 1 ? '' : 's'} running.`,
        fields: env.sessionId ? [{ label: 'Session', value: env.sessionId }] : [],
      };

    case 'validation:completed': {
      const { passCount, failCount } = env.payload;
      const passed = failCount === 0;
      return {
        title: `EmbedIQ: validation ${passed ? '✅ passed' : '❌ failed'}`,
        subtitle: `${passCount} pass / ${failCount} fail across compliance and universal checks.`,
        fields: [
          { label: 'Pass', value: String(passCount) },
          { label: 'Fail', value: String(failCount) },
          ...(env.sessionId ? [{ label: 'Session', value: env.sessionId }] : []),
        ],
      };
    }

    case 'session:started':
      return {
        title: 'EmbedIQ: wizard session started',
        subtitle: `Session \`${env.payload.sessionId}\` opened${env.payload.templateId ? ` from template "${env.payload.templateId}"` : ''}.`,
        fields: env.userId ? [{ label: 'User', value: env.userId }] : [],
      };

    case 'session:completed':
      return {
        title: 'EmbedIQ: wizard session completed',
        subtitle: `${env.payload.fileCount} file${env.payload.fileCount === 1 ? '' : 's'} generated in session \`${env.payload.sessionId}\`.`,
        fields: env.userId ? [{ label: 'User', value: env.userId }] : [],
      };

    // Profile / question / answer / dimension / file events aren't mapped —
    // they'd flood chat. Generic JSON is still available via the event filter.
    default:
      return null;
  }
}
