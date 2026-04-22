import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Answer, GeneratedFile } from '../types/index.js';
import { EvaluationError } from './types.js';
import type {
  ArchetypeMeta,
  GoldenMeta,
  LoadedArchetype,
  Weights,
} from './types.js';
import { DEFAULT_WEIGHTS, mergeWeights } from './weights.js';
import { parseTargets } from '../synthesizer/target-format.js';

const ARCHETYPE_FILE = 'archetype.yaml';
const ANSWERS_FILE = 'answers.yaml';
const WEIGHTS_FILE = 'weights.yaml';
const GOLDEN_META_FILE = 'golden-meta.yaml';
const EXPECTED_DIR = 'expected';

const FIXED_TIMESTAMP = new Date('2026-01-01T00:00:00Z');

export interface LoadArchetypeOptions {
  /** Base weights the archetype's override layers on top of. */
  baseWeights?: Weights;
}

/**
 * Load an archetype from a directory:
 *   <root>/archetype.yaml         required — metadata
 *   <root>/answers.yaml           required — replayed answer map
 *   <root>/weights.yaml           optional — partial Weights override
 *   <root>/golden-meta.yaml       optional — reviewer provenance
 *   <root>/expected/**            required — golden file tree
 *
 * A directory missing any required piece raises EvaluationError so the
 * evaluator can skip it with a clear reason rather than silently running.
 */
export async function loadArchetype(
  dir: string,
  options: LoadArchetypeOptions = {},
): Promise<LoadedArchetype> {
  if (!existsSync(dir)) {
    throw new EvaluationError(`Archetype directory does not exist: ${dir}`);
  }

  const meta = await readArchetypeMeta(dir);
  const answers = await readAnswers(dir, meta.id);
  const goldenMeta = await readGoldenMeta(dir);
  const weightsOverride = await readWeightsOverride(dir);
  const weights = mergeWeights(options.baseWeights ?? DEFAULT_WEIGHTS, weightsOverride);
  const expectedFiles = await readExpectedTree(join(dir, EXPECTED_DIR), meta.id);

  return { meta, answers, expectedFiles, weights, goldenMeta };
}

/**
 * Discover archetype subdirectories under a root. Each subdirectory that
 * contains `archetype.yaml` is returned; others are silently skipped.
 */
export async function discoverArchetypes(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(root, entry.name);
    if (existsSync(join(candidate, ARCHETYPE_FILE))) out.push(candidate);
  }
  return out.sort();
}

// ─── archetype.yaml ───────────────────────────────────────────────────────

async function readArchetypeMeta(dir: string): Promise<ArchetypeMeta> {
  const path = join(dir, ARCHETYPE_FILE);
  if (!existsSync(path)) {
    throw new EvaluationError(`Missing ${ARCHETYPE_FILE} in archetype directory: ${dir}`);
  }
  const raw = await readFile(path, 'utf-8');
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new EvaluationError(
      `Malformed YAML in ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new EvaluationError(`${ARCHETYPE_FILE} must be a YAML mapping: ${path}`);
  }

  const id = requireString(parsed, 'id', path);
  const title = requireString(parsed, 'title', path);
  const minimumFloor = requireNumber(parsed, 'minimumFloor', path);
  const description = typeof parsed.description === 'string' ? parsed.description : undefined;

  // `targets` is optional — we pass it through `parseTargets` so the same
  // aliases ("all", case-insensitive tokens, arrays) work in YAML.
  let targets: ArchetypeMeta['targets'];
  if (parsed.targets !== undefined) {
    if (!Array.isArray(parsed.targets) && typeof parsed.targets !== 'string') {
      throw new EvaluationError(
        `${path}: "targets" must be a string or array of strings`,
      );
    }
    try {
      targets = parseTargets(parsed.targets as string | string[]);
    } catch (err) {
      throw new EvaluationError(
        `${path}: invalid "targets": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    id,
    title,
    minimumFloor,
    answerSetPath: join(dir, ANSWERS_FILE),
    expectedDir: join(dir, EXPECTED_DIR),
    description,
    targets,
  };
}

// ─── answers.yaml ─────────────────────────────────────────────────────────

