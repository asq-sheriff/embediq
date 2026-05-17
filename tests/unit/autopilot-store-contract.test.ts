import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { newDb, type IMemoryDb } from 'pg-mem';
import {
  JsonAutopilotStore,
  DatabaseAutopilotStore,
  SqliteAutopilotDialect,
  PostgresAutopilotDialect,
} from '../../src/autopilot/index.js';
import type { PgPoolLike } from '../../src/web/sessions/index.js';
import { autopilotStoreContract } from '../helpers/autopilot-store-contract.js';

// ─── JSON-file ────────────────────────────────────────────────────────────
autopilotStoreContract('json-file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'embediq-ap-contract-json-'));
  const store = new JsonAutopilotStore(dir);
  return {
    store,
    teardown: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
});

// ─── SQLite (in-memory) ──────────────────────────────────────────────────
autopilotStoreContract('database-sqlite', async () => {
  const db = new Database(':memory:');
  const store = new DatabaseAutopilotStore(new SqliteAutopilotDialect(db));
  return {
    store,
    teardown: async () => {
      await store.close?.();
    },
  };
});

// ─── Postgres (pg-mem) ───────────────────────────────────────────────────
function poolFromPgMem(db: IMemoryDb): PgPoolLike {
  const pg = db.adapters.createPg();
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

autopilotStoreContract('database-postgres', async () => {
  const db = newDb();
  const pool = poolFromPgMem(db);
  const store = new DatabaseAutopilotStore(new PostgresAutopilotDialect(pool));
  return {
    store,
    teardown: async () => {
      await store.close?.();
    },
  };
});
