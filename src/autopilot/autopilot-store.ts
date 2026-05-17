import type {
  AutopilotRun,
  AutopilotSchedule,
  ScheduleCreateInput,
} from './types.js';

/**
 * Persistence contract for autopilot schedules + run history.
 * Implementations:
 *   - `JsonAutopilotStore` — single-node JSON-file backed (the v1 store).
 *   - `DatabaseAutopilotStore` — multi-node-ready, plugs into SQLite or
 *     Postgres via a `SqlAutopilotDialect`.
 *
 * Multi-replica coordination is enforced through `claimSchedule()`:
 * before a scheduler tick fires a due schedule, it must atomically
 * advance the schedule's `nextRunAt` from the value it just observed
 * to the next firing. Two replicas racing on the same schedule both
 * see "due"; only the one whose CAS succeeds runs the autopilot job.
 * The JSON store implements this trivially (in-memory state, no
 * concurrent writers); the SQL dialects implement it as
 * `UPDATE … SET next_run_at = $new WHERE id = $id AND next_run_at = $expected`
 * and a `rowCount === 1` check.
 */
export interface AutopilotStore {
  listSchedules(): Promise<AutopilotSchedule[]>;
  getSchedule(id: string): Promise<AutopilotSchedule | undefined>;
  addSchedule(input: ScheduleCreateInput): Promise<AutopilotSchedule>;
  updateSchedule(
    id: string,
    patch: Partial<Omit<AutopilotSchedule, 'id' | 'createdAt'>>,
  ): Promise<AutopilotSchedule | undefined>;
  deleteSchedule(id: string): Promise<boolean>;

  recordRun(run: AutopilotRun): Promise<void>;
  listRuns(filter?: { scheduleId?: string; limit?: number }): Promise<AutopilotRun[]>;

  /**
   * Atomic claim-and-advance. Returns the updated schedule (with
   * `nextRunAt` set to `newNextRunAt`) when the CAS succeeded; returns
   * `null` when another replica advanced the row first or the schedule
   * was deleted between list and claim.
   *
   * `expectedNextRunAt` must match the value the caller previously
   * observed via `listSchedules()` for the claim to succeed.
   */
  claimSchedule(
    id: string,
    expectedNextRunAt: string,
    newNextRunAt: string,
    now: string,
  ): Promise<AutopilotSchedule | null>;

  /** Strictly for tests — wipes all state. Optional on production stores. */
  clearForTesting?(): Promise<void>;

  /** Release any connections. Optional. */
  close?(): Promise<void>;
}