async function readAnswers(dir: string, archetypeId: string): Promise<Map<string, Answer>> {
  const path = join(dir, ANSWERS_FILE);
  if (!existsSync(path)) {
    throw new EvaluationError(
      `Missing ${ANSWERS_FILE} in archetype directory: ${dir}`,
      archetypeId,
    );
  }
  const raw = await readFile(path, 'utf-8');
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new EvaluationError(
      `Malformed YAML in ${path}: ${err instanceof Error ? err.message : String(err)}`,
      archetypeId,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new EvaluationError(
      `${ANSWERS_FILE} must be a YAML mapping of questionId -> value`,
      archetypeId,
    );
  }

  const map = new Map<string, Answer>();
  for (const [questionId, value] of Object.entries(parsed)) {
    if (!isAnswerValue(value)) {
      throw new EvaluationError(
        `answers.yaml value for "${questionId}" is not a supported type`,
        archetypeId,
      );
    }
    map.set(questionId, { questionId, value, timestamp: FIXED_TIMESTAMP });
  }
  return map;
}

function isAnswerValue(value: unknown): value is string | string[] | number | boolean {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) return value.every((v) => typeof v === 'string');
  return false;
}

// ─── weights.yaml (optional) ──────────────────────────────────────────────

async function readWeightsOverride(dir: string): Promise<Partial<Weights> | undefined> {
  const path = join(dir, WEIGHTS_FILE);
  if (!existsSync(path)) return undefined;
  const raw = await readFile(path, 'utf-8');
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new EvaluationError(
      `Malformed YAML in ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (parsed == null) return undefined;
  if (!isPlainObject(parsed)) {
    throw new EvaluationError(`${WEIGHTS_FILE} must be a YAML mapping: ${path}`);
  }
  return parsed as Partial<Weights>;
}

// ─── golden-meta.yaml (optional) ──────────────────────────────────────────

async function readGoldenMeta(dir: string): Promise<GoldenMeta> {
  const path = join(dir, GOLDEN_META_FILE);
  if (!existsSync(path)) return {};
  const raw = await readFile(path, 'utf-8');
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new EvaluationError(
      `Malformed YAML in ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (parsed == null) return {};
  if (!isPlainObject(parsed)) {
    throw new EvaluationError(`${GOLDEN_META_FILE} must be a YAML mapping: ${path}`);
  }
  return {
    reviewer: typeof parsed.reviewer === 'string' ? parsed.reviewer : undefined,
    reviewedAt: typeof parsed.reviewedAt === 'string' ? parsed.reviewedAt : undefined,
    generatorSha: typeof parsed.generatorSha === 'string' ? parsed.generatorSha : undefined,
    generatorVersion:
      typeof parsed.generatorVersion === 'string' ? parsed.generatorVersion : undefined,
    notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
  };
}

// ─── expected/ tree ───────────────────────────────────────────────────────

async function readExpectedTree(
  expectedRoot: string,
  archetypeId: string,
): Promise<GeneratedFile[]> {
  if (!existsSync(expectedRoot)) {
    throw new EvaluationError(
      `Missing expected/ directory in archetype: ${expectedRoot}`,
      archetypeId,
    );
  }
  const out: GeneratedFile[] = [];
  await walk(expectedRoot, expectedRoot, out);
  // Deterministic ordering so baseline comparisons are stable.
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return out;
}

async function walk(root: string, current: string, out: GeneratedFile[]): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(current, entry.name);
    if (entry.isDirectory()) {
      await walk(root, full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const stats = await stat(full);
    if (stats.size === 0 && entry.name === '.gitkeep') continue; // skip placeholders
    const content = await readFile(full, 'utf-8');
    const relativePath = normalizeRelative(relative(root, full));
    out.push({
      relativePath,
      content,
      description: `golden:${relativePath}`,
    });
  }
}

function normalizeRelative(p: string): string {
  // Golden configs are written on any OS — store with forward slashes so
  // they match the orchestrator's GeneratedFile.relativePath on all platforms.
  return p.split(/[\\/]+/).join('/');
}

// ─── helpers ──────────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requireString(
  obj: Record<string, unknown>,
  key: string,
  path: string,
): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new EvaluationError(`${path} is missing required string field "${key}"`);
  }
  return v;
}

function requireNumber(
  obj: Record<string, unknown>,
  key: string,
  path: string,
): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new EvaluationError(`${path} is missing required number field "${key}"`);
  }
  return v;
}
