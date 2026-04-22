import { readFile, readdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
  ComplianceFrameworkDef,
  DlpPatternDef,
  RuleTemplateDef,
} from '../domain-packs/index.js';
import type { Skill } from './skill.js';

/**
 * Loader for SKILL.md / SKILL.yaml directories. The format is:
 *
 *   <dir>/SKILL.md          required — frontmatter + description body
 *   <dir>/dlp.yaml          optional — DLP patterns array
 *   <dir>/compliance.yaml   optional — frameworks + priority categories
 *   <dir>/rules/*.md        optional — each file becomes a RuleTemplateDef
 *   <dir>/ignore.txt        optional — newline-separated ignore patterns
 *
 * Validation checks are not loadable from SKILL.md because they require
 * function bodies — those skills must ship as TS modules.
 */
export class SkillMdParseError extends Error {
  constructor(message: string, readonly path: string) {
    super(`${message}: ${path}`);
    this.name = 'SkillMdParseError';
  }
}

interface SkillFrontmatter {
  id?: unknown;
  name?: unknown;
  version?: unknown;
  description?: unknown;
  tags?: unknown;
  requires?: unknown;
  conflicts?: unknown;
}

/**
 * Read a directory and return a Skill, or throw SkillMdParseError.
 * The directory is treated as external (skill.source === 'external')
 * unless overridden by the caller.
 */
export async function loadSkillFromDirectory(
  dir: string,
  source: Skill['source'] = 'external',
): Promise<Skill> {
  const skillMdPath = join(dir, 'SKILL.md');
  if (!existsSync(skillMdPath)) {
    throw new SkillMdParseError('SKILL.md not found', skillMdPath);
  }

  const raw = await readFile(skillMdPath, 'utf-8');
  const { frontmatter, body } = splitFrontmatter(raw, skillMdPath);
  const id = requireString(frontmatter, 'id', skillMdPath);
  const name = requireString(frontmatter, 'name', skillMdPath);
  const version = requireString(frontmatter, 'version', skillMdPath);
  const description = (typeof frontmatter.description === 'string'
    ? frontmatter.description
    : body.trim()).trim();
  const tags = stringArray(frontmatter.tags, 'tags', skillMdPath);
  const requires = optionalStringArray(frontmatter.requires, 'requires', skillMdPath);
  const conflicts = optionalStringArray(frontmatter.conflicts, 'conflicts', skillMdPath);

  const dlpPatterns = await readOptionalYaml<DlpPatternDef[]>(
    join(dir, 'dlp.yaml'),
    'dlp.yaml',
  );

  const complianceParsed = await readOptionalYaml<{
    frameworks?: ComplianceFrameworkDef[];
    priorityCategories?: Record<string, string[]>;
  }>(join(dir, 'compliance.yaml'), 'compliance.yaml');

  const ruleTemplates = await readRulesDirectory(join(dir, 'rules'));
  const ignorePatterns = await readIgnoreFile(join(dir, 'ignore.txt'));

  return {
    id,
    name,
    version,
    description: description || `Skill ${id}`,
    tags,
    source,
    requires,
    conflicts,
    dlpPatterns,
    complianceFrameworks: complianceParsed?.frameworks,
    priorityCategories: complianceParsed?.priorityCategories,
    ruleTemplates,
    ignorePatterns,
  };
}

/**
 * Walk a directory and return all skills found (each subdirectory
 * with a SKILL.md is one skill).
 */
export async function discoverSkillDirectories(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(root, entry.name);
    if (existsSync(join(candidate, 'SKILL.md'))) out.push(candidate);
  }
  return out.sort();
}

// ─── helpers ──────────────────────────────────────────────────────────────

function splitFrontmatter(raw: string, path: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} {
  if (!raw.startsWith('---')) {
    throw new SkillMdParseError('SKILL.md must begin with `---` YAML frontmatter', path);
  }
  const end = raw.indexOf('\n---', 3);
  if (end < 0) {
    throw new SkillMdParseError('SKILL.md frontmatter is missing closing `---`', path);
  }
  const frontmatterRaw = raw.slice(3, end).trim();
  let parsed: unknown;
  try {
    parsed = parseYaml(frontmatterRaw);
  } catch (err) {
    throw new SkillMdParseError(
      `Malformed YAML frontmatter: ${err instanceof Error ? err.message : String(err)}`,
      path,
    );
  }
  if (parsed != null && typeof parsed !== 'object') {
    throw new SkillMdParseError('SKILL.md frontmatter must be a YAML mapping', path);
  }
  return {
    frontmatter: (parsed ?? {}) as SkillFrontmatter,
    body: raw.slice(end + 4).replace(/^\s+/, ''),
  };
}

function requireString(obj: SkillFrontmatter, key: keyof SkillFrontmatter, path: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new SkillMdParseError(`SKILL.md is missing required string field "${String(key)}"`, path);
  }
  return v;
}

function stringArray(value: unknown, key: string, path: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new SkillMdParseError(`SKILL.md "${key}" must be an array of strings`, path);
  }
  return value as string[];
}

function optionalStringArray(value: unknown, key: string, path: string): string[] | undefined {
  if (value === undefined) return undefined;
  return stringArray(value, key, path);
}

async function readOptionalYaml<T>(path: string, label: string): Promise<T | undefined> {
  if (!existsSync(path)) return undefined;
  const raw = await readFile(path, 'utf-8');
  try {
    return (parseYaml(raw) ?? undefined) as T | undefined;
  } catch (err) {
    throw new SkillMdParseError(
      `Malformed YAML in ${label}: ${err instanceof Error ? err.message : String(err)}`,
      path,
    );
  }
}

async function readRulesDirectory(dir: string): Promise<RuleTemplateDef[] | undefined> {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return undefined;
  const entries = await readdir(dir, { withFileTypes: true });
  const out: RuleTemplateDef[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const path = join(dir, entry.name);
    const content = await readFile(path, 'utf-8');
    out.push({
      filename: entry.name,
      pathScope: [],
      content,
    });
  }
  return out.length > 0 ? out : undefined;
}

async function readIgnoreFile(path: string): Promise<string[] | undefined> {
  if (!existsSync(path)) return undefined;
  const raw = await readFile(path, 'utf-8');
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.length > 0 ? lines : undefined;
}
