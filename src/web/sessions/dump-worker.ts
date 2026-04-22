import { createReadStream, existsSync, mkdirSync, promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Response } from 'express';
import type { SessionBackend } from './session-backend.js';
import type { WizardSession } from './types.js';

/** Default window during which a finished dump file remains downloadable. */
const DEFAULT_DUMP_TTL_MS = 24 * 60 * 60 * 1000;

export type DumpStatus = 'queued' | 'processing' | 'ready' | 'failed';

export interface DumpJob {
  dumpId: string;
  sessionId: string;
  status: DumpStatus;
  createdAt: string;
  completedAt?: string;
  expiresAt: string;
  filePath?: string;
  error?: string;
}

export interface DumpWorkerOptions {
  dir: string;
  ttlMs?: number;
}

/**
 * In-process background worker that serializes full wizard sessions to
 * disk for admin download. Jobs live in memory for the duration of the
 * process; files on disk are removed when the TTL lapses or the job map
 * is cleared. The `ownerToken` is stripped from the dump payload so the
 * file cannot be used to forge a session cookie if it leaks.
 */
export class DumpWorker {
  private readonly jobs = new Map<string, DumpJob>();
  private readonly dir: string;
  private readonly ttlMs: number;
  private readonly backend: SessionBackend;

  constructor(backend: SessionBackend, opts: DumpWorkerOptions) {
    this.backend = backend;
    this.dir = opts.dir;
    this.ttlMs = opts.ttlMs ?? DEFAULT_DUMP_TTL_MS;
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  enqueue(sessionId: string): DumpJob {
    const dumpId = randomUUID();
    const now = new Date();
    const job: DumpJob = {
      dumpId,
      sessionId,
      status: 'queued',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
    };
    this.jobs.set(dumpId, job);
    setImmediate(() => {
      this.process(job).catch((err) => {
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : String(err);
      });
    });
    return { ...job };
  }

  getJob(dumpId: string): DumpJob | undefined {
    const job = this.jobs.get(dumpId);
    if (!job) return undefined;
    if (new Date(job.expiresAt).getTime() < Date.now()) {
      this.removeJob(job);
      return undefined;
    }
    return { ...job };
  }

  async streamToResponse(dumpId: string, res: Response): Promise<boolean> {
    const job = this.getJob(dumpId);
    if (!job || job.status !== 'ready' || !job.filePath) return false;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="session-dump-${job.sessionId}.json"`,
    );
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(job.filePath!);
      stream.once('error', reject);
      stream.once('end', resolve);
      stream.pipe(res);
    });
    return true;
  }

  /** Wait for every in-flight job to reach a terminal state (ready or failed). */
  async drain(timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const pending = Array.from(this.jobs.values()).filter(
        (j) => j.status === 'queued' || j.status === 'processing',
      );
      if (pending.length === 0) return;
      await new Promise((r) => setImmediate(r));
    }
  }

  /** Remove every job from memory and unlink finished files. */
  async shutdown(): Promise<void> {
    const all = Array.from(this.jobs.values());
    this.jobs.clear();
    await Promise.all(
      all
        .filter((j) => j.filePath)
        .map((j) => fs.unlink(j.filePath!).catch(() => {})),
    );
  }

  private async process(job: DumpJob): Promise<void> {
    job.status = 'processing';
    const session = await this.backend.get(job.sessionId);
    if (!session) {
      job.status = 'failed';
      job.error = 'Session not found';
      return;
    }
    const filePath = join(this.dir, `${job.dumpId}.json`);
    const safe = this.sanitize(session);
    await fs.writeFile(filePath, JSON.stringify(safe, null, 2), 'utf-8');
    job.filePath = filePath;
    job.completedAt = new Date().toISOString();
    job.status = 'ready';
  }

  private sanitize(session: WizardSession): Omit<WizardSession, 'ownerToken'> {
    const { ownerToken: _ownerToken, ...rest } = session;
    void _ownerToken;
    return rest;
  }

  private removeJob(job: DumpJob): void {
    this.jobs.delete(job.dumpId);
    if (job.filePath) {
      fs.unlink(job.filePath).catch(() => {});
    }
  }
}
