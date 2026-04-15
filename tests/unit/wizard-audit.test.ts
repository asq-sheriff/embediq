import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { auditLog } from '../../src/util/wizard-audit.js';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(process.cwd(), 'tests', '.tmp-audit-test');
const LOG_PATH = join(TEST_DIR, 'audit.jsonl');

describe('auditLog', () => {
  describe('when EMBEDIQ_AUDIT_LOG is not set', () => {
    beforeEach(() => {
      delete process.env.EMBEDIQ_AUDIT_LOG;
    });

    it('is a noop — does not create any file', () => {
      auditLog({
        timestamp: new Date().toISOString(),
        eventType: 'session_start',
      });
      expect(existsSync(LOG_PATH)).toBe(false);
    });
  });

  describe('when EMBEDIQ_AUDIT_LOG is set', () => {
    beforeEach(() => {
      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
      mkdirSync(TEST_DIR, { recursive: true });
      process.env.EMBEDIQ_AUDIT_LOG = LOG_PATH;
    });

    afterEach(() => {
      delete process.env.EMBEDIQ_AUDIT_LOG;
      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    });

    it('writes a JSONL line to the audit log', () => {
      auditLog({
        timestamp: '2026-04-15T00:00:00Z',
        eventType: 'session_start',
        userId: 'test-user',
      });

      const content = readFileSync(LOG_PATH, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);

      const entry = JSON.parse(lines[0]);
      expect(entry.eventType).toBe('session_start');
      expect(entry.userId).toBe('test-user');
      expect(entry.timestamp).toBe('2026-04-15T00:00:00Z');
    });

    it('appends multiple entries', () => {
      auditLog({ timestamp: '2026-04-15T00:00:00Z', eventType: 'session_start' });
      auditLog({ timestamp: '2026-04-15T00:00:01Z', eventType: 'profile_built' });
      auditLog({ timestamp: '2026-04-15T00:00:02Z', eventType: 'session_complete' });

      const content = readFileSync(LOG_PATH, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);
    });

    it('includes profile summary when provided', () => {
      auditLog({
        timestamp: '2026-04-15T00:00:00Z',
        eventType: 'profile_built',
        profileSummary: {
          role: 'developer',
          industry: 'healthcare',
          teamSize: 'medium',
          complianceFrameworks: ['hipaa'],
          securityLevel: 'strict',
          fileCount: 25,
        },
      });

      const content = readFileSync(LOG_PATH, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.profileSummary.role).toBe('developer');
      expect(entry.profileSummary.complianceFrameworks).toEqual(['hipaa']);
    });

    it('includes validation metadata when provided', () => {
      auditLog({
        timestamp: '2026-04-15T00:00:00Z',
        eventType: 'validation_result',
        validationPassed: true,
        validationErrorCount: 0,
      });

      const content = readFileSync(LOG_PATH, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.validationPassed).toBe(true);
      expect(entry.validationErrorCount).toBe(0);
    });

    it('includes file metadata when provided', () => {
      auditLog({
        timestamp: '2026-04-15T00:00:00Z',
        eventType: 'file_written',
        filePath: 'CLAUDE.md',
        fileSize: 1024,
      });

      const content = readFileSync(LOG_PATH, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.filePath).toBe('CLAUDE.md');
      expect(entry.fileSize).toBe(1024);
    });

    it('does not throw on write errors', () => {
      process.env.EMBEDIQ_AUDIT_LOG = '/nonexistent/path/audit.jsonl';
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        auditLog({ timestamp: '2026-04-15T00:00:00Z', eventType: 'session_start' });
      }).not.toThrow();

      spy.mockRestore();
    });
  });
});
