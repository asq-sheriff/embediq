import type { SqlDialect, SessionRow, SessionRowFilter } from './database.js';

/**
 * Minimal structural type for `pg.Pool` / `pg.PoolClient`. Importing the
 * concrete `pg` package types would force the dependency on every
 * consumer; the dialect only needs `query(text, params?)` and
 * `end()`.
 */
export interface PgPoolLike {
  query(
    text: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
}

/**
 * PostgreSQL dialect for the shared `embediq_sessions` schema. Uses
 * `INSERT ... ON CONFLICT(session_id) DO UPDATE` (Postgres 9.5+) so the
 * upsert path is a single round-trip. All other queries are
 * parameterized — no string concatenation, no dynamic SQL.
 *
 * The dialect accepts a structurally-typed pool (`PgPoolLike`) rather
 * than the concrete `pg.Pool`, so the package stays an optional
 * dependency and tests can substitute an in-memory implementation
 * (pg-mem).
 *
 * Multi-node deployments: the schema is intentionally portable — no
 * extensions, no Postgres-specific column types, all timestamps stored
 * as ISO strings (TEXT) to match the SQLite dialect's row shape.
 */
export class PostgresDialect implements SqlDialect {
  constructor(private readonly pool: PgPoolLike) {}

  async init(): Promise<void> {
    await this.pool.query(`
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
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_embediq_sessions_user
        ON embediq_sessions(user_id, updated_at)
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_embediq_sessions_expires
        ON embediq_sessions(expires_at)
    `);
  }

  async get(sessionId: string): Promise<SessionRow | undefined> {
    const result = await this.pool.query(
      `SELECT session_id, user_id, owner_token, template_id, domain_pack_id,
              phase, current_dim, payload, version,
              created_at, updated_at, expires_at
       FROM embediq_sessions WHERE session_id = $1`,
      [sessionId],
    );
    if (result.rows.length === 0) return undefined;
    return rowFromPg(result.rows[0]);
  }

  async upsert(row: SessionRow): Promise<void> {
    await this.pool.query(
      `INSERT INTO embediq_sessions (
         session_id, user_id, owner_token, template_id, domain_pack_id,
         phase, current_dim, payload, version,
         created_at, updated_at, expires_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
       )
       ON CONFLICT (session_id) DO UPDATE SET
         user_id        = EXCLUDED.user_id,
         owner_token    = EXCLUDED.owner_token,
         template_id    = EXCLUDED.template_id,
         domain_pack_id = EXCLUDED.domain_pack_id,
         phase          = EXCLUDED.phase,
         current_dim    = EXCLUDED.current_dim,
         payload        = EXCLUDED.payload,
         version        = EXCLUDED.version,
         updated_at     = EXCLUDED.updated_at,
         expires_at     = EXCLUDED.expires_at`,
      [
        row.session_id, row.user_id, row.owner_token, row.template_id, row.domain_pack_id,
        row.phase, row.current_dim, row.payload, row.version,
        row.created_at, row.updated_at, row.expires_at,
      ],
    );
  }

  async delete(sessionId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM embediq_sessions WHERE session_id = $1 RETURNING session_id`,
      [sessionId],
    );
    return result.rows.length > 0;
  }

  async touch(sessionId: string, expiresAt: string): Promise<void> {
    await this.pool.query(
      `UPDATE embediq_sessions SET expires_at = $1 WHERE session_id = $2`,
      [expiresAt, sessionId],
    );
  }

  async list(filter: SessionRowFilter): Promise<SessionRow[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.userId !== undefined) {
      params.push(filter.userId);
      clauses.push(`user_id = $${params.length}`);
    }
    if (filter.updatedAfter) {
      params.push(filter.updatedAfter);
      clauses.push(`updated_at > $${params.length}`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await this.pool.query(
      `SELECT session_id, user_id, owner_token, template_id, domain_pack_id,
              phase, current_dim, payload, version,
              created_at, updated_at, expires_at
       FROM embediq_sessions ${where}
       ORDER BY updated_at DESC`,
      params,
    );
    return result.rows.map(rowFromPg);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function rowFromPg(raw: Record<string, unknown>): SessionRow {
  // Defensive coercion — pg returns INTEGER columns as numbers, every
  // TEXT as string-or-null. The cast keeps the dialect future-proof
  // against driver quirks (e.g., when a custom type parser is set).
  return {
    session_id: String(raw.session_id),
    user_id: raw.user_id === null || raw.user_id === undefined ? null : String(raw.user_id),
    owner_token: raw.owner_token === null || raw.owner_token === undefined ? null : String(raw.owner_token),
    template_id: raw.template_id === null || raw.template_id === undefined ? null : String(raw.template_id),
    domain_pack_id: raw.domain_pack_id === null || raw.domain_pack_id === undefined ? null : String(raw.domain_pack_id),
    phase: raw.phase as SessionRow['phase'],
    current_dim: raw.current_dim === null || raw.current_dim === undefined ? null : String(raw.current_dim),
    payload: String(raw.payload),
    version: typeof raw.version === 'string' ? Number.parseInt(raw.version, 10) : Number(raw.version),
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
    expires_at: String(raw.expires_at),
  };
}
