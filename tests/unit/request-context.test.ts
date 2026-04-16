import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runWithContext,
  getRequestContext,
  createRequestContext,
  type RequestContext,
} from '../../src/context/request-context.js';
import { auditLog } from '../../src/util/wizard-audit.js';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

describe('RequestContext', () => {
  describe('createRequestContext', () => {
    it('generates a UUID requestId', () => {
      const ctx = createRequestContext();
      expect(ctx.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('sets startedAt to a positive number', () => {
      const ctx = createRequestContext();
      expect(ctx.startedAt).toBeGreaterThan(0);
    });

    it('includes user info when provided', () => {
      const ctx = createRequestContext({
        userId: 'user-123',
        displayName: 'Test User',
        roles: ['wizard-admin'],
      });
      expect(ctx.userId).toBe('user-123');
      expect(ctx.displayName).toBe('Test User');
      expect(ctx.roles).toEqual(['wizard-admin']);
    });

    it('leaves user fields undefined when not provided', () => {
      const ctx = createRequestContext();
      expect(ctx.userId).toBeUndefined();
      expect(ctx.displayName).toBeUndefined();
      expect(ctx.roles).toBeUndefined();
    });
  });

  describe('runWithContext / getRequestContext', () => {
    it('returns undefined outside a context scope', () => {
      expect(getRequestContext()).toBeUndefined();
    });

    it('returns the context inside a synchronous scope', () => {
      const ctx = createRequestContext({ userId: 'sync-user' });
      runWithContext(ctx, () => {
        const retrieved = getRequestContext();
        expect(retrieved).toBeDefined();
        expect(retrieved!.userId).toBe('sync-user');
        expect(retrieved!.requestId).toBe(ctx.requestId);
      });
    });

    it('returns the context inside an async scope', async () => {
      const ctx = createRequestContext({ userId: 'async-user' });
      await new Promise<void>((resolve) => {
        runWithContext(ctx, () => {
          setTimeout(() => {
            const retrieved = getRequestContext();
            expect(retrieved).toBeDefined();
            expect(retrieved!.userId).toBe('async-user');
            resolve();
          }, 10);
        });
      });
    });

    it('isolates concurrent contexts', async () => {
      const results: string[] = [];

      const p1 = new Promise<void>((resolve) => {
        const ctx = createRequestContext({ userId: 'user-A' });
        runWithContext(ctx, () => {
          setTimeout(() => {
            results.push(getRequestContext()!.userId!);
            resolve();
          }, 20);
        });
      });

      const p2 = new Promise<void>((resolve) => {
        const ctx = createRequestContext({ userId: 'user-B' });
        runWithContext(ctx, () => {
          setTimeout(() => {
            results.push(getRequestContext()!.userId!);
            resolve();
          }, 10);
        });
      });

      await Promise.all([p1, p2]);
      // p2 resolves first (10ms) then p1 (20ms) — contexts must not leak
      expect(results).toEqual(['user-B', 'user-A']);
    });

    it('returns undefined after context scope exits', () => {
      const ctx = createRequestContext({ userId: 'scoped' });
      runWithContext(ctx, () => {
        expect(getRequestContext()!.userId).toBe('scoped');
      });
      // Outside the scope
      expect(getRequestContext()).toBeUndefined();
    });
  });

  describe('audit log integration with request context', () => {
    const TEST_DIR = join(process.cwd(), 'tests', '.tmp-ctx-audit-test');
    const LOG_PATH = join(TEST_DIR, 'audit.jsonl');

    beforeEach(() => {
      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
      mkdirSync(TEST_DIR, { recursive: true });
      process.env.EMBEDIQ_AUDIT_LOG = LOG_PATH;
    });

    afterEach(() => {
      delete process.env.EMBEDIQ_AUDIT_LOG;
      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    });

    it('auto-enriches audit entries with userId and requestId from context', () => {
      const ctx = createRequestContext({ userId: 'ctx-user' });
      runWithContext(ctx, () => {
        auditLog({
          timestamp: '2026-04-16T00:00:00Z',
          eventType: 'session_start',
        });
      });

      const entry = JSON.parse(readFileSync(LOG_PATH, 'utf-8').trim());
      expect(entry.userId).toBe('ctx-user');
      expect(entry.requestId).toBe(ctx.requestId);
    });

    it('explicit entry values take precedence over context', () => {
      const ctx = createRequestContext({ userId: 'ctx-user' });
      runWithContext(ctx, () => {
        auditLog({
          timestamp: '2026-04-16T00:00:00Z',
          eventType: 'session_start',
          userId: 'explicit-user',
        });
      });

      const entry = JSON.parse(readFileSync(LOG_PATH, 'utf-8').trim());
      expect(entry.userId).toBe('explicit-user');
      // requestId still comes from context since not explicitly set
      expect(entry.requestId).toBe(ctx.requestId);
    });

    it('works without context (CLI mode) — no enrichment', () => {
      auditLog({
        timestamp: '2026-04-16T00:00:00Z',
        eventType: 'session_start',
      });

      const entry = JSON.parse(readFileSync(LOG_PATH, 'utf-8').trim());
      expect(entry.userId).toBeUndefined();
      expect(entry.requestId).toBeUndefined();
    });
  });
});
