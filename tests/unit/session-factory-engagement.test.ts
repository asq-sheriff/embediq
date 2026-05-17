import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectSessionBackend } from '../../src/web/sessions/factory.js';

describe('selectSessionBackend — engagement scoping for default paths', () => {
  let workDir: string;
  let originalCwd: string;
  const originalEngagementId = process.env.EMBEDIQ_ENGAGEMENT_ID;
  const originalSessionDir = process.env.EMBEDIQ_SESSION_DIR;
  const originalBackend = process.env.EMBEDIQ_SESSION_BACKEND;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'embediq-sf-'));
    originalCwd = process.cwd();
    process.chdir(workDir);
    delete process.env.EMBEDIQ_ENGAGEMENT_ID;
    delete process.env.EMBEDIQ_SESSION_DIR;
    delete process.env.EMBEDIQ_SESSION_BACKEND;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(workDir, { recursive: true, force: true });
    if (originalEngagementId === undefined) delete process.env.EMBEDIQ_ENGAGEMENT_ID;
    else process.env.EMBEDIQ_ENGAGEMENT_ID = originalEngagementId;
    if (originalSessionDir === undefined) delete process.env.EMBEDIQ_SESSION_DIR;
    else process.env.EMBEDIQ_SESSION_DIR = originalSessionDir;
    if (originalBackend === undefined) delete process.env.EMBEDIQ_SESSION_BACKEND;
    else process.env.EMBEDIQ_SESSION_BACKEND = originalBackend;
  });

  it('uses the unscoped default directory when no engagement id is set', async () => {
    process.env.EMBEDIQ_SESSION_BACKEND = 'json-file';
    const backend = await selectSessionBackend();
    expect(backend.name).toBe('json-file');
    expect(existsSync(join(workDir, '.embediq/sessions'))).toBe(true);
    expect(existsSync(join(workDir, '.embediq/engagements'))).toBe(false);
  });

  it('scopes the default directory under engagements/<id> when engagement id is set', async () => {
    process.env.EMBEDIQ_SESSION_BACKEND = 'json-file';
    process.env.EMBEDIQ_ENGAGEMENT_ID = 'eng-alpha';
    const backend = await selectSessionBackend();
    expect(backend.name).toBe('json-file');
    expect(existsSync(join(workDir, '.embediq/engagements/eng-alpha/sessions'))).toBe(true);
    expect(existsSync(join(workDir, '.embediq/sessions'))).toBe(false);
  });

  it('honors explicit EMBEDIQ_SESSION_DIR even when engagement id is set', async () => {
    process.env.EMBEDIQ_SESSION_BACKEND = 'json-file';
    process.env.EMBEDIQ_ENGAGEMENT_ID = 'eng-alpha';
    const explicit = join(workDir, 'my-sessions');
    process.env.EMBEDIQ_SESSION_DIR = explicit;
    await selectSessionBackend();
    expect(existsSync(explicit)).toBe(true);
    expect(existsSync(join(workDir, '.embediq/engagements/eng-alpha/sessions'))).toBe(false);
  });

  it('fails fast on an invalid engagement id', async () => {
    process.env.EMBEDIQ_SESSION_BACKEND = 'json-file';
    process.env.EMBEDIQ_ENGAGEMENT_ID = '../escape';
    await expect(selectSessionBackend()).rejects.toThrow(/not a valid/);
  });

  it('returns NullBackend regardless of engagement id when backend is unset', async () => {
    process.env.EMBEDIQ_ENGAGEMENT_ID = 'eng-alpha';
    const backend = await selectSessionBackend();
    expect(backend.name).toBe('none');
    expect(existsSync(join(workDir, '.embediq'))).toBe(false);
  });
});
