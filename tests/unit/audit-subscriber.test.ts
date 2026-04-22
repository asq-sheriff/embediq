import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  InMemoryEventBus,
  AuditSubscriber,
  registerDefaultSubscribers,
} from '../../src/events/index.js';
import {
  runWithContext,
  createRequestContext,
} from '../../src/context/request-context.js';
import { Dimension } from '../../src/types/index.js';
import type { WizardAuditEntry } from '../../src/util/wizard-audit.js';

const TEST_DIR = join(process.cwd(), 'tests', '.tmp-audit-subscriber');
const LOG_PATH = join(TEST_DIR, 'audit.jsonl');

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function readEntries(): WizardAuditEntry[] {
  if (!existsSync(LOG_PATH)) return [];
  const raw = readFileSync(LOG_PATH, 'utf-8');
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as WizardAuditEntry);
}

describe('AuditSubscriber', () => {
  let bus: InMemoryEventBus;
  let teardown: () => void;

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.env.EMBEDIQ_AUDIT_LOG = LOG_PATH;
    bus = new InMemoryEventBus();
  });

  afterEach(() => {
    teardown?.();
    delete process.env.EMBEDIQ_AUDIT_LOG;
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe('event → audit entry mapping', () => {
    beforeEach(() => {
      const sub = new AuditSubscriber();
      const unsubs = sub.register(bus);
      teardown = () => unsubs.forEach((u) => u());
    });

    it('maps session:started to session_start', async () => {
      bus.emit('session:started', { sessionId: 's1', templateId: 'hipaa' });
      await flushMicrotasks();

      const [entry] = readEntries();
      expect(entry.eventType).toBe('session_start');
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('maps profile:built to profile_built with profileSummary passthrough', async () => {
      const summary = {
        role: 'developer',
        industry: 'healthcare',
        teamSize: 'small',
        complianceFrameworks: ['HIPAA'],
        securityLevel: 'strict',
        fileCount: 0,
      };
      bus.emit('profile:built', { profileSummary: summary });
      await flushMicrotasks();

      const [entry] = readEntries();
      expect(entry.eventType).toBe('profile_built');
      expect(entry.profileSummary).toEqual(summary);
    });

    it('maps generation:started to generation_started', async () => {
      bus.emit('generation:started', { generatorCount: 12 });
      await flushMicrotasks();

      const [entry] = readEntries();
      expect(entry.eventType).toBe('generation_started');
    });

    it('maps validation:completed with failCount === 0 to passed', async () => {
      bus.emit('validation:completed', { passCount: 5, failCount: 0, checks: [] });
      await flushMicrotasks();

      const [entry] = readEntries();
      expect(entry.eventType).toBe('validation_result');
      expect(entry.validationPassed).toBe(true);
      expect(entry.validationErrorCount).toBe(0);
    });

    it('maps validation:completed with failCount > 0 to failed', async () => {
      bus.emit('validation:completed', { passCount: 3, failCount: 2, checks: [] });
      await flushMicrotasks();

      const [entry] = readEntries();
      expect(entry.validationPassed).toBe(false);
      expect(entry.validationErrorCount).toBe(2);
    });

    it('maps file:generated to file_written with path + size', async () => {
      bus.emit('file:generated', { relativePath: 'CLAUDE.md', size: 1024 });
      await flushMicrotasks();

      const [entry] = readEntries();
      expect(entry.eventType).toBe('file_written');
      expect(entry.filePath).toBe('CLAUDE.md');
      expect(entry.fileSize).toBe(1024);
    });

    it('maps session:completed to session_complete', async () => {
      bus.emit('session:completed', { sessionId: 's1', fileCount: 15 });
      await flushMicrotasks();

      const [entry] = readEntries();
      expect(entry.eventType).toBe('session_complete');
    });
  });

  describe('ignored events', () => {
    beforeEach(() => {
      const sub = new AuditSubscriber();
      const unsubs = sub.register(bus);
      teardown = () => unsubs.forEach((u) => u());
    });

    it('does not log question:presented', async () => {
      bus.emit('question:presented', {
        questionId: 'STRAT_001',
        dimension: Dimension.STRATEGIC_INTENT,
      });
      await flushMicrotasks();

      expect(readEntries()).toHaveLength(0);
    });

    it('does not log answer:received', async () => {
      bus.emit('answer:received', { questionId: 'STRAT_001', answerValue: 'yes' });
      await flushMicrotasks();

      expect(readEntries()).toHaveLength(0);
    });

    it('does not log dimension:completed', async () => {
      bus.emit('dimension:completed', {
        dimension: Dimension.STRATEGIC_INTENT,
        questionsAnswered: 4,
      });
      await flushMicrotasks();

      expect(readEntries()).toHaveLength(0);
    });
  });

  describe('context propagation', () => {
    beforeEach(() => {
      const sub = new AuditSubscriber();
      const unsubs = sub.register(bus);
      teardown = () => unsubs.forEach((u) => u());
    });

    it('uses requestId and userId from envelope (stamped at emit time)', async () => {
      const ctx = createRequestContext({ userId: 'alice' });
      runWithContext(ctx, () => {
        bus.emit('session:started', { sessionId: 's1' });
      });
      await flushMicrotasks();

      const [entry] = readEntries();
      expect(entry.userId).toBe('alice');
      expect(entry.requestId).toBe(ctx.requestId);
    });

    it('leaves context fields undefined in CLI mode (no scope)', async () => {
      bus.emit('session:started', { sessionId: 's1' });
      await flushMicrotasks();

      const [entry] = readEntries();
      expect(entry.userId).toBeUndefined();
      expect(entry.requestId).toBeUndefined();
    });
  });

  describe('EMBEDIQ_AUDIT_LOG gate', () => {
    it('does not write when EMBEDIQ_AUDIT_LOG is unset', async () => {
      delete process.env.EMBEDIQ_AUDIT_LOG;

      const sub = new AuditSubscriber();
      const unsubs = sub.register(bus);
      teardown = () => unsubs.forEach((u) => u());

      bus.emit('session:started', { sessionId: 's1' });
      await flushMicrotasks();

      expect(existsSync(LOG_PATH)).toBe(false);
    });
  });

  describe('end-to-end sequence', () => {
    beforeEach(() => {
      const sub = new AuditSubscriber();
      const unsubs = sub.register(bus);
      teardown = () => unsubs.forEach((u) => u());
    });

    it('writes entries in emit order for a full generation run', async () => {
      bus.emit('session:started', { sessionId: 's1' });
      bus.emit('profile:built', {
        profileSummary: {
          role: 'developer',
          industry: 'finance',
          teamSize: 'medium',
          complianceFrameworks: ['PCI-DSS'],
          securityLevel: 'strict',
          fileCount: 0,
        },
      });
      bus.emit('generation:started', { generatorCount: 12 });
      bus.emit('file:generated', { relativePath: 'CLAUDE.md', size: 512 });
      bus.emit('file:generated', { relativePath: '.claude/settings.json', size: 256 });
      bus.emit('validation:completed', { passCount: 8, failCount: 0, checks: [] });
      bus.emit('session:completed', { sessionId: 's1', fileCount: 2 });

      // Ignored mid-stream
      bus.emit('answer:received', { questionId: 'FIN_D001', answerValue: true });

      await flushMicrotasks();

      const types = readEntries().map((e) => e.eventType);
      expect(types).toEqual([
        'session_start',
        'profile_built',
        'generation_started',
        'file_written',
        'file_written',
        'validation_result',
        'session_complete',
      ]);
    });
  });
});

describe('registerDefaultSubscribers', () => {
  let bus: InMemoryEventBus;

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.env.EMBEDIQ_AUDIT_LOG = LOG_PATH;
    bus = new InMemoryEventBus();
  });

  afterEach(() => {
    delete process.env.EMBEDIQ_AUDIT_LOG;
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it('wires audit subscriber when enableAudit=true', async () => {
    const { teardown } = registerDefaultSubscribers(bus, { enableAudit: true });
    try {
      bus.emit('session:started', { sessionId: 's1' });
      await flushMicrotasks();
      expect(readEntries()).toHaveLength(1);
    } finally {
      teardown();
    }
  });

  it('omits audit subscriber when enableAudit is false', async () => {
    const { teardown } = registerDefaultSubscribers(bus, { enableAudit: false });
    try {
      bus.emit('session:started', { sessionId: 's1' });
      await flushMicrotasks();
      expect(existsSync(LOG_PATH)).toBe(false);
    } finally {
      teardown();
    }
  });

  it('omits audit subscriber by default when opts is empty', async () => {
    const { teardown } = registerDefaultSubscribers(bus);
    try {
      bus.emit('session:started', { sessionId: 's1' });
      await flushMicrotasks();
      expect(existsSync(LOG_PATH)).toBe(false);
    } finally {
      teardown();
    }
  });

  it('teardown unregisters subscribers so later emits do not log', async () => {
    const { teardown } = registerDefaultSubscribers(bus, { enableAudit: true });

    bus.emit('session:started', { sessionId: 's1' });
    await flushMicrotasks();
    expect(readEntries()).toHaveLength(1);

    teardown();

    bus.emit('session:completed', { sessionId: 's1', fileCount: 0 });
    await flushMicrotasks();
    expect(readEntries()).toHaveLength(1);
  });

  it('teardown is idempotent', () => {
    const { teardown } = registerDefaultSubscribers(bus, { enableAudit: true });
    expect(() => {
      teardown();
      teardown();
    }).not.toThrow();
  });
});
