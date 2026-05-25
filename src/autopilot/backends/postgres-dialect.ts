import type {
  SqlAutopilotDialect,
  ScheduleRow,
  RunRow,
  RunListFilter,
} from './database-store.js';
import type { PgPoolLike } from '../../web/sessions/backends/postgres-dialect.js';

/**
 * Postgres dialect for the autopilot SQL backend. Same schema as the
 * SQLite dialect — `embediq_autopilot_schedules` + `embediq_autopilot_runs`,
 * portable column types only (TEXT / INTEGER).
 *
 * Multi-node coordination lives in `claimSchedule`: atomic
 * `UPDATE … WHERE next_run_at = $expected` with a `RETURNING id`
 * predicate. The CAS gives at-most-once firing semantics across any
 * number of scheduler replicas pointing at the same Postgres instance.
 */
export class PostgresAutopilotDialect implements SqlAutopilotDialect {
  constructor(private readonly pool: PgPoolLike) {}

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS embediq_autopilot_schedules (
        id                          TEXT PRIMARY KEY,
        name                        TEXT NOT NULL,
        cadence                     TEXT NOT NULL,
        timezone                    TEXT,
        answer_source_path          TEXT NOT NULL,
        target_dir                  TEXT NOT NULL,
        targets                     TEXT,
        drift_alert_threshold       INTEGER,
        compliance_frameworks       TEXT,
        alert_on_failure_streak     INTEGER,
        enabled                     INTEGER NOT NULL,
        created_at                  TEXT NOT NULL,
        updated_at                  TEXT NOT NULL,
        last_run_at                 TEXT,
        next_run_at                 TEXT NOT NULL
      )
    `);
    // Upgrade path for tables created before alert_on_failure_streak existed.
    await this.pool.query(`
      ALTER TABLE embediq_autopilot_schedules
        ADD COLUMN IF NOT EXISTS alert_on_failure_streak INTEGER
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_embediq_autopilot_schedules_next_run
        ON embediq_autopilot_schedules(next_run_at)
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS embediq_autopilot_runs (
        id              TEXT PRIMARY KEY,
        schedule_id     TEXT NOT NULL,
        trigger         TEXT NOT NULL,
        started_at      TEXT NOT NULL,
        completed_at    TEXT NOT NULL,
        status          TEXT NOT NULL,
        drift_summary   TEXT,
        error           TEXT
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_embediq_autopilot_runs_sched
        ON embediq_autopilot_runs(schedule_id, started_at)
    `);
  }

  async listSchedules(): Promise<ScheduleRow[]> {
    const result = await this.pool.query(
      `SELECT id, name, cadence, timezone, answer_source_path, target_dir,
              targets, drift_alert_threshold, compliance_frameworks,
              alert_on_failure_streak, enabled,
              created_at, updated_at, last_run_at, next_run_at
       FROM embediq_autopilot_schedules
       ORDER BY created_at ASC`,
    );
    return result.rows.map(scheduleRowFromPg);
  }

  async getSchedule(id: string): Promise<ScheduleRow | undefined> {
    const result = await this.pool.query(
      `SELECT id, name, cadence, timezone, answer_source_path, target_dir,
              targets, drift_alert_threshold, compliance_frameworks,
              alert_on_failure_streak, enabled,
              created_at, updated_at, last_run_at, next_run_at
       FROM embediq_autopilot_schedules WHERE id = $1`,
      [id],
    );
    return result.rows.length > 0 ? scheduleRowFromPg(result.rows[0]) : undefined;
  }

  async insertSchedule(row: ScheduleRow): Promise<void> {
    await this.pool.query(
      `INSERT INTO embediq_autopilot_schedules (
         id, name, cadence, timezone, answer_source_path, target_dir,
         targets, drift_alert_threshold, compliance_frameworks,
         alert_on_failure_streak, enabled,
         created_at, updated_at, last_run_at, next_run_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
       )`,
      [
        row.id, row.name, row.cadence, row.timezone,
        row.answer_source_path, row.target_dir,
        row.targets, row.drift_alert_threshold, row.compliance_frameworks,
        row.alert_on_failure_streak,
        row.enabled,
        row.created_at, row.updated_at, row.last_run_at, row.next_run_at,
      ],
    );
  }

  async updateSchedule(
    id: string,
    patch: Partial<ScheduleRow>,
  ): Promise<ScheduleRow | undefined> {
    const keys = Object.keys(patch);
    if (keys.length === 0) return this.getSchedule(id);
    const params: unknown[] = [];
    const setClauses = keys.map((k) => {
      params.push((patch as Record<string, unknown>)[k]);
      return `${k} = $${params.length}`;
    });
    params.push(id);
    const sql =
      `UPDATE embediq_autopilot_schedules SET ${setClauses.join(', ')} ` +
      `WHERE id = $${params.length} RETURNING id`;
    const result = await this.pool.query(sql, params);
    if (result.rows.length === 0) return undefined;
    return this.getSchedule(id);
  }

  async deleteSchedule(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM embediq_autopilot_schedules WHERE id = $1 RETURNING id`,
      [id],
    );
    return result.rows.length > 0;
  }

  async claimSchedule(
    id: string,
    expectedNextRunAt: string,
    newNextRunAt: string,
    now: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE embediq_autopilot_schedules
       SET next_run_at = $1, updated_at = $2
       WHERE id = $3 AND next_run_at = $4
       RETURNING id`,
      [newNextRunAt, now, id, expectedNextRunAt],
    );
    return result.rows.length === 1;
  }

  async insertRun(row: RunRow): Promise<void> {
    await this.pool.query(
      `INSERT INTO embediq_autopilot_runs (
         id, schedule_id, trigger, started_at, completed_at,
         status, drift_summary, error
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8
       )`,
      [
        row.id, row.schedule_id, row.trigger,
        row.started_at, row.completed_at,
        row.status, row.drift_summary, row.error,
      ],
    );
  }

  async listRuns(filter: RunListFilter): Promise<RunRow[]> {
    const params: unknown[] = [];
    let sql =
      `SELECT id, schedule_id, trigger, started_at, completed_at,
              status, drift_summary, error
       FROM embediq_autopilot_runs`;
    if (filter.scheduleId) {
      params.push(filter.scheduleId);
      sql += ` WHERE schedule_id = $${params.length}`;
    }
    sql += ` ORDER BY started_at DESC`;
    if (filter.limit && filter.limit > 0) {
      params.push(filter.limit);
      sql += ` LIMIT $${params.length}`;
    }
    const result = await this.pool.query(sql, params);
    return result.rows.map(runRowFromPg);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function scheduleRowFromPg(raw: Record<string, unknown>): ScheduleRow {
  return {
    id: String(raw.id),
    name: String(raw.name),
    cadence: String(raw.cadence),
    timezone: raw.timezone == null ? null : String(raw.timezone),
    answer_source_path: String(raw.answer_source_path),
    target_dir: String(raw.target_dir),
    targets: raw.targets == null ? null : String(raw.targets),
    drift_alert_threshold:
      raw.drift_alert_threshold == null
        ? null
        : typeof raw.drift_alert_threshold === 'string'
          ? Number.parseInt(raw.drift_alert_threshold, 10)
          : Number(raw.drift_alert_threshold),
    compliance_frameworks:
      raw.compliance_frameworks == null ? null : String(raw.compliance_frameworks),
    alert_on_failure_streak:
      raw.alert_on_failure_streak == null
        ? null
        : typeof raw.alert_on_failure_streak === 'string'
          ? Number.parseInt(raw.alert_on_failure_streak, 10)
          : Number(raw.alert_on_failure_streak),
    enabled:
      typeof raw.enabled === 'string'
        ? Number.parseInt(raw.enabled, 10)
        : Number(raw.enabled),
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
    last_run_at: raw.last_run_at == null ? null : String(raw.last_run_at),
    next_run_at: String(raw.next_run_at),
  };
}

function runRowFromPg(raw: Record<string, unknown>): RunRow {
  return {
    id: String(raw.id),
    schedule_id: String(raw.schedule_id),
    trigger: String(raw.trigger),
    started_at: String(raw.started_at),
    completed_at: String(raw.completed_at),
    status: String(raw.status),
    drift_summary: raw.drift_summary == null ? null : String(raw.drift_summary),
    error: raw.error == null ? null : String(raw.error),
  };
}
