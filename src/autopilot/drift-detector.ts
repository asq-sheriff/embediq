import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Answer, GeneratedFile, SetupConfig } from '../types/index.js';
import { QuestionBank } from '../bank/question-bank.js';
import { ProfileBuilder } from '../engine/profile-builder.js';
import { PriorityAnalyzer } from '../engine/priority-analyzer.js';
import { domainPackRegistry } from '../domain-packs/registry.js';
import { SynthesizerOrchestrator } from '../synthesizer/orchestrator.js';
import { InMemoryEventBus } from '../events/bus.js';
import { parseTargets, TargetFormat } from '../synthesizer/target-format.js';
import { EMBEDIQ_VERSION } from '../synthesizer/generation-header.js';

/**
 * The subtrees EmbedIQ owns inside a target project. Only files under
 * these paths are considered for "extra file" detection — code, tests,
 * and everything outside this list is the user's domain and never
 * flagged as drift.
 */
const MANAGED_TREES: readonly string[] = [
  '.claude',
  '.cursor',
  '.github/copilot-instructions.md',
  '.github/instructions',
  '.claudeignore',
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  '.windsurfrules',
  '.mcp.json.template',
];

export type DriftStatus =
  | 'match'
  | 'missing'
  | 'modified-by-user'
  | 'modified-stale-stamp'
  | 'version-mismatch'
  | 'extra';

export interface DriftEntry {
  relativePath: string;
  status: DriftStatus;
  /** Populated for modified/version-mismatch/extra — content read from disk. */
  onDiskContent?: string;
  /** Populated for missing/modified — the content EmbedIQ would generate. */
  expectedContent?: string;
  /** EmbedIQ version extracted from the on-disk stamp, when present. */
  onDiskVersion?: string;
  /** One-line explanation suitable for the human-readable report. */
  summary: string;
}

export interface DriftReport {
  reportVersion: 1;
  generatedAt: string;
  targetDir: string;
  /** Snapshot of the answer source used to compute "expected" output. */
  answerSource: string;
  /** Currently running EmbedIQ version. */
  embediqVersion: string;
  entries: DriftEntry[];
  totals: {
    match: number;
    missing: number;
    modifiedByUser: number;
    modifiedStaleStamp: number;
    versionMismatch: number;
    extra: number;
  };
  /** True when every managed file matches the expected generation. */
  clean: boolean;
}

export interface DetectDriftOptions {
  /** Directory whose managed subtrees are compared against expected output. */
  targetDir: string;
  /** Answer source — either a path to an answers.yaml file or a ready-made map. */
  answers: Map<string, Answer> | string;
  /** Optional target filter (same semantics as SetupConfig.targets). */
  targets?: TargetFormat[] | string;
  /** Human-readable description of the answer source (embedded in the report). */
  answerSourceLabel?: string;
}

/**
 * Compare a target project's on-disk config against what EmbedIQ would
 * regenerate from the supplied answers. Returns a DriftReport the CLI
 * renders as text/JSON and autopilot (6E-2) uses as the trigger for
 * scheduled PRs.
 */
export async function detectDrift(options: DetectDriftOptions): Promise<DriftReport> {
  if (!existsSync(options.targetDir)) {
    throw new DriftError(`Target directory does not exist: ${options.targetDir}`);
  }

  const answers = typeof options.answers === 'string'
    ? await loadAnswersFromFile(options.answers)
    : options.answers;

  const expected = await regenerate(answers, options.targets);
  const expectedByPath = new Map(expected.map((f) => [f.relativePath, f]));

  const onDisk = await scanManagedFiles(options.targetDir);
  const onDiskByPath = new Map(onDisk.map((f) => [f.relativePath, f]));

  const allPaths = new Set<string>([
    ...expectedByPath.keys(),
    ...onDiskByPath.keys(),
  ]);

  const entries: DriftEntry[] = [];
  for (const path of allPaths) {
    const exp = expectedByPath.get(path);
    const act = onDiskByPath.get(path);
    if (exp && !act) {
      entries.push({
        relativePath: path,
        status: 'missing',
        expectedContent: exp.content,
        summary: `File missing at target — EmbedIQ expected ${path}`,
      });
    } else if (!exp && act) {
      entries.push({
        relativePath: path,
        status: 'extra',
        onDiskContent: act.content,
        summary: `Unexpected file under a managed subtree: ${path}`,
      });
    } else if (exp && act) {
      entries.push(classifyMatch(path, exp, act));
    }
  }

  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const totals = {
    match: entries.filter((e) => e.status === 'match').length,
    missing: entries.filter((e) => e.status === 'missing').length,
    modifiedByUser: entries.filter((e) => e.status === 'modified-by-user').length,
    modifiedStaleStamp: entries.filter((e) => e.status === 'modified-stale-stamp').length,
    versionMismatch: entries.filter((e) => e.status === 'version-mismatch').length,
    extra: entries.filter((e) => e.status === 'extra').length,
  };
  const clean =
    totals.missing === 0
    && totals.modifiedByUser === 0
    && totals.modifiedStaleStamp === 0
    && totals.versionMismatch === 0
    && totals.extra === 0;

  return {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    targetDir: options.targetDir,
    answerSource: options.answerSourceLabel
      ?? (typeof options.answers === 'string' ? options.answers : 'in-memory answer set'),
    embediqVersion: EMBEDIQ_VERSION,
    entries,
    totals,
    clean,
  };
}

