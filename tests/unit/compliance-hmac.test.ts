import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  hmacSha256Hex,
  timingSafeCompare,
} from '../../src/integrations/compliance/hmac.js';
import {
  drataAdapter,
  vantaAdapter,
  genericComplianceAdapter,
  signingSecretEnvVar,
} from '../../src/integrations/compliance/index.js';

describe('hmacSha256Hex', () => {
  it('computes the same digest for an identical buffer and string body', () => {
    const body = '{"event":"monitor.failed"}';
    const fromString = hmacSha256Hex('secret', body);
    const fromBuffer = hmacSha256Hex('secret', Buffer.from(body, 'utf-8'));
    expect(fromString).toBe(fromBuffer);
  });

  it('matches the standard library HMAC computation', () => {
    const expected = createHmac('sha256', 'secret').update('hello').digest('hex');
    expect(hmacSha256Hex('secret', 'hello')).toBe(expected);
  });

  it('returns a 64-character lowercase hex digest', () => {
    const out = hmacSha256Hex('s', '');
    expect(out).toHaveLength(64);
    expect(out).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('timingSafeCompare', () => {
  it('returns true for matching strings', () => {
    expect(timingSafeCompare('abc123', 'abc123')).toBe(true);
  });

  it('returns false for different strings of equal length', () => {
    expect(timingSafeCompare('abc123', 'abc124')).toBe(false);
  });

  it('returns false for strings of different length without throwing', () => {
    expect(timingSafeCompare('abc', 'abcdef')).toBe(false);
  });

  it('strips a leading sha256= prefix from the presented value before comparing', () => {
    const digest = hmacSha256Hex('secret', 'payload');
    expect(timingSafeCompare(digest, `sha256=${digest}`)).toBe(true);
  });
});

describe('signingSecretEnvVar', () => {
  it('uppercases and prefixes the adapter id', () => {
    expect(signingSecretEnvVar('drata')).toBe('EMBEDIQ_COMPLIANCE_SECRET_DRATA');
    expect(signingSecretEnvVar('vanta')).toBe('EMBEDIQ_COMPLIANCE_SECRET_VANTA');
    expect(signingSecretEnvVar('generic')).toBe('EMBEDIQ_COMPLIANCE_SECRET_GENERIC');
  });

  it('rewrites non-alphanumeric characters to underscores so custom adapter ids still produce a legal env var', () => {
    expect(signingSecretEnvVar('my-custom.adapter')).toBe('EMBEDIQ_COMPLIANCE_SECRET_MY_CUSTOM_ADAPTER');
  });
});

describe('per-adapter verifySignature', () => {
  const body = '{"event":"x"}';
  const rawBody = Buffer.from(body, 'utf-8');

  it('Drata accepts a correct x-drata-signature and rejects everything else', () => {
    const secret = 'drata-secret';
    const sig = hmacSha256Hex(secret, rawBody);
    expect(drataAdapter.verifySignature?.({
      rawBody, secret, headers: { 'x-drata-signature': sig },
    })).toBe(true);

    expect(drataAdapter.verifySignature?.({
      rawBody, secret, headers: { 'x-drata-signature': 'a'.repeat(64) },
    })).toBe(false);

    expect(drataAdapter.verifySignature?.({
      rawBody, secret, headers: {},
    })).toBe(false);
  });

  it('Vanta accepts a correct x-vanta-signature', () => {
    const secret = 'vanta-secret';
    const sig = hmacSha256Hex(secret, rawBody);
    expect(vantaAdapter.verifySignature?.({
      rawBody, secret, headers: { 'x-vanta-signature': sig },
    })).toBe(true);
  });

  it('Generic accepts both bare and sha256-prefixed digests', () => {
    const secret = 'generic-secret';
    const sig = hmacSha256Hex(secret, rawBody);
    expect(genericComplianceAdapter.verifySignature?.({
      rawBody, secret, headers: { 'x-embediq-signature': sig },
    })).toBe(true);
    expect(genericComplianceAdapter.verifySignature?.({
      rawBody, secret, headers: { 'x-embediq-signature': `sha256=${sig}` },
    })).toBe(true);
  });
});
