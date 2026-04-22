import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  AutopilotRun,
  AutopilotSchedule,
  ScheduleCreateInput,
} from './types.js';
import { nextRunAt } from './types.js';

/**
 * Single-node JSON-file backed store for autopilot schedules and runs.
 * Each list is held in memory for fast lookups and persisted to disk on
 * every mutation via temp-file + atomic rename. Multi-node deployments
 * will need a SQL-backed store — that's tracked in the v3.2 follow-ups.
 */
export class JsonAutopilotStore {
  private schedules: AutopilotSchedule[] = [];
  private runs: AutopilotRun[] = [];
  private loaded = false;
  private readonly schedulesFile: string;
  private readonly runsFile: string;

  constructor(private readonly dir: string = defaultDir()) {
    this.schedulesFile = join(dir, 'schedules.json');
    this.runsFile = join(dir, 'runs.json');
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await mkdir(this.dir, { recursive: true });
    this.schedules = await readJsonArray<AutopilotSchedule>(this.schedulesFile);
    this.runs = await readJsonArray<AutopilotRun>(this.runsFile);
    this.loaded = true;
  }

  async listSchedules(): Promise<AutopilotSchedule[]> {
    await this.ensureLoaded();
    return [...this.schedules];
  }

  async getSchedule(id: string): Promise<AutopilotSchedule | undefined> {
    await this.ensureLoaded();
    return this.schedules.find((s) => s.id === id);
  }

  async addSchedule(input: ScheduleCreateInput): Promise<AutopilotSchedule> {
    await this.ensureLoaded();
    const now = new Date();
    const schedule: AutopilotSchedule = {
      id: randomUUID(),
      name: input.name,
      cadence: input.cadence,
      answerSourcePath: input.answerSourcePath,
      targetDir: input.targetDir,
      targets: input.targets,
      driftAlertThreshold: input.driftAlertThreshold,
      complianceFrameworks: input.complianceFrameworks,
      enabled: input.enabled ?? true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      nextRunAt: nextRunAt(input.cadence, now).toISOString(),
    };
    this.schedules.push(schedule);
    await this.persistSchedules();
    return schedule;
  }

  async updateSchedule(
    id: string,
    patch: Partial<Omit<AutopilotSchedule, 'id' | 'createdAt'>>,
  ): Promise<AutopilotSchedule | undefined> {
    await this.ensureLoaded();
    const idx = this.schedules.findIndex((s) => s.id === id);
    if (idx < 0) return undefined;
    const updated: AutopilotSchedule = {
      ...this.schedules[idx],
      ...patch,
      id: this.schedules[idx].id,
      createdAt: this.schedules[idx].createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.schedules[idx] = updated;
    await this.persistSchedules();
    return updated;
  }

  async deleteSchedule(id: string): Promise<boolean> {
    await this.ensureLoaded();
    const before = this.schedules.length;
    this.schedules = this.schedules.filter((s) => s.id !== id);
    if (this.schedules.length === before) return false;
    await this.persistSchedules();
    return true;
  }

  async recordRun(run: AutopilotRun): Promise<void> {
    await this.ensureLoaded();
    this.runs.push(run);
    // Cap history at most-recent 500 to keep the JSON file tractable. The
    // schedule manager can opt out by reading runs incrementally and
    // archiving old ones, but for v1 the cap is fine.
    if (this.runs.length > 500) this.runs = this.runs.slice(-500);
    await this.persistRuns();
  }

  async listRuns(filter: { scheduleId?: string; limit?: number } = {}): Promise<AutopilotRun[]> {
    await this.ensureLoaded();
    let out = filter.scheduleId
      ? this.runs.filter((r) => r.scheduleId === filter.scheduleId)
      : [...this.runs];
    out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    if (filter.limit && filter.limit > 0) out = out.slice(0, filter.limit);
    return out;
  }

  /** Strictly for tests — wipes the in-memory state and on-disk files. */
  async clearForTesting(): Promise<void> {
    this.schedules = [];
    this.runs = [];
    this.loaded = true;
    await this.persistSchedules();
    await this.persistRuns();
  }

  private async persistSchedules(): Promise<void> {
    await atomicWriteJson(this.schedulesFile, this.schedules);
  }

  private async persistRuns(): Promise<void> {
    await atomicWriteJson(this.runsFile, this.runs);
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────

function defaultDir(): string {
  return resolve(process.env.EMBEDIQ_AUTOPILOT_DIR || '.embediq/autopilot');
}

async function readJsonArray<T>(path: string): Promise<T[]> {
  if (!existsSync(path)) return [];
  const raw = await readFile(path, 'utf-8');
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    // A corrupt file is recoverable — start fresh and let the next write
    // overwrite. The autopilot subsystem must never block the main app.
    return [];
  }
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${randomUUID()}`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8');
  await rename(tmp, path);
}