export class DriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriftError';
  }
}

// ─── Internals ────────────────────────────────────────────────────────────

function classifyMatch(
  path: string,
  expected: GeneratedFile,
  actual: GeneratedFile,
): DriftEntry {
  // If on-disk content equals expected (after a normalization pass to
  // strip generation stamps), the file is in sync.
  const expNormalized = stripStamp(expected.content);
  const actNormalized = stripStamp(actual.content);

  if (expNormalized === actNormalized) {
    return {
      relativePath: path,
      status: 'match',
      summary: 'In sync with expected generation',
    };
  }

  const onDiskVersion = extractStampVersion(actual.content);
  if (onDiskVersion && onDiskVersion !== EMBEDIQ_VERSION) {
    return {
      relativePath: path,
      status: 'version-mismatch',
      onDiskContent: actual.content,
      expectedContent: expected.content,
      onDiskVersion,
      summary: `On-disk stamp is v${onDiskVersion}; current EmbedIQ is v${EMBEDIQ_VERSION}`,
    };
  }

  if (onDiskVersion) {
    // Stamp present + same version + content differs → EmbedIQ-generated
    // file that was later edited by a human.
    return {
      relativePath: path,
      status: 'modified-stale-stamp',
      onDiskContent: actual.content,
      expectedContent: expected.content,
      onDiskVersion,
      summary: 'File was generated by EmbedIQ but has since been modified',
    };
  }

  return {
    relativePath: path,
    status: 'modified-by-user',
    onDiskContent: actual.content,
    expectedContent: expected.content,
    summary: 'File exists at target but was not generated by EmbedIQ (no stamp)',
  };
}

const STAMP_RE =
  /Generated by EmbedIQ v([\d.]+)\s*\|\s*schema:\d+\s*\|\s*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function stripStamp(content: string): string {
  // Match the generation-header stamp regardless of comment syntax
  // and normalize whitespace so stamp-only diffs don't register as drift.
  return content
    .split('\n')
    .filter((line) => !STAMP_RE.test(line))
    .join('\n')
    .replace(/_embediq\s*:\s*\{[^}]*?\}\s*,?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractStampVersion(content: string): string | undefined {
  const match = STAMP_RE.exec(content);
  if (match) return match[1];
  // JSON stamp is nested — look for a top-level "_embediq" block's version.
  try {
    const parsed = JSON.parse(content) as { _embediq?: { version?: unknown } };
    const v = parsed?._embediq?.version;
    if (typeof v === 'string') return v;
  } catch {
    // not JSON
  }
  return undefined;
}

async function regenerate(
  answers: Map<string, Answer>,
  rawTargets?: TargetFormat[] | string,
): Promise<GeneratedFile[]> {
  const bus = new InMemoryEventBus();
  const profile = new ProfileBuilder(bus).build(answers);
  const domainPack = domainPackRegistry.getForIndustry(profile.industry);
  const bank = new QuestionBank(domainPack);
  profile.priorities = new PriorityAnalyzer().analyze(answers, bank.getAll());

  const targets = rawTargets !== undefined
    ? (Array.isArray(rawTargets) ? rawTargets : parseTargets(rawTargets))
    : undefined;

  const setup: SetupConfig = {
    profile,
    targetDir: '/drift-compare',
    domainPack,
    targets,
  };
  const orchestrator = new SynthesizerOrchestrator(bus);
  return orchestrator.generate(setup);
}

/** Walk the managed subtrees and read every file found. */
async function scanManagedFiles(targetDir: string): Promise<GeneratedFile[]> {
  const out: GeneratedFile[] = [];
  for (const entry of MANAGED_TREES) {
    const abs = join(targetDir, entry);
    if (!existsSync(abs)) continue;
    const info = await stat(abs);
    if (info.isFile()) {
      out.push({
        relativePath: entry,
        content: await readFile(abs, 'utf-8'),
        description: '',
      });
    } else if (info.isDirectory()) {
      await walk(abs, targetDir, out);
    }
  }
  return out;
}

async function walk(dir: string, root: string, out: GeneratedFile[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, root, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const relativePath = relative(root, full).split(sep).join('/');
    out.push({
      relativePath,
      content: await readFile(full, 'utf-8'),
      description: '',
    });
  }
}

async function loadAnswersFromFile(path: string): Promise<Map<string, Answer>> {
  if (!existsSync(path)) {
    throw new DriftError(`Answer source does not exist: ${path}`);
  }
  const raw = await readFile(path, 'utf-8');
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new DriftError(
      `Malformed YAML in ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DriftError(`${path} must be a YAML mapping of questionId → value`);
  }

  const timestamp = new Date('2026-01-01T00:00:00Z');
  const out = new Map<string, Answer>();
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isAnswerValue(value)) {
      throw new DriftError(`Answer for "${id}" is not a supported type (string | string[] | number | boolean)`);
    }
    out.set(id, { questionId: id, value, timestamp });
  }
  return out;
}

function isAnswerValue(value: unknown): value is string | string[] | number | boolean {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) return value.every((v) => typeof v === 'string');
  return false;
}
