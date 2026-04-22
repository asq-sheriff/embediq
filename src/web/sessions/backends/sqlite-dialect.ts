import type { Database, Statement } from 'better-sqlite3';
import type { SqlDialect, SessionRow, SessionRowFilter } from './database.js';

/**
 * SQLite dialect backed by `better-sqlite3`. The constructor accepts a
 * prepared Database handle so the factory can own dynamic-import semantics
 * for the optional package.
 *
 * Runs in WAL journal mode for concurrent reader/writer safety on a
 * single process; cross-process access is not supported by design.
 */
export class SqliteDialect implements SqlDialect {
  private stmtGet!: Statement<[string]>;
  private stmtUpsert!: Statement<SessionRow>;
  private stmtDelete!: Statement<[string]>;
  private stmtTouch!: Statement<[string, string]>;
  private stmtListAll!: Statement;
  private stmtListUser!: Statement<[string]>;
  private stmtListAllAfter!: Statement<[string]>;
  private stmtListUserAfter!: Statement<[string, string]>;

  constructor(private readonly db: Database) {
    this.db.pragma('journal_mode = WAL');
  }

  ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embediq_sessions (
        session_id      TEXT PRIMARY KEY,
        user_id         TEXT,
        owner_token     TEXT,
        template_id     TEXT,
        domain_pack_id  TEXT,
        phase           TEXT NOT NULL,
        current_dim     TEXT,
        payload         TEXT NOT NULL,
        version         INTEGER NOT NULL,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        expires_at      TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_embediq_sessions_user
        ON embediq_sessions(user_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_embediq_sessions_expires
        ON embediq_sessions(expires_at);
    `);

    this.stmtGet = this.db.prepare(
      `SELECT * FROM embediq_sessions WHERE session_id = ?`,
    );
    this.stmtUpsert = this.db.prepare(`
      INSERT INTO embediq_sessions (
        session_id, user_id, owner_token, template_id, domain_pack_id,
        phase, current_dim, payload, version,
        created_at, updated_at, expires_at
      )
      VALUES (
        @session_id, @user_id, @owner_token, @template_id, @domain_pack_id,
        @phase, @current_dim, @payload, @version,
        @created_at, @updated_at, @expires_at
      )
      ON CONFLICT(session_id) DO UPDATE SET
        user_id        = excluded.user_id,
        owner_token    = excluded.owner_token,
        template_id    = excluded.template_id,
        domain_pack_id = excluded.domain_pack_id,
        phase          = excluded.phase,
        current_dim    = excluded.current_dim,
        payload        = excluded.payload,
        version        = excluded.version,
        updated_at     = excluded.updated_at,
        expires_at     = excluded.expires_at
    `);
    this.stmtDelete = this.db.prepare(
      `DELETE FROM embediq_sessions WHERE session_id = ?`,
    );
    this.stmtTouch = this.db.prepare(
      `UPDATE embediq_sessions SET expires_at = ? WHERE session_id = ?`,
    );
    this.stmtListAll = this.db.prepare(
      `SELECT * FROM embediq_sessions ORDER BY updated_at DESC`,
    );
    this.stmtListUser = this.db.prepare(
      `SELECT * FROM embediq_sessions WHERE user_id = ? ORDER BY updated_at DESC`,
    );
    this.stmtListAllAfter = this.db.prepare(
      `SELECT * FROM embediq_sessions WHERE updated_at > ? ORDER BY updated_at DESC`,
    );
    this.stmtListUserAfter = this.db.prepare(
      `SELECT * FROM embediq_sessions WHERE user_id = ? AND updated_at > ? ORDER BY updated_at DESC`,
    );
  }

  get(sessionId: string): SessionRow | undefined {
    return this.stmtGet.get(sessionId) as SessionRow | undefined;
  }

  upsert(row: SessionRow): void {
    this.stmtUpsert.run(row);
  }

  delete(sessionId: string): boolean {
    const info = this.stmtDelete.run(sessionId);
    return info.changes > 0;
  }

  touch(sessionId: string, expiresAt: string): void {
    this.stmtTouch.run(expiresAt, sessionId);
  }

  list(filter: SessionRowFilter): SessionRow[] {
    if (filter.userId !== undefined && filter.updatedAfter) {
      return this.stmtListUserAfter.all(filter.userId, filter.updatedAfter) as SessionRow[];
    }
    if (filter.userId !== undefined) {
      return this.stmtListUser.all(filter.userId) as SessionRow[];
    }
    if (filter.updatedAfter) {
      return this.stmtListAllAfter.all(filter.updatedAfter) as SessionRow[];
    }
    return this.stmtListAll.all() as SessionRow[];
  }

  close(): void {
    this.db.close();
  }
}
