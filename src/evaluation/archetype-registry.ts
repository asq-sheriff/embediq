import { Dimension } from '../types/index.js';

/**
 * Maps file paths to the generator that produced them. The generator names
 * mirror the `name` field set by each `ConfigGenerator` implementation —
 * if a generator renames itself, this table must be updated in lockstep.
 * A contract test enforces that every file produced by the orchestrator
 * has exactly one matching pattern here (landing in the harness step).
 */
export const GENERATOR_FILE_PATTERNS: Array<{
  generator: string;
  match: RegExp;
}> = [
  // Claude Code (native target)
  { generator: 'CLAUDE.md', match: /^CLAUDE\.md$/ },
  { generator: 'settings.json', match: /^\.claude\/settings\.json$/ },
  { generator: 'settings.local.json', match: /^\.claude\/settings\.local\.json$/ },
  { generator: 'rules', match: /^\.claude\/rules\// },
  { generator: 'commands', match: /^\.claude\/commands\// },
  { generator: 'agents', match: /^\.claude\/agents\// },
  { generator: 'skills', match: /^\.claude\/skills\// },
  { generator: 'hooks', match: /^\.claude\/hooks\// },
  { generator: 'ignore', match: /^\.claudeignore$/ },
  { generator: 'mcp-json', match: /^\.mcp\.json(?:\.template)?$/ },
  { generator: 'association-map', match: /^\.claude\/association[-_]map\.json$/ },
  { generator: 'document-state', match: /^\.claude\/document[-_]state\.json$/ },
  // Multi-agent output targets
  { generator: 'AGENTS.md', match: /^AGENTS\.md$/ },
  { generator: 'cursor-rules', match: /^\.cursor\/rules\// },
  { generator: 'copilot-instructions', match: /^\.github\/(copilot-instructions\.md|instructions\/)/ },
  { generator: 'GEMINI.md', match: /^GEMINI\.md$/ },
  { generator: 'windsurf-rules', match: /^\.windsurfrules$/ },
];

/**
 * Maps file paths to the wizard Dimension that most strongly drives their
 * generation. A file whose path matches none of these patterns is counted
 * under `UNCATEGORIZED_DIMENSION` and surfaced separately in the report.
 */
export const UNCATEGORIZED_DIMENSION = 'Uncategorized';

export const DIMENSION_FILE_PATTERNS: Array<{
  dimension: string;
  match: RegExp;
}> = [
  {
    dimension: Dimension.REGULATORY_COMPLIANCE,
    match: /^\.claude\/rules\/(hipaa|pci|soc2|gdpr|ferpa|coppa|sox|glba|aml|hitech)/i,
  },
  {
    dimension: Dimension.REGULATORY_COMPLIANCE,
    match: /^\.claude\/hooks\/(dlp|egress|command)-guard/i,
  },
  {
    dimension: Dimension.OPERATIONAL_REALITY,
    match: /^\.claude\/settings(\.local)?\.json$/,
  },
  {
    dimension: Dimension.OPERATIONAL_REALITY,
    match: /^\.claude\/hooks\//,
  },
  {
    dimension: Dimension.STRATEGIC_INTENT,
    match: /^CLAUDE\.md$/,
  },
  {
    dimension: Dimension.STRATEGIC_INTENT,
    match: /^\.claude\/(agents|commands|skills)\//,
  },
  {
    dimension: Dimension.TECHNOLOGY_REQUIREMENTS,
    match: /^\.mcp\.json(?:\.template)?$/,
  },
  {
    dimension: Dimension.TECHNOLOGY_REQUIREMENTS,
    match: /^\.claude\/rules\/(frontend|backend|testing|style|typescript|python)/i,
  },
  {
    dimension: Dimension.OPERATIONAL_REALITY,
    match: /^\.claude\/(association[-_]map|document[-_]state)\.json$/,
  },
  {
    dimension: Dimension.OPERATIONAL_REALITY,
    match: /^\.claudeignore$/,
  },
  // Multi-agent universal files map to Strategic Intent (they describe
  // project-level behavior, analogous to CLAUDE.md).
  { dimension: Dimension.STRATEGIC_INTENT, match: /^AGENTS\.md$/ },
  { dimension: Dimension.STRATEGIC_INTENT, match: /^GEMINI\.md$/ },
  { dimension: Dimension.STRATEGIC_INTENT, match: /^\.windsurfrules$/ },
  { dimension: Dimension.STRATEGIC_INTENT, match: /^\.github\/copilot-instructions\.md$/ },
  // Compliance-tagged scoped rule files (Cursor or Copilot) map to compliance.
  {
    dimension: Dimension.REGULATORY_COMPLIANCE,
    match: /^\.cursor\/rules\/(hipaa|pci|soc2|gdpr|ferpa|coppa|sox|glba|aml|hitech)/i,
  },
  {
    dimension: Dimension.REGULATORY_COMPLIANCE,
    match: /^\.github\/instructions\/(security|hipaa|pci|ferpa|soc2|gdpr)/i,
  },
  // Other scoped rule files fall under Technology Requirements (per-language
  // conventions, testing standards).
  { dimension: Dimension.TECHNOLOGY_REQUIREMENTS, match: /^\.cursor\/rules\// },
  { dimension: Dimension.TECHNOLOGY_REQUIREMENTS, match: /^\.github\/instructions\// },
];

export function getGeneratorForFile(filePath: string): string | undefined {
  for (const row of GENERATOR_FILE_PATTERNS) {
    if (row.match.test(filePath)) return row.generator;
  }
  return undefined;
}

export function getDimensionForFile(filePath: string): string {
  for (const row of DIMENSION_FILE_PATTERNS) {
    if (row.match.test(filePath)) return row.dimension;
  }
  return UNCATEGORIZED_DIMENSION;
}

/**
 * File-type detection by extension/name. Falls back to 'text' for unknown
 * text-like files and 'binary' for known binary extensions. The scorer
 * uses this to route into the right comparator.
 */
export function detectFileType(filePath: string): 'markdown' | 'json' | 'yaml' | 'text' | 'binary' {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.mdx')) return 'markdown';
  // `.json.template` files are JSONC (comments allowed) — route through the
  // text comparator rather than forcing strict JSON parsing.
  if (lower.endsWith('.json.template')) return 'text';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.gif') || lower.endsWith('.zip') || lower.endsWith('.tar') || lower.endsWith('.gz')) {
    return 'binary';
  }
  return 'text';
}
