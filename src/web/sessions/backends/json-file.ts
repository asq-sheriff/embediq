import { existsSync, mkdirSync, promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { SessionBackend } from '../session-backend.js';
import type { SessionListFilter, SessionListResult, WizardSession } from '../types.js';

export interface JsonFileBackendOptions {
  dir: string;
}

/**
 * File-per-session JSON backend. Intended for local development, single-node
 * deployments, and as the default concrete backend in the test suite.
 *
 * Durability model:
 *   - Writes are atomic via temp-file + rename (POSIX semantics).
 *   - There is no cross-process lock; last writer wins.
 *   - TTL expiry is lazy: expired records are detected on read and deleted.
 *
 * Security: sessionIds are UUIDs in production, but every file access
 * normalizes through `path.basename` and rejects anything that would
 * escape the configured directory.
 */
export class JsonFileBackend implements SessionBackend {
  readonly name = 'json-file' as const;
  private readonly dir: string;

  constructor(opts: JsonFileBackendOptions) {
    this.dir = opts.dir;
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  async get(sessionId: string): Promise<WizardSession | null> {
    const path = this.filePath(sessionId);
    const session = await this.readRecord(path);
    if (!session) return null;
    if (this.isExpired(session)) {
      await this.unlinkQuiet(path);
      return null;
    }
    return session;
  }

  async put(session: WizardSession): Promise<WizardSession> {
    const path = this.filePath(session.sessionId);
    const existing = await this.readRecord(path);
    const baseline = Math.max(existing?.version ?? 0, session.version ?? 0);
    const record: WizardSession = { ...session, version: baseline + 1 };
    await this.atomicWrite(path, record);
    return record;
  }

  async delete(sessionId: string): Promise<boolean> {
    const path = this.filePath(sessionId);
    try {
      await fs.unlink(path);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }
  }

  async list(filter: SessionListFilter = {}): Promise<SessionListResult> {
    const entries = await fs.readdir(this.dir, { withFileTypes: true });
    const now = Date.now();
    const matches: WizardSession[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const path = join(this.dir, entry.name);
      const session = await this.readRecord(path);
      if (!session) continue;
      if (new Date(session.expiresAt).getTime() < now) {
        await this.unlinkQuiet(path);
        continue;
      }
      if (filter.userId !== undefined && session.userId !== filter.userId) continue;
      if (filter.updatedAfter && session.updatedAt <= filter.updatedAfter) continue;
      matches.push(session);
    }

    // Stable descending order so pagination is deterministic.
    matches.sort((a, b) => (b.updatedAt.localeCompare(a.updatedAt)));

    let startIdx = 0;
    if (filter.cursor) {
      const cursorIdx = matches.findIndex((s) => s.sessionId === filter.cursor);
      if (cursorIdx >= 0) startIdx = cursorIdx + 1;
    }
    const limit = filter.limit ?? matches.length;
    const page = matches.slice(startIdx, startIdx + limit);
    const hasMore = startIdx + limit < matches.length;
    return {
      sessions: page,
      cursor: hasMore && page.length > 0 ? page[page.length - 1].sessionId : undefined,
    };
  }

  async touch(sessionId: string, expiresAt: string): Promise<void> {
    const path = this.filePath(sessionId);
    const existing = await this.readRecord(path);
    if (!existing) return;
    await this.atomicWrite(path, { ...existing, expiresAt });
  }

  private filePath(sessionId: string): string {
    const safe = basename(sessionId);
    if (safe !== sessionId || !safe) {
      throw new Error(`Invalid sessionId: ${sessionId}`);
    }
    return join(this.dir, `${safe}.json`);
  }

  private async readRecord(path: string): Promise<WizardSession | null> {
    let raw: string;
    try {
      raw = await fs.readFile(path, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    try {
      return JSON.parse(raw) as WizardSession;
    } catch {
      // Corrupt record — remove and treat as missing.
      await this.unlinkQuiet(path);
      return null;
    }
  }

  private async atomicWrite(path: string, record: WizardSession): Promise<void> {
    const tmp = `${path}.tmp-${randomBytes(6).toString('hex')}`;
    await fs.writeFile(tmp, JSON.stringify(record), 'utf-8');
    try {
      await fs.rename(tmp, path);
    } catch (err) {
      await this.unlinkQuiet(tmp);
      throw err;
    }
  }

  private async unlinkQuiet(path: string): Promise<void> {
    try {
      await fs.unlink(path);
    } catch {
      // best-effort cleanup
    }
  }

  private isExpired(session: WizardSession): boolean {
    return new Date(session.expiresAt).getTime() < Date.now();
  }
}
