import { randomUUID } from 'node:crypto';
import type {
  AutopilotRun,
  AutopilotRunDriftSummary,
  AutopilotRunStatus,
  AutopilotTrigger,
  AutopilotSchedule,
  Cadence,
  ScheduleCreateInput,
} from '../types.js';
import { nextRunAt } from '../types.js';
import type { AutopilotStore } from '../autopilot-store.js';
import type { TargetFormat } from '../../synthesizer/target-format.js';

/**
 * Row shapes exchanged between the backend and the dialect. Mirror the
 * `embediq_autopilot_schedules` + `embediq_autopilot_runs` schemas.
 * JSON-encoded columns (`targets`, `compliance_frameworks`,
 * `drift_summary`) ride as TEXT — the backend handles serialization so
 * the SQL surface stays portable across SQLite and Postgres.
 */
export interface ScheduleRow {
  id: string;
  name: string;
  cadence: string;
  timezone: string | null;
  answer_source_path: string;
  target_dir: string;
  targets: string | null; // JSON array
  drift_alert_threshold: number | null;
  compliance_frameworks: string | null; // JSON array
  enabled: number; // 0 or 1 (SQLite portability — Postgres reads as same value)
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  next_run_at: string;
}

export interface RunRow {
  id: string;
  schedule_id: string;
  trigger: string;
  started_at: string;
  completed_at: string;
  status: string;
  drift_summary: string | null; // JSON
  error: string | null;
}

export interface RunListFilter {
  scheduleId?: string;
  limit?: number;
}

/**
 * Dialect interface for the autopilot SQL backend. Two tables —
 * schedules and runs. `claimSchedule` is the multi-replica safety
 * primitive: it must execute as `UPDATE … WHERE next_run_at = $expected`
 * and return whether the row was updated.
 */
export interface SqlAutopilotDialect {
  init(): Promise<void>;
  listSchedules(): Promise<ScheduleRow[]>;
  getSchedule(id: string): Promise<ScheduleRow | undefined>;
  insertSchedule(row: ScheduleRow): Promise<void>;
  updateSchedule(id: string, patch: Partial<ScheduleRow>): Promise<ScheduleRow | undefined>;
  deleteSchedule(id: string): Promise<boolean>;
  /**
   * Atomic compare-and-swap. Returns true when the update succeeded
   * (the row's `next_run_at` matched `expectedNextRunAt`); false when
   * another replica advanced the row first or the row was deleted.
   */
  claimSchedule(
    id: string,
    expectedNextRunAt: string,
    newNextRunAt: string,
    now: string,
  ): Promise<boolean>;

  insertRun(row: RunRow): Promise<void>;
  listRuns(filter: RunListFilter): Promise<RunRow[]>;

  close(): Promise<void>;
}

/**
 * AutopilotStore implementation backed by a `SqlAutopilotDialect`.
 * Concerns owned at this layer (not the dialect):
 *   - schedule ↔ row serialization (JSON fields, boolean coercion)
 *   - default `enabled = true` when the caller omits it
 *   - run-row → AutopilotRun JSON decoding
 *
 * Multi-replica deployments call `claimSchedule()` before firing; the
 * dialect's CAS guarantees at most one replica advances the row per
 * tick.
 */
export class DatabaseAutopilotStore implements AutopilotStore {
  private initPromise: Promise<void> | null = null;

  constructor(private readonly dialect: SqlAutopilotDialect) {}

  private ensureInit(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.dialect.init();
    return this.initPromise;
  }

  async listSchedules(): Promise<AutopilotSchedule[]> {
    await this.ensureInit();
    const rows = await this.dialect.listSchedules();
    return rows.map(rowToSchedule);
  }

  async getSchedule(id: string): Promise<AutopilotSchedule | undefined> {
    await this.ensureInit();
    const row = await this.dialect.getSchedule(id);
    return row ? rowToSchedule(row) : undefined;
  }

  async addSchedule(input: ScheduleCreateInput): Promise<AutopilotSchedule> {
    await this.ensureInit();
    const now = new Date();
    const schedule: AutopilotSchedule = {
      id: randomUUID(),
      name: input.name,
      cadence: input.cadence,
      timezone: input.timezone,
      answerSourcePath: input.answerSourcePath,
      targetDir: input.targetDir,
      targets: input.targets,
      driftAlertThreshold: input.driftAlertThreshold,
      complianceFrameworks: input.complianceFrameworks,
      enabled: input.enabled ?? true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      nextRunAt: nextRunAt(input.cadence, now, input.timezone).toISOString(),
    };
    await this.dialect.insertSchedule(scheduleToRow(schedule));
    return schedule;
  }

