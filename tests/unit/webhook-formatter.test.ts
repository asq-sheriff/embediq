import { describe, it, expect } from 'vitest';
import {
  detectFormat,
  genericFormatter,
  resolveFormatter,
  slackFormatter,
  teamsFormatter,
  DEFAULT_NOTIFICATION_EVENTS,
  isDefaultEvent,
} from '../../src/integrations/webhooks/formatter.js';
import type { EventEnvelope } from '../../src/events/types.js';

function env<K extends EventEnvelope['name']>(
  name: K,
  payload: Extract<EventEnvelope, { name: K }>['payload'],
  extra: Partial<EventEnvelope> = {},
): EventEnvelope {
  return {
    name,
    payload,
    emittedAt: '2026-04-21T12:00:00Z',
    seq: 1,
    ...extra,
  } as EventEnvelope;
}

describe('detectFormat', () => {
  it('returns slack for hooks.slack.com URLs', () => {
    expect(detectFormat(new URL('https://hooks.slack.com/services/T/B/x'))).toBe('slack');
  });

  it('returns teams for outlook.office.com URLs', () => {
    expect(detectFormat(new URL('https://outlook.office.com/webhook/x'))).toBe('teams');
  });

  it('returns generic for unknown hosts', () => {
    expect(detectFormat(new URL('https://example.com/hook'))).toBe('generic');
  });
});

describe('DEFAULT_NOTIFICATION_EVENTS / isDefaultEvent', () => {
  it('defaults cover the main chat-worthy events', () => {
    expect(DEFAULT_NOTIFICATION_EVENTS).toEqual([
      'generation:started',
      'validation:completed',
      'session:started',
      'session:completed',
    ]);
  });

  it('excludes the high-frequency wizard events by default', () => {
    expect(isDefaultEvent('question:presented')).toBe(false);
    expect(isDefaultEvent('answer:received')).toBe(false);
    expect(isDefaultEvent('file:generated')).toBe(false);
    expect(isDefaultEvent('generation:started')).toBe(true);
  });
});

describe('resolveFormatter', () => {
  it('maps format IDs to the right singleton', () => {
    expect(resolveFormatter('generic')).toBe(genericFormatter);
    expect(resolveFormatter('slack')).toBe(slackFormatter);
    expect(resolveFormatter('teams')).toBe(teamsFormatter);
  });
});

describe('genericFormatter', () => {
  it('emits a canonical JSON envelope', () => {
    const out = genericFormatter.format(env('generation:started', { generatorCount: 12 }, {
      sessionId: 'abc',
      userId: 'alice',
      requestId: 'req-1',
    }));
    expect(out).not.toBeNull();
    expect(out!.contentType).toBe('application/json');
    const parsed = JSON.parse(out!.body) as Record<string, unknown>;
    expect(parsed.event).toBe('generation:started');
    expect((parsed.payload as { generatorCount: number }).generatorCount).toBe(12);
    expect(parsed.sessionId).toBe('abc');
    expect(parsed.userId).toBe('alice');
  });
});

describe('slackFormatter', () => {
  it('produces Block Kit with title, subtitle, and fields for validation events', () => {
    const out = slackFormatter.format(env('validation:completed', {
      passCount: 8,
      failCount: 2,
      checks: [],
    }, { sessionId: 's-1' }));
    expect(out).not.toBeNull();
    const parsed = JSON.parse(out!.body) as { blocks: unknown[]; text: string };
    expect(parsed.text).toContain('validation');
    expect(Array.isArray(parsed.blocks)).toBe(true);
    expect(parsed.blocks.length).toBeGreaterThanOrEqual(1);
  });

  it('falls through to generic for unmapped events', () => {
    const out = slackFormatter.format(env('file:generated', {
      relativePath: 'CLAUDE.md',
      size: 123,
    }));
    expect(out).not.toBeNull();
    const parsed = JSON.parse(out!.body) as { event?: string };
    expect(parsed.event).toBe('file:generated');
  });
});

describe('teamsFormatter', () => {
  it('produces a MessageCard for session:started', () => {
    const out = teamsFormatter.format(env('session:started', {
      sessionId: 'sess-1',
      templateId: 'hipaa-healthcare',
    }, { userId: 'alice' }));
    expect(out).not.toBeNull();
    const parsed = JSON.parse(out!.body) as Record<string, unknown>;
    expect(parsed['@type']).toBe('MessageCard');
    expect(parsed.title).toContain('session started');
    expect(parsed.text).toContain('sess-1');
  });

  it('falls through to generic for unmapped events', () => {
    const out = teamsFormatter.format(env('question:presented', {
      questionId: 'STRAT_000',
      dimension: 'Strategic Intent' as never,
    }));
    expect(out).not.toBeNull();
    const parsed = JSON.parse(out!.body) as { event?: string };
    expect(parsed.event).toBe('question:presented');
  });
});
