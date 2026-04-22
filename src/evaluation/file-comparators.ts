import { createHash } from 'node:crypto';
import { detectFileType, getDimensionForFile } from './archetype-registry.js';
import { isPlainObject } from './normalizers.js';
import { effectiveWeight } from './weights.js';
import type {
  CheckCategory,
  FileType,
  ScoredCheck,
  Severity,
  Weights,
} from './types.js';

export interface ComparatorArgs {
  filePath: string;
  expected: unknown;
  actual: unknown;
  weights: Weights;
}

export interface Comparator {
  readonly fileType: FileType;
  compare(args: ComparatorArgs): ScoredCheck[];
}

export function getComparatorFor(filePath: string): Comparator {
  const type = detectFileType(filePath);
  switch (type) {
    case 'markdown':
      return markdownComparator;
    case 'json':
      return jsonComparator;
    case 'yaml':
      return yamlComparator;
    case 'binary':
      return binaryComparator;
    case 'text':
    default:
      return textComparator;
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────

function makeCheck(params: {
  id: string;
  category: CheckCategory;
  severity: Severity;
  filePath: string;
  description: string;
  score: number;
  weights: Weights;
  details?: ScoredCheck['details'];
}): ScoredCheck {
  return {
    id: params.id,
    category: params.category,
    severity: params.severity,
    filePath: params.filePath,
    description: params.description,
    score: clamp01(params.score),
    weight: effectiveWeight({
      weights: params.weights,
      category: params.category,
      severity: params.severity,
      filePath: params.filePath,
    }),
    details: params.details,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersect = 0;
  for (const item of a) if (b.has(item)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 1 : intersect / union;
}

function nonBlankLineSet(text: string): Set<string> {
  return new Set(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );
}

// ─── Markdown ─────────────────────────────────────────────────────────────

const HEADING_RE = /^(#{1,6})\s+(.+)$/;

function extractHeadings(md: string): string[] {
  const headings: string[] = [];
  for (const line of md.split('\n')) {
    const m = HEADING_RE.exec(line.trim());
    if (m) headings.push(`${m[1].length}:${m[2].trim()}`);
  }
  return headings;
}

export const markdownComparator: Comparator = {
  fileType: 'markdown',
  compare({ filePath, expected, actual, weights }) {
    const exp = typeof expected === 'string' ? expected : '';
    const act = typeof actual === 'string' ? actual : '';

    // Check 1 — required sections present
    const expectedHeadings = extractHeadings(exp);
    const actualHeadings = new Set(extractHeadings(act));
    const matchedHeadings = expectedHeadings.filter((h) => actualHeadings.has(h)).length;
    const structuralScore =
      expectedHeadings.length === 0 ? 1 : matchedHeadings / expectedHeadings.length;

    // Check 2 — line-set content similarity
    const contentScore = jaccardSimilarity(nonBlankLineSet(exp), nonBlankLineSet(act));

    // Check 3 — heading order preserved (style)
    const expectedOrder = expectedHeadings.filter((h) => actualHeadings.has(h));
    const actualOrder = extractHeadings(act).filter((h) => expectedHeadings.includes(h));
    const orderScore = expectedOrder.length === 0
      ? 1
      : expectedOrder.every((h, i) => actualOrder[i] === h)
        ? 1
        : 0.5;

    return [
      makeCheck({
        id: `${filePath}#structural.sections`,
        category: 'structural',
        severity: 'critical',
        filePath,
        description: `Expected headings present (${matchedHeadings}/${expectedHeadings.length})`,
        score: structuralScore,
        weights,
        details: expectedHeadings.length === 0
          ? undefined
          : {
              expected: expectedHeadings.join('\n'),
              actual: Array.from(actualHeadings).join('\n'),
            },
      }),
      makeCheck({
        id: `${filePath}#content.jaccard`,
        category: 'content',
        severity: 'major',
        filePath,
        description: 'Line-set Jaccard similarity',
        score: contentScore,
        weights,
      }),
      makeCheck({
        id: `${filePath}#style.heading-order`,
        category: 'style',
        severity: 'minor',
        filePath,
        description: 'Heading order preserved',
        score: orderScore,
        weights,
      }),
    ];
  },
};

// ─── JSON / YAML (structural walk) ────────────────────────────────────────

function categoryForJsonPath(path: string): CheckCategory {
  const head = path.split('.')[0];
  if (head === 'permissions' || head === 'hooks') return 'security';
  return 'configuration';
}

function severityForJsonCheck(kind: 'missing' | 'mismatch' | 'match'): Severity {
  if (kind === 'missing') return 'critical';
  if (kind === 'mismatch') return 'major';
  return 'minor';
}

function scoreForJsonCheck(kind: 'missing' | 'mismatch' | 'match'): number {
  if (kind === 'missing') return 0;
  if (kind === 'mismatch') return 0.5;
  return 1;
}

function walkJson(
  expected: unknown,
  actual: unknown,
  keyPath: string,
  filePath: string,
  weights: Weights,
  out: ScoredCheck[],
): void {
  if (isPlainObject(expected)) {
    if (!isPlainObject(actual)) {
      out.push(
        makeCheck({
          id: `${filePath}#json.${keyPath || '<root>'}`,
          category: categoryForJsonPath(keyPath),
          severity: 'critical',
          filePath,
          description: `Expected object at "${keyPath || '<root>'}", got ${describe(actual)}`,
          score: 0,
          weights,
        }),
      );
      return;
    }
    for (const [key, expValue] of Object.entries(expected)) {
      const path = keyPath ? `${keyPath}.${key}` : key;
      if (!(key in actual)) {
        out.push(
          makeCheck({
            id: `${filePath}#json.${path}`,
            category: categoryForJsonPath(path),
            severity: severityForJsonCheck('missing'),
            filePath,
            description: `Missing key "${path}"`,
            score: scoreForJsonCheck('missing'),
            weights,
          }),
        );
        continue;
      }
      walkJson(expValue, actual[key], path, filePath, weights, out);
    }
    return;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      out.push(
        makeCheck({
          id: `${filePath}#json.${keyPath || '<root>'}`,
          category: categoryForJsonPath(keyPath),
          severity: 'major',
          filePath,
          description: `Expected array at "${keyPath || '<root>'}", got ${describe(actual)}`,
          score: 0,
          weights,
        }),
      );
      return;
    }
    // Unordered set membership for top-level permission-like arrays; ordered for all others.
    const unordered = isUnorderedArrayPath(keyPath);
    if (unordered) {
      const expSet = new Set(expected.map((v) => JSON.stringify(v)));
      const actSet = new Set(actual.map((v) => JSON.stringify(v)));
      const similarity = jaccardSimilarity(expSet, actSet);
      out.push(
        makeCheck({
          id: `${filePath}#json.${keyPath}`,
          category: categoryForJsonPath(keyPath),
          severity: 'major',
          filePath,
          description: `Array "${keyPath}" set membership (${similarity.toFixed(2)})`,
          score: similarity,
          weights,
        }),
      );
      return;
    }
    // Ordered compare — each index is its own leaf check
    const maxLen = Math.max(expected.length, actual.length);
    for (let i = 0; i < maxLen; i++) {
      const path = `${keyPath}[${i}]`;
      if (i >= actual.length) {
        out.push(
          makeCheck({
            id: `${filePath}#json.${path}`,
            category: categoryForJsonPath(keyPath),
            severity: severityForJsonCheck('missing'),
            filePath,
            description: `Missing array element at ${path}`,
            score: scoreForJsonCheck('missing'),
            weights,
          }),
        );
        continue;
      }
      if (i >= expected.length) continue; // extra elements not penalized by default
      walkJson(expected[i], actual[i], path, filePath, weights, out);
    }
    return;
  }

  // Leaf primitive
  const kind: 'mismatch' | 'match' =
    deepEqualPrimitive(expected, actual) ? 'match' : 'mismatch';
  out.push(
    makeCheck({
      id: `${filePath}#json.${keyPath || '<root>'}`,
      category: categoryForJsonPath(keyPath),
      severity: severityForJsonCheck(kind),
      filePath,
      description:
        kind === 'match'
          ? `Value match at "${keyPath || '<root>'}"`
          : `Value mismatch at "${keyPath || '<root>'}"`,
      score: scoreForJsonCheck(kind),
      weights,
      details:
        kind === 'mismatch'
          ? {
              expected: JSON.stringify(expected),
              actual: JSON.stringify(actual),
            }
          : undefined,
    }),
  );
}

function isUnorderedArrayPath(path: string): boolean {
  return (
    path === 'permissions.allow' ||
    path === 'permissions.deny' ||
    path === 'permissions.ask'
  );
}

function deepEqualPrimitive(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  return false;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export const jsonComparator: Comparator = {
  fileType: 'json',
  compare({ filePath, expected, actual, weights }) {
    const out: ScoredCheck[] = [];
    walkJson(expected, actual, '', filePath, weights, out);
    if (out.length === 0) {
      // Both empty/primitive and equal — emit a pass check so the file is scored.
      out.push(
        makeCheck({
          id: `${filePath}#json.<root>`,
          category: 'configuration',
          severity: 'minor',
          filePath,
          description: 'Empty or primitive JSON payload matches',
          score: 1,
          weights,
        }),
      );
    }
    return out;
  },
};

export const yamlComparator: Comparator = {
  fileType: 'yaml',
  compare(args) {
    // Same structural walk as JSON — parsed payloads are plain objects.
    return jsonComparator.compare(args);
  },
};

// ─── Text (hooks, shell, misc) ────────────────────────────────────────────

export const textComparator: Comparator = {
  fileType: 'text',
  compare({ filePath, expected, actual, weights }) {
    const exp = typeof expected === 'string' ? expected : '';
    const act = typeof actual === 'string' ? actual : '';
    const score = jaccardSimilarity(nonBlankLineSet(exp), nonBlankLineSet(act));
    return [
      makeCheck({
        id: `${filePath}#content.jaccard`,
        category: 'content',
        severity: 'major',
        filePath,
        description: 'Line-set Jaccard similarity',
        score,
        weights,
      }),
    ];
  },
};

// ─── Binary ───────────────────────────────────────────────────────────────

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export const binaryComparator: Comparator = {
  fileType: 'binary',
  compare({ filePath, expected, actual, weights }) {
    const exp = typeof expected === 'string' ? expected : '';
    const act = typeof actual === 'string' ? actual : '';
    const score = sha256(exp) === sha256(act) ? 1 : 0;
    return [
      makeCheck({
        id: `${filePath}#content.hash`,
        category: 'content',
        severity: 'critical',
        filePath,
        description: 'Byte-for-byte hash equality',
        score,
        weights,
      }),
    ];
  },
};

// Re-export for downstream callers building dimension aggregation.
export { getDimensionForFile };
