import { describe, it, expect } from 'vitest';
import { resolveEngagementId, withEngagementSubpath } from '../../src/util/engagement.js';

describe('resolveEngagementId', () => {
  it('returns undefined when EMBEDIQ_ENGAGEMENT_ID is unset', () => {
    expect(resolveEngagementId({})).toBeUndefined();
  });

  it('returns undefined for empty string and whitespace-only values', () => {
    expect(resolveEngagementId({ EMBEDIQ_ENGAGEMENT_ID: '' })).toBeUndefined();
    expect(resolveEngagementId({ EMBEDIQ_ENGAGEMENT_ID: '   ' })).toBeUndefined();
  });

  it('returns the trimmed value when valid', () => {
    expect(resolveEngagementId({ EMBEDIQ_ENGAGEMENT_ID: '  acme-q4  ' })).toBe('acme-q4');
    expect(resolveEngagementId({ EMBEDIQ_ENGAGEMENT_ID: 'eng_001' })).toBe('eng_001');
    expect(resolveEngagementId({ EMBEDIQ_ENGAGEMENT_ID: 'Project.X-42' })).toBe('Project.X-42');
  });

  it('accepts the full allowed character set: letters, digits, dot, underscore, hyphen', () => {
    const id = 'aZ0._-9';
    expect(resolveEngagementId({ EMBEDIQ_ENGAGEMENT_ID: id })).toBe(id);
  });

  it('rejects path separators', () => {
    expect(() => resolveEngagementId({ EMBEDIQ_ENGAGEMENT_ID: 'a/b' })).toThrow(/not a valid/);
    expect(() => resolveEngagementId({ EMBEDIQ_ENGAGEMENT_ID: 'a\\b' })).toThrow(/not a valid/);
  });

  it('rejects path traversal sequences', () => {
    expect(() => resolveEngagementId({ EMBEDIQ_ENGAGEMENT_ID: '..' })).toThrow(/not a valid/);
    expect(() => resolveEngagementId({ EMBEDIQ_ENGAGEMENT_ID: '../escape' })).toThrow(/not a valid/);
  });

  it('rejects spaces and shell-special characters', () => {
    expect(() => resolveEngagementId({ EMBEDIQ_ENGAGEMENT_ID: 'has space' })).toThrow(/not a valid/);
    expect(() => resolveEngagementId({ EMBEDIQ_ENGAGEMENT_ID: 'a;b' })).toThrow(/not a valid/);
    expect(() => resolveEngagementId({ EMBEDIQ_ENGAGEMENT_ID: 'a$b' })).toThrow(/not a valid/);
  });

  it('rejects values longer than 64 characters', () => {
    const tooLong = 'a'.repeat(65);
    expect(() => resolveEngagementId({ EMBEDIQ_ENGAGEMENT_ID: tooLong })).toThrow(/not a valid/);
  });

  it('accepts values exactly 64 characters long', () => {
    const maxLen = 'a'.repeat(64);
    expect(resolveEngagementId({ EMBEDIQ_ENGAGEMENT_ID: maxLen })).toBe(maxLen);
  });
});

describe('withEngagementSubpath', () => {
  it('returns the path unchanged when engagementId is undefined', () => {
    expect(withEngagementSubpath('./.embediq/sessions', undefined)).toBe('./.embediq/sessions');
    expect(withEngagementSubpath('/var/lib/embediq/data', undefined)).toBe('/var/lib/embediq/data');
  });

  it('inserts engagements/<id> immediately after a .embediq segment', () => {
    expect(withEngagementSubpath('./.embediq/sessions', 'acme-q4')).toBe(
      './.embediq/engagements/acme-q4/sessions',
    );
    expect(withEngagementSubpath('./.embediq/autopilot', 'eng-alpha')).toBe(
      './.embediq/engagements/eng-alpha/autopilot',
    );
    expect(withEngagementSubpath('./.embediq/sessions.db', 'eng-1')).toBe(
      './.embediq/engagements/eng-1/sessions.db',
    );
  });

  it('inserts before the final segment when no .embediq segment is present', () => {
    expect(withEngagementSubpath('./state/sessions', 'eng-1')).toBe(
      './state/engagements/eng-1/sessions',
    );
    expect(withEngagementSubpath('/var/lib/embediq-state/sessions', 'eng-1')).toBe(
      '/var/lib/embediq-state/engagements/eng-1/sessions',
    );
  });

  it('handles a single-segment path by prepending engagements/<id>/', () => {
    expect(withEngagementSubpath('sessions', 'eng-1')).toBe('engagements/eng-1/sessions');
  });

  it('uses the last .embediq segment when the path contains multiple', () => {
    // Edge case — pathologically nested, but make sure we pick the deepest one
    expect(withEngagementSubpath('./.embediq/sub/.embediq/sessions', 'eng-1')).toBe(
      './.embediq/sub/.embediq/engagements/eng-1/sessions',
    );
  });
});
