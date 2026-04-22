import type { SessionBackend, SessionBackendName } from './session-backend.js';
import { NullBackend } from './null-backend.js';
import { JsonFileBackend } from './backends/json-file.js';
import { DatabaseBackend } from './backends/database.js';
import { PayloadCipher } from './encryption.js';

const DEFAULT_SESSION_DIR = './.embediq/sessions';
const DEFAULT_SQLITE_PATH = './.embediq/sessions.db';

/** Floor on EMBEDIQ_SESSION_TTL_MS — one minute. */
export const TTL_MIN_MS = 60 * 1000;
/** Ceiling on EMBEDIQ_SESSION_TTL_MS — thirty days. */
export const TTL_MAX_MS = 30 * 24 * 60 * 60 * 1000;
/** Default TTL when EMBEDIQ_SESSION_TTL_MS is unset — seven days. */
export const TTL_DEFAULT_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionBackendConfig {
  ttlMs: number;
}

/**
 * Read EMBEDIQ_SESSION_TTL_MS from the environment, clamp to
 * [TTL_MIN_MS, TTL_MAX_MS], and log a warning when the configured value
 * fell outside the allowed range.
 */
export function resolveTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.EMBEDIQ_SESSION_TTL_MS;
  if (!raw) return TTL_DEFAULT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `EMBEDIQ_SESSION_TTL_MS="${raw}" is not a positive integer; falling back to default (${TTL_DEFAULT_MS}).`,
    );
    return TTL_DEFAULT_MS;
  }
  if (parsed < TTL_MIN_MS) {
    console.warn(`EMBEDIQ_SESSION_TTL_MS clamped up to ${TTL_MIN_MS} (minimum).`);
    return TTL_MIN_MS;
  }
  if (parsed > TTL_MAX_MS) {
    console.warn(`EMBEDIQ_SESSION_TTL_MS clamped down to ${TTL_MAX_MS} (30-day maximum).`);
    return TTL_MAX_MS;
  }
  return parsed;
}

function readBackendName(env: NodeJS.ProcessEnv): SessionBackendName {
  const raw = (env.EMBEDIQ_SESSION_BACKEND ?? 'none').trim() as SessionBackendName;
  switch (raw) {
    case 'none':
    case 'json-file':
    case 'redis':
    case 'database':
      return raw;
    default:
      console.warn(
        `EMBEDIQ_SESSION_BACKEND="${raw}" is not recognized; falling back to 'none'.`,
      );
      return 'none';
  }
}

/**
 * Select and construct the configured session backend. Returns NullBackend
 * when EMBEDIQ_SESSION_BACKEND is unset or 'none'. Concrete backends are
 * wired incrementally — selecting one that is not yet available surfaces a
 * clear error naming the package required at runtime.
 */
export async function selectSessionBackend(
  env: NodeJS.ProcessEnv = process.env,
): Promise<SessionBackend> {
  const name = readBackendName(env);
  if (name === 'none') return new NullBackend();

  if (name === 'json-file') {
    const dir = env.EMBEDIQ_SESSION_DIR?.trim() || DEFAULT_SESSION_DIR;
    return new JsonFileBackend({ dir });
  }

  if (name === 'database') {
    return await selectDatabaseBackend(env);
  }

  throw new Error(
    `Session backend '${name}' is not yet available in this build. ` +
      `Set EMBEDIQ_SESSION_BACKEND=none (or unset it) for stateless mode. ` +
      `${runtimeDependencyHint(name)}`,
  );
}

async function selectDatabaseBackend(env: NodeJS.ProcessEnv): Promise<SessionBackend> {
  const driver = env.EMBEDIQ_SESSION_DB_DRIVER?.trim().toLowerCase() || 'sqlite';
  if (driver === 'sqlite') {
    return await buildSqliteBackend(env);
  }
  if (driver === 'postgres') {
    throw new Error(
      "Postgres driver for the database backend is not yet wired. " +
        "Set EMBEDIQ_SESSION_DB_DRIVER=sqlite (or unset it) to use the SQLite default.",
    );
  }
  throw new Error(
    `Unknown EMBEDIQ_SESSION_DB_DRIVER='${driver}'. Valid values: sqlite, postgres.`,
  );
}

async function buildSqliteBackend(env: NodeJS.ProcessEnv): Promise<SessionBackend> {
  const filePath = env.EMBEDIQ_SESSION_DB_URL?.trim() || DEFAULT_SQLITE_PATH;
  // Dynamic import is typed as `any` because better-sqlite3 ships a CJS
  // namespace export that trips TypeScript's ESM/CJS interop on import().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mod: any;
  try {
    mod = await import('better-sqlite3');
  } catch {
    throw new Error(
      "SQLite session backend requires the 'better-sqlite3' package. " +
        "Install it with: npm install --save better-sqlite3",
    );
  }
  const DatabaseCtor = mod.default ?? mod;
  const { SqliteDialect } = await import('./backends/sqlite-dialect.js');
  ensureParentDir(filePath);
  const db = new DatabaseCtor(filePath);
  return new DatabaseBackend(new SqliteDialect(db), { cipher: PayloadCipher.fromEnv(env) });
}

function ensureParentDir(filePath: string): void {
  if (filePath === ':memory:') return;
  const path = filePath;
  const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (lastSep <= 0) return;
  const dir = path.slice(0, lastSep);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('node:fs').mkdirSync(dir, { recursive: true });
  } catch {
    // best-effort — sqlite will error with a clear message if the path is bad
  }
}

function runtimeDependencyHint(name: Exclude<SessionBackendName, 'none' | 'json-file' | 'database'>): string {
  switch (name) {
    case 'redis':
      return "The redis backend will require 'ioredis' (install with: npm install --save ioredis).";
  }
}
