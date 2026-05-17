import type { AutopilotStore } from './autopilot-store.js';
import { JsonAutopilotStore } from './store.js';
import { DatabaseAutopilotStore } from './backends/database-store.js';
import { resolveEngagementId, withEngagementSubpath } from '../util/engagement.js';

const DEFAULT_SQLITE_PATH = './.embediq/autopilot.db';

type StoreName = 'json-file' | 'database';

function readStoreName(env: NodeJS.ProcessEnv): StoreName {
  const raw = (env.EMBEDIQ_AUTOPILOT_STORE ?? 'json-file').trim().toLowerCase();
  if (raw === 'json-file' || raw === 'database') return raw;
  console.warn(
    `EMBEDIQ_AUTOPILOT_STORE="${raw}" is not recognized; falling back to 'json-file'.`,
  );
  return 'json-file';
}

/**
 * Construct the configured autopilot store.
 *   - `json-file` (default): single-node `JsonAutopilotStore`. Path
 *     resolves from `EMBEDIQ_AUTOPILOT_DIR` (with engagement scoping).
 *   - `database`: multi-node-ready `DatabaseAutopilotStore`. Driver
 *     comes from `EMBEDIQ_AUTOPILOT_DB_DRIVER` (`sqlite` | `postgres`),
 *     connection string from `EMBEDIQ_AUTOPILOT_DB_URL`.
 *
 * Selecting `database` + `postgres` without the optional `pg` package
 * installed surfaces a clear error naming the install command.
 */
export async function selectAutopilotStore(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AutopilotStore> {
  const name = readStoreName(env);
  if (name === 'json-file') {
    return new JsonAutopilotStore();
  }
  return await buildDatabaseStore(env);
}

async function buildDatabaseStore(env: NodeJS.ProcessEnv): Promise<AutopilotStore> {
  const driver = (env.EMBEDIQ_AUTOPILOT_DB_DRIVER ?? 'sqlite').trim().toLowerCase();
  if (driver === 'sqlite') return await buildSqliteStore(env);
  if (driver === 'postgres') return await buildPostgresStore(env);
  throw new Error(
    `Unknown EMBEDIQ_AUTOPILOT_DB_DRIVER='${driver}'. Valid values: sqlite, postgres.`,
  );
}

async function buildSqliteStore(env: NodeJS.ProcessEnv): Promise<AutopilotStore> {
  const explicit = env.EMBEDIQ_AUTOPILOT_DB_URL?.trim();
  const filePath = explicit || withEngagementSubpath(DEFAULT_SQLITE_PATH, resolveEngagementId(env));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mod: any;
  try {
    mod = await import('better-sqlite3');
  } catch {
    throw new Error(
      "SQLite autopilot store requires the 'better-sqlite3' package. " +
        "Install it with: npm install --save better-sqlite3",
    );
  }
  const DatabaseCtor = mod.default ?? mod;
  ensureParentDir(filePath);
  const db = new DatabaseCtor(filePath);
  const { SqliteAutopilotDialect } = await import('./backends/sqlite-dialect.js');
  return new DatabaseAutopilotStore(new SqliteAutopilotDialect(db));
}

async function buildPostgresStore(env: NodeJS.ProcessEnv): Promise<AutopilotStore> {
  const url = env.EMBEDIQ_AUTOPILOT_DB_URL?.trim();
  if (!url) {
    throw new Error(
      "Postgres autopilot store requires EMBEDIQ_AUTOPILOT_DB_URL " +
        "(e.g. 'postgres://user:pass@host:5432/embediq').",
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pgMod: any;
  try {
    pgMod = await import('pg');
  } catch {
    throw new Error(
      "Postgres autopilot store requires the 'pg' package. " +
        "Install it with: npm install --save pg @types/pg",
    );
  }
  const Pool = pgMod.Pool ?? pgMod.default?.Pool;
  if (!Pool) {
    throw new Error("Postgres driver loaded but did not expose a Pool constructor.");
  }
  const pool = new Pool({ connectionString: url });
  const { PostgresAutopilotDialect } = await import('./backends/postgres-dialect.js');
  return new DatabaseAutopilotStore(new PostgresAutopilotDialect(pool));
}

function ensureParentDir(filePath: string): void {
  if (filePath === ':memory:') return;
  const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastSep <= 0) return;
  const dir = filePath.slice(0, lastSep);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('node:fs').mkdirSync(dir, { recursive: true });
  } catch {
    // best-effort — the driver will error with a clear message if the path is bad
  }
}
