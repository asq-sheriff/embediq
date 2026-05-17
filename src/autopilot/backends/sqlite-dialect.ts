import type { Database } from 'better-sqlite3';
import type {
  SqlAutopilotDialect,
  ScheduleRow,
  RunRow,
  RunListFilter,
} from './database-store.js';

/**
 * SQLite dialect for the autopilot SQL backend. Synchronous internally
 * (better-sqlite3 is sync); declared async to fit the
 * `SqlAutopilotDialect` interface that also serves the Postgres driver.
 *
 * Schema:
 *   embediq_autopilot_schedules — one row per schedule, indexed on
 *     `next_run_at` for the scheduler's "what's due" query.
 *   embediq_autopilot_runs — append-only history, indexed on
 *     (schedule_id, started_at) for run-list lookups.
 *
 * Single-process write safety: WAL journal mode keeps concurrent
 * readers safe alongside one writer. Cross-process autopilot writers
 * against the same SQLite file are unsupported (use Postgres for that).
 */
export class SqliteAutopilotDialect implements SqlAutopilotDialect {
  constructor(private readonly db: Database) {
    this.db.pragma('journal_mode = WAL');
  }

  async init(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embediq_autopilot_schedules (
        id                       TEXT PRIMARY KEY,
        name                     TEXT NOT NULL,
        cadence                  TEXT NOT NULL,
        timezone                 TEXT,
        answer_source_path       TEXT NOT NULL,
        target_dir               TEXT NOT NULL,
        targets                  TEXT,
        drift_alert_threshold    INTEGER,
        compliance_frameworks    TEXT,
        enabled                  INTEGER NOT NULL,
        created_at               TEXT NOT NULL,
        updated_at               TEXT NOT NULL,
        last_run_at              TEXT,
        next_run_at              TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_embediq_autopilot_schedules_next_run
        ON embediq_autopilot_schedules(next_run_at);

      CREATE TABLE IF NOT EXISTS embediq_autopilot_runs (
        id              TEXT PRIMARY KEY,
        schedule_id     TEXT NOT NULL,
        trigger         TEXT NOT NULL,
        started_at      TEXT NOT NULL,
        completed_at    TEXT NOT NULL,
        status          TEXT NOT NULL,
        drift_summary   TEXT,
        error           TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_embediq_autopilot_runs_sched
        ON embediq_autopilot_runs(schedule_id, started_at);
    `);
  }

  async listSchedules(): Promise<ScheduleRow[]> {
    return this.db
      .prepare(`SELECT * FROM embediq_autopilot_schedules ORDER BY created_at ASC`)
      .all() as ScheduleRow[];
  }

  async getSchedule(id: string): Promise<ScheduleRow | undefined> {
    return this.db
      .prepare(`SELECT * FROM embediq_autopilot_schedules WHERE id = ?`)
      .get(id) as ScheduleRow | undefined;
  }

  async insertSchedule(row: ScheduleRow): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO embediq_autopilot_schedules (
          id, name, cadence, timezone, answer_source_path, target_dir,
          targets, drift_alert_threshold, compliance_frameworks, enabled,
          created_at, updated_at, last_run_at, next_run_at
        ) VALUES (
          @id, @name, @cadence, @timezone, @answer_source_path, @target_dir,
          @targets, @drift_alert_threshold, @compliance_frameworks, @enabled,
          @created_at, @updated_at, @last_run_at, @next_run_at
        )
      `)
      .run(row);
  }

  async updateSchedule(
    id: string,
    patch: Partial<ScheduleRow>,
  ): Promise<ScheduleRow | undefined> {
    const keys = Object.keys(patch);
    if (keys.length === 0) return this.getSchedule(id);
    const setClause = keys.map((k) => `${k} = @${k}`).join(', ');
    const sql = `UPDATE embediq_autopilot_schedules SET ${setClause} WHERE id = @id`;
    const info = this.db.prepare(sql).run({ ...patch, id });
    if (info.changes === 0) return undefined;
    return this.getSchedule(id);
  }

  async deleteSchedule(id: string): Promise<boolean> {
    const info = this.db
      .prepare(`DELETE FROM embediq_autopilot_schedules WHERE id = ?`)
      .run(id);
    return info.changes > 0;
  }

  async claimSchedule(
    id: string,
    expectedNextRunAt: string,
    newNextRunAt: string,
    now: string,
  ): Promise<boolean> {
    const info = this.db
      .prepare(`
        UPDATE embediq_autopilot_schedules
        SET next_run_at = ?, updated_at = ?
        WHERE id = ? AND next_run_at = ?
      `)
      .run(newNextRunAt, now, id, expectedNextRunAt);
    return info.changes === 1;
  }

  async insertRun(row: RunRow): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO embediq_autopilot_runs (
          id, schedule_id, trigger, started_at, completed_at,
          status, drift_summary, error
        ) VALUES (
          @id, @schedule_id, @trigger, @started_at, @completed_at,
          @status, @drift_summary, @error
        )
      `)
      .run(row);
  }

  async listRuns(filter: RunListFilter): Promise<RunRow[]> {
    const params: unknown[] = [];
    let sql = `SELECT * FROM embediq_autopilot_runs`;
    if (filter.scheduleId) {
      sql += ` WHERE schedule_id = ?`;
      params.push(filter.scheduleId);
    }
    sql += ` ORDER BY started_at DESC`;
    if (filter.limit && filter.limit > 0) {
      sql += ` LIMIT ?`;
      params.push(filter.limit);
    }
    return this.db.prepare(sql).all(...params) as RunRow[];
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
