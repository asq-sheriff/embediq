import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonAutopilotStore } from '../../src/autopilot/store.js';
import { selectSessionBackend } from '../../src/web/sessions/factory.js';
import { auditLog } from '../../src/util/wizard-audit.js';
import { createRequestContext, runWithContext } from '../../src/context/request-context.js';

/**
 * Verifies that two processes running with different
 * EMBEDIQ_ENGAGEMENT_ID values operate on disjoint state — no
 * cross-engagement leak through autopilot schedules, session files,
 * or audit log entries.
 */
describe('engagement isolation — end-to-end', () => {
  let workDir: string;
  let originalCwd: string;
  const env = process.env;
  const snapshot: Record<string, string | undefined> = {};

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'embediq-eng-iso-'));
    originalCwd = process.cwd();
    process.chdir(workDir);
    for (const key of [
      'EMBEDIQ_ENGAGEMENT_ID',
      'EMBEDIQ_SESSION_BACKEND',
      'EMBEDIQ_SESSION_DIR',
      'EMBEDIQ_AUTOPILOT_DIR',
      'EMBEDIQ_AUDIT_LOG',
    ]) {
      snapshot[key] = env[key];
      delete env[key];
    }
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(workDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  });

  it('autopilot schedules created under one engagement are invisible to another', async () => {
    env.EMBEDIQ_ENGAGEMENT_ID = 'eng-alpha';
    const alphaStore = new JsonAutopilotStore();
    await alphaStore.addSchedule({
      name: 'alpha-daily-drift',
      cadence: '@daily',
      answerSourcePath: '/tmp/alpha.yaml',
      targetDir: '/tmp/project',
    });

    env.EMBEDIQ_ENGAGEMENT_ID = 'eng-beta';
    const betaStore = new JsonAutopilotStore();
    await betaStore.addSchedule({
      name: 'beta-hourly-drift',
      cadence: '@hourly',
      answerSourcePath: '/tmp/beta.yaml',
      targetDir: '/tmp/project',
    });

    // Fresh process simulation — instantiate again under each ID
    env.EMBEDIQ_ENGAGEMENT_ID = 'eng-alpha';
    const alphaSchedules = await new JsonAutopilotStore().listSchedules();
    expect(alphaSchedules.map((s) => s.name)).toEqual(['alpha-daily-drift']);

    env.EMBEDIQ_ENGAGEMENT_ID = 'eng-beta';
    const betaSchedules = await new JsonAutopilotStore().listSchedules();
    expect(betaSchedules.map((s) => s.name)).toEqual(['beta-hourly-drift']);

    // On-disk: confirm the two engagements live in disjoint directories
    expect(existsSync(join(workDir, '.embediq/engagements/eng-alpha/autopilot/schedules.json'))).toBe(true);
    expect(existsSync(join(workDir, '.embediq/engagements/eng-beta/autopilot/schedules.json'))).toBe(true);
    expect(existsSync(join(workDir, '.embediq/autopilot/schedules.json'))).toBe(false);
  });

  it('session backends for two engagements use disjoint directories', async () => {
    env.EMBEDIQ_SESSION_BACKEND = 'json-file';

    env.EMBEDIQ_ENGAGEMENT_ID = 'eng-alpha';
    const alpha = await selectSessionBackend();
    expect(alpha.name).toBe('json-file');

    env.EMBEDIQ_ENGAGEMENT_ID = 'eng-beta';
    const beta = await selectSessionBackend();
    expect(beta.name).toBe('json-file');

    expect(existsSync(join(workDir, '.embediq/engagements/eng-alpha/sessions'))).toBe(true);
    expect(existsSync(join(workDir, '.embediq/engagements/eng-beta/sessions'))).toBe(true);
    expect(existsSync(join(workDir, '.embediq/sessions'))).toBe(false);
  });

  it('audit log entries are tagged with engagementId from the request context', async () => {
    const logPath = join(workDir, 'audit.jsonl');
    env.EMBEDIQ_AUDIT_LOG = logPath;
    env.EMBEDIQ_ENGAGEMENT_ID = 'eng-alpha';

    const ctx = createRequestContext({ userId: 'analyst-1' });
    expect(ctx.engagementId).toBe('eng-alpha');

    runWithContext(ctx, () => {
      auditLog({
        timestamp: '2026-04-15T00:00:00Z',
        eventType: 'session_start',
      });
    });

    const content = await readFile(logPath, 'utf-8');
    const entry = JSON.parse(content.trim());
    expect(entry.engagementId).toBe('eng-alpha');
    expect(entry.userId).toBe('analyst-1');
  });

  it('shared audit log file: entries from two engagements are filterable by engagementId', async () => {
    const logPath = join(workDir, 'shared-audit.jsonl');
    env.EMBEDIQ_AUDIT_LOG = logPath;

    env.EMBEDIQ_ENGAGEMENT_ID = 'eng-alpha';
    runWithContext(createRequestContext({ userId: 'analyst-1' }), () => {
      auditLog({ timestamp: '2026-04-15T00:00:00Z', eventType: 'session_start' });
    });

    env.EMBEDIQ_ENGAGEMENT_ID = 'eng-beta';
    runWithContext(createRequestContext({ userId: 'consultant-2' }), () => {
      auditLog({ timestamp: '2026-04-15T00:00:01Z', eventType: 'profile_built' });
    });

    const content = await readFile(logPath, 'utf-8');
    const entries = content.trim().split('\n').map((l) => JSON.parse(l));
    expect(entries).toHaveLength(2);
    const alphaEntries = entries.filter((e) => e.engagementId === 'eng-alpha');
    const betaEntries = entries.filter((e) => e.engagementId === 'eng-beta');
    expect(alphaEntries).toHaveLength(1);
    expect(betaEntries).toHaveLength(1);
    expect(alphaEntries[0].userId).toBe('analyst-1');
    expect(betaEntries[0].userId).toBe('consultant-2');
  });

  it('no-engagement deployments continue to work identically (backwards compatibility)', async () => {
    // No engagement id set — everything should land in the unscoped defaults
    const store = new JsonAutopilotStore();
    await store.addSchedule({
      name: 'legacy',
      cadence: '@daily',
      answerSourcePath: '/tmp/a.yaml',
      targetDir: '/tmp/project',
    });

    expect(existsSync(join(workDir, '.embediq/autopilot/schedules.json'))).toBe(true);
    expect(existsSync(join(workDir, '.embediq/engagements'))).toBe(false);

    // And audit logging works without engagementId enrichment
    const logPath = join(workDir, 'legacy-audit.jsonl');
    env.EMBEDIQ_AUDIT_LOG = logPath;
    runWithContext(createRequestContext(), () => {
      auditLog({ timestamp: '2026-04-15T00:00:00Z', eventType: 'session_start' });
    });
    const entry = JSON.parse((await readFile(logPath, 'utf-8')).trim());
    expect(entry.engagementId).toBeUndefined();
  });

  it('an invalid engagement id fails fast at backend selection', async () => {
    env.EMBEDIQ_SESSION_BACKEND = 'json-file';
    env.EMBEDIQ_ENGAGEMENT_ID = 'has/slash';
    await expect(selectSessionBackend()).rejects.toThrow(/not a valid/);
  });
});
