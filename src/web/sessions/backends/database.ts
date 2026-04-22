import type { SessionBackend } from '../session-backend.js';
import type {
  SessionListFilter,
  SessionListResult,
  WizardPhase,
  WizardSession,
} from '../types.js';
import type { PayloadCipher } from '../encryption.js';

/**
 * Row shape exchanged between the backend and the dialect. Mirrors the
 * `embediq_sessions` schema. Indexed columns are exposed; everything else
 * rides as an opaque `payload` string (JSON when unencrypted, base64 of an
 * AES-GCM blob when a PayloadCipher is active).
 */
export interface SessionRow {
  session_id: string;
  user_id: string | null;
  owner_token: string | null;
  template_id: string | null;
  domain_pack_id: string | null;
  phase: WizardPhase;
  current_dim: string | null;
  payload: string;
  version: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

/**
 * Filter applied at the dialect level. Mirrors SessionListFilter but omits
 * cursor-based pagination; the backend handles slicing across dialects to
 * keep SQL portable.
 */
export interface SessionRowFilter {
  userId?: string;
  updatedAfter?: string;
}

/**
 * SQL-dialect interface so a single DatabaseBackend class can serve
 * SQLite today and PostgreSQL in a later iteration. Dialects are
 * deliberately thin: they execute SQL, nothing else.
 */
export interface SqlDialect {
  ensureSchema(): void;
  get(sessionId: string): SessionRow | undefined;
  upsert(row: SessionRow): void;
  delete(sessionId: string): boolean;
  list(filter: SessionRowFilter): SessionRow[];
  touch(sessionId: string, expiresAt: string): void;
  close(): void;
}

export interface DatabaseBackendOptions {
  /** Optional at-rest encryption wrapper applied to the `payload` column. */
  cipher?: PayloadCipher;
}

/**
 * Session backend that persists records into a relational database via a
 * pluggable SqlDialect. The backend owns:
 *   - version bumping (monotonic, derived from existing + input)
 *   - TTL enforcement on read (expired rows are deleted inline)
 *   - session ↔ row conversion, including optional payload encryption
 *   - cursor-based pagination for list
 */
export class DatabaseBackend implements SessionBackend {
  readonly name = 'database' as const;

  constructor(
    private readonly dialect: SqlDialect,
    private readonly opts: DatabaseBackendOptions = {},
  ) {
    dialect.ensureSchema();
  }

  async get(sessionId: string): Promise<WizardSession | null> {
    const row = this.dialect.get(sessionId);
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
      this.dialect.delete(sessionId);
      return null;
    }
    return this.rowToSession(row);
  }

  async put(session: WizardSession): Promise<WizardSession> {
    const existing = this.dialect.get(session.sessionId);
    const baseline = Math.max(existing?.version ?? 0, session.version ?? 0);
    const stored: WizardSession = { ...session, version: baseline + 1 };
    this.dialect.upsert(this.sessionToRow(stored));
    return stored;
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.dialect.delete(sessionId);
  }

  async list(filter: SessionListFilter = {}): Promise<SessionListResult> {
    const rows = this.dialect.list({
      userId: filter.userId,
      updatedAfter: filter.updatedAfter,
    });
    const now = Date.now();
    const live: SessionRow[] = [];
    for (const row of rows) {
      if (new Date(row.expires_at).getTime() < now) {
        this.dialect.delete(row.session_id);
        continue;
      }
      live.push(row);
    }
    live.sort((a, b) => b.updated_at.localeCompare(a.updated_at));

    let start = 0;
    if (filter.cursor) {
      const idx = live.findIndex((r) => r.session_id === filter.cursor);
      if (idx >= 0) start = idx + 1;
    }
    const limit = filter.limit ?? live.length;
    const page = live.slice(start, start + limit);
    const hasMore = start + limit < live.length;
    return {
      sessions: page.map((row) => this.rowToSession(row)),
      cursor: hasMore && page.length > 0 ? page[page.length - 1].session_id : undefined,
    };
  }

  async touch(sessionId: string, expiresAt: string): Promise<void> {
    this.dialect.touch(sessionId, expiresAt);
  }

  async close(): Promise<void> {
    this.dialect.close();
  }

  private sessionToRow(session: WizardSession): SessionRow {
    const payload = JSON.stringify({
      answers: session.answers,
      profile: session.profile,
      priorities: session.priorities,
      generationHistory: session.generationHistory,
    });
    return {
      session_id: session.sessionId,
      user_id: session.userId ?? null,
      owner_token: session.ownerToken ?? null,
      template_id: session.templateId ?? null,
      domain_pack_id: session.domainPackId ?? null,
      phase: session.phase,
      current_dim: session.currentDimension ?? null,
      payload: this.opts.cipher ? this.opts.cipher.encrypt(payload) : payload,
      version: session.version,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
      expires_at: session.expiresAt,
    };
  }

  private rowToSession(row: SessionRow): WizardSession {
    const raw = this.opts.cipher ? this.opts.cipher.decrypt(row.payload) : row.payload;
    const parsed = JSON.parse(raw) as {
      answers: WizardSession['answers'];
      profile?: WizardSession['profile'];
      priorities?: WizardSession['priorities'];
      generationHistory: WizardSession['generationHistory'];
    };
    return {
      sessionId: row.session_id,
      userId: row.user_id ?? undefined,
      ownerToken: row.owner_token ?? undefined,
      templateId: row.template_id ?? undefined,
      domainPackId: row.domain_pack_id ?? undefined,
      phase: row.phase,
      currentDimension: row.current_dim ?? undefined,
      answers: parsed.answers,
      profile: parsed.profile,
      priorities: parsed.priorities,
      generationHistory: parsed.generationHistory ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
      version: row.version,
    };
  }
}
