import { describe, it, expect } from 'vitest';
import { newDb, type IMemoryDb } from 'pg-mem';
import {
  DatabaseBackend,
  PayloadCipher,
  PostgresDialect,
  type PgPoolLike,
} from '../../src/web/sessions/index.js';
import { contractTest } from '../helpers/session-backend-contract.js';

/**
 * Wraps a pg-mem in-memory database in the small structural pool
 * surface (`query`, `end`) that PostgresDialect needs. The dialect
 * never sees the real `pg.Pool` — it works against this shim too,
 * which is the whole point of `PgPoolLike`.
 */
function poolFromPgMem(db: IMemoryDb): PgPoolLike {
  const pg = db.adapters.createPg();
  // pg-mem returns its own Pool class shaped like node-postgres Pool.
  const pool = new pg.Pool();
  return {
    async query(text: string, params?: ReadonlyArray<unknown>) {
      const result = await pool.query(text, params ? Array.from(params) : undefined);
      return { rows: (result.rows ?? []) as Array<Record<string, unknown>> };
    },
    async end() {
      await pool.end();
    },
  };
}

contractTest('database-postgres', async () => {
  const db = newDb();
  const pool = poolFromPgMem(db);
  const backend = new DatabaseBackend(new PostgresDialect(pool));
  return {
    backend,
    teardown: async () => {
      await backend.close();
    },
  };
});

const TEST_KEY_HEX = 'b'.repeat(64);
contractTest('database-postgres (encrypted)', async () => {
  const db = newDb();
  const pool = poolFromPgMem(db);
  const cipher = PayloadCipher.fromHexKey(TEST_KEY_HEX);
  const backend = new DatabaseBackend(new PostgresDialect(pool), { cipher });
  return {
    backend,
    teardown: async () => {
      await backend.close();
    },
  };
});

describe('PostgresDialect — schema + SQL surface', () => {
  it('creates the embediq_sessions table on init()', async () => {
    const db = newDb();
    const pool = poolFromPgMem(db);
    const dialect = new PostgresDialect(pool);
    await dialect.init();

    // After init the table accepts a SELECT — proves it exists with the
    // expected shape. (pg-mem's information_schema implementation is
    // approximate, so we verify by query rather than metadata read.)
    const result = await pool.query(
      `SELECT COUNT(*)::int AS n FROM embediq_sessions`,
    );
    expect(result.rows[0].n).toBe(0);
    await dialect.close();
  });

  it('upsert is idempotent for the same session_id', async () => {
    const db = newDb();
    const pool = poolFromPgMem(db);
    const dialect = new PostgresDialect(pool);
    await dialect.init();

    const baseRow = {
      session_id: 'abc',
      user_id: 'u1',
      owner_token: null,
      template_id: null,
      domain_pack_id: null,
      phase: 'discovery' as const,
      current_dim: null,
      payload: '{}',
      version: 1,
      created_at: '2026-05-17T00:00:00.000Z',
      updated_at: '2026-05-17T00:00:00.000Z',
      expires_at: '2099-01-01T00:00:00.000Z',
    };
    await dialect.upsert(baseRow);
    await dialect.upsert({ ...baseRow, payload: '{"updated":true}', version: 2 });

    const fetched = await dialect.get('abc');
    expect(fetched?.payload).toBe('{"updated":true}');
    expect(fetched?.version).toBe(2);
    await dialect.close();
  });

  it('list filters by userId and updatedAfter, ordered by updated_at DESC', async () => {
    const db = newDb();
    const pool = poolFromPgMem(db);
    const dialect = new PostgresDialect(pool);
    await dialect.init();

    const baseRow = {
      session_id: 's-a',
      user_id: 'alice',
      owner_token: null,
      template_id: null,
      domain_pack_id: null,
      phase: 'discovery' as const,
      current_dim: null,
      payload: '{}',
      version: 1,
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
      expires_at: '2099-01-01T00:00:00.000Z',
    };
    await dialect.upsert(baseRow);
    await dialect.upsert({ ...baseRow, session_id: 's-b', updated_at: '2026-05-15T00:00:00.000Z' });
    await dialect.upsert({ ...baseRow, session_id: 's-c', user_id: 'bob', updated_at: '2026-05-10T00:00:00.000Z' });

    const alice = await dialect.list({ userId: 'alice' });
    expect(alice.map((r) => r.session_id)).toEqual(['s-b', 's-a']);

    const recent = await dialect.list({ updatedAfter: '2026-05-05T00:00:00.000Z' });
    expect(recent.map((r) => r.session_id).sort()).toEqual(['s-b', 's-c']);

    await dialect.close();
  });
});
