import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { CheckCategory, Severity, Weights } from './types.js';

export const DEFAULT_WEIGHTS: Weights = {
  byCategory: {
    compliance: 5,
    security: 4,
    structural: 3,
    configuration: 2,
    content: 1.5,
    style: 0.5,
  },
  bySeverity: {
    critical: 3,
    major: 2,
    minor: 1,
  },
  missingFilePenalty: 0,
  extraFilePenalty: 0,
};

/** Deep-merge weights with partial overrides. Scalars overwrite; maps merge key-wise. */
export function mergeWeights(base: Weights, override: Partial<Weights> | undefined): Weights {
  if (!override) return cloneWeights(base);
  return {
    byCategory: mergeCategoryMap(base.byCategory, override.byCategory),
    bySeverity: mergeSeverityMap(base.bySeverity, override.bySeverity),
    byFile: mergeStringMap(base.byFile, override.byFile),
    missingFilePenalty:
      override.missingFilePenalty ?? base.missingFilePenalty,
    extraFilePenalty: override.extraFilePenalty ?? base.extraFilePenalty,
  };
}

/** Parse a YAML weights override file. Returns Partial<Weights> — callers merge. */
export async function loadWeightsFile(path: string): Promise<Partial<Weights>> {
  const raw = await readFile(path, 'utf-8');
  const parsed = parseYaml(raw) as Partial<Weights> | null | undefined;
  return parsed ?? {};
}

function cloneWeights(w: Weights): Weights {
  return {
    byCategory: { ...w.byCategory },
    bySeverity: { ...w.bySeverity },
    byFile: w.byFile ? { ...w.byFile } : undefined,
    missingFilePenalty: w.missingFilePenalty,
    extraFilePenalty: w.extraFilePenalty,
  };
}

function mergeCategoryMap(
  base: Record<CheckCategory, number>,
  override: Partial<Record<CheckCategory, number>> | undefined,
): Record<CheckCategory, number> {
  if (!override) return { ...base };
  return { ...base, ...override };
}

function mergeSeverityMap(
  base: Record<Severity, number>,
  override: Partial<Record<Severity, number>> | undefined,
): Record<Severity, number> {
  if (!override) return { ...base };
  return { ...base, ...override };
}

function mergeStringMap(
  base: Record<string, number> | undefined,
  override: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!base && !override) return undefined;
  return { ...(base ?? {}), ...(override ?? {}) };
}

/** Compute the effective weight of a scored check after per-file/category/severity multiplication. */
export function effectiveWeight(params: {
  weights: Weights;
  category: CheckCategory;
  severity: Severity;
  filePath: string;
}): number {
  const { weights, category, severity, filePath } = params;
  const categoryWeight = weights.byCategory[category];
  const severityWeight = weights.bySeverity[severity];
  const fileMultiplier = weights.byFile?.[filePath] ?? 1;
  return categoryWeight * severityWeight * fileMultiplier;
}