  async updateSchedule(
    id: string,
    patch: Partial<Omit<AutopilotSchedule, 'id' | 'createdAt'>>,
  ): Promise<AutopilotSchedule | undefined> {
    await this.ensureInit();
    const rowPatch = scheduleToRowPatch({
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    const updated = await this.dialect.updateSchedule(id, rowPatch);
    return updated ? rowToSchedule(updated) : undefined;
  }

  async deleteSchedule(id: string): Promise<boolean> {
    await this.ensureInit();
    return this.dialect.deleteSchedule(id);
  }

  async claimSchedule(
    id: string,
    expectedNextRunAt: string,
    newNextRunAt: string,
    now: string,
  ): Promise<AutopilotSchedule | null> {
    await this.ensureInit();
    const claimed = await this.dialect.claimSchedule(id, expectedNextRunAt, newNextRunAt, now);
    if (!claimed) return null;
    const refreshed = await this.dialect.getSchedule(id);
    return refreshed ? rowToSchedule(refreshed) : null;
  }

  async recordRun(run: AutopilotRun): Promise<void> {
    await this.ensureInit();
    await this.dialect.insertRun(runToRow(run));
  }

  async listRuns(filter: RunListFilter = {}): Promise<AutopilotRun[]> {
    await this.ensureInit();
    const rows = await this.dialect.listRuns(filter);
    return rows.map(rowToRun);
  }

  async close(): Promise<void> {
    if (this.initPromise) await this.initPromise.catch(() => undefined);
    await this.dialect.close();
  }
}

// ─── serialization ────────────────────────────────────────────────────────

function scheduleToRow(schedule: AutopilotSchedule): ScheduleRow {
  return {
    id: schedule.id,
    name: schedule.name,
    cadence: schedule.cadence,
    timezone: schedule.timezone ?? null,
    answer_source_path: schedule.answerSourcePath,
    target_dir: schedule.targetDir,
    targets: schedule.targets ? JSON.stringify(schedule.targets) : null,
    drift_alert_threshold: schedule.driftAlertThreshold ?? null,
    compliance_frameworks: schedule.complianceFrameworks
      ? JSON.stringify(Array.from(schedule.complianceFrameworks))
      : null,
    enabled: schedule.enabled ? 1 : 0,
    created_at: schedule.createdAt,
    updated_at: schedule.updatedAt,
    last_run_at: schedule.lastRunAt ?? null,
    next_run_at: schedule.nextRunAt,
  };
}

function scheduleToRowPatch(
  patch: Partial<Omit<AutopilotSchedule, 'id' | 'createdAt'>>,
): Partial<ScheduleRow> {
  const out: Partial<ScheduleRow> = {};
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.cadence !== undefined) out.cadence = patch.cadence;
  if (patch.timezone !== undefined) out.timezone = patch.timezone ?? null;
  if (patch.answerSourcePath !== undefined) out.answer_source_path = patch.answerSourcePath;
  if (patch.targetDir !== undefined) out.target_dir = patch.targetDir;
  if (patch.targets !== undefined) {
    out.targets = patch.targets ? JSON.stringify(patch.targets) : null;
  }
  if (patch.driftAlertThreshold !== undefined) {
    out.drift_alert_threshold = patch.driftAlertThreshold ?? null;
  }
  if (patch.complianceFrameworks !== undefined) {
    out.compliance_frameworks = patch.complianceFrameworks
      ? JSON.stringify(Array.from(patch.complianceFrameworks))
      : null;
  }
  if (patch.enabled !== undefined) out.enabled = patch.enabled ? 1 : 0;
  if (patch.updatedAt !== undefined) out.updated_at = patch.updatedAt;
  if (patch.lastRunAt !== undefined) out.last_run_at = patch.lastRunAt ?? null;
  if (patch.nextRunAt !== undefined) out.next_run_at = patch.nextRunAt;
  return out;
}

function rowToSchedule(row: ScheduleRow): AutopilotSchedule {
  return {
    id: row.id,
    name: row.name,
    cadence: row.cadence as Cadence,
    timezone: row.timezone ?? undefined,
    answerSourcePath: row.answer_source_path,
    targetDir: row.target_dir,
    targets: row.targets ? (JSON.parse(row.targets) as TargetFormat[]) : undefined,
    driftAlertThreshold: row.drift_alert_threshold ?? undefined,
    complianceFrameworks: row.compliance_frameworks
      ? (JSON.parse(row.compliance_frameworks) as readonly string[])
      : undefined,
    enabled: row.enabled === 1 || (row.enabled as unknown) === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastRunAt: row.last_run_at ?? undefined,
    nextRunAt: row.next_run_at,
  };
}

function runToRow(run: AutopilotRun): RunRow {
  return {
    id: run.id,
    schedule_id: run.scheduleId,
    trigger: run.trigger,
    started_at: run.startedAt,
    completed_at: run.completedAt,
    status: run.status,
    drift_summary: run.driftSummary ? JSON.stringify(run.driftSummary) : null,
    error: run.error ?? null,
  };
}

function rowToRun(row: RunRow): AutopilotRun {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    trigger: row.trigger as AutopilotTrigger,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status as AutopilotRunStatus,
    driftSummary: row.drift_summary
      ? (JSON.parse(row.drift_summary) as AutopilotRunDriftSummary)
      : undefined,
    error: row.error ?? undefined,
  };
}
