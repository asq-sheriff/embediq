import type {
  ComplianceFrameworkDef,
  DlpPatternDef,
  DomainPack,
  DomainValidationCheck,
  RuleTemplateDef,
} from './index.js';
import type { Question } from '../types/index.js';

/**
 * Result of composing multiple `DomainPack`s. Same payload shape as a
 * `DomainPack` (minus identity meta) so callers can splice it directly
 * into a new `DomainPack` for downstream generators.
 */
export interface ComposedPackPayload {
  questions: Question[];
  complianceFrameworks: ComplianceFrameworkDef[];
  priorityCategories: Record<string, string[]>;
  dlpPatterns: DlpPatternDef[];
  ruleTemplates: RuleTemplateDef[];
  ignorePatterns: string[];
  validationChecks: DomainValidationCheck[];
  /** IDs of the packs that contributed, in composition order. */
  packIds: string[];
  /** Per-key conflicts resolved by first-wins. */
  warnings: string[];
}

export class PackCompositionError extends Error {
  constructor(message: string, readonly packId?: string) {
    super(message);
    this.name = 'PackCompositionError';
  }
}

export interface ComposePackOptions {
  /**
   * When true (default), composing two packs with overlapping IDs/names
   * keeps the first occurrence and records a warning. When false, a
   * collision throws `PackCompositionError`.
   */
  allowFirstWins?: boolean;
}

/**
 * Merge a list of `DomainPack`s into a single payload. Composition is
 * order-sensitive: packs earlier in the list take precedence when two
 * declare overlapping question ids, framework keys, DLP names, rule
 * filenames, or validation-check names. Priority categories merge
 * keys with union semantics on the tag arrays. Ignore patterns are
 * deduplicated.
 *
 * Modeled on `composeSkills` (`src/skills/skill-composer.ts`) — the two
 * functions are siblings, applying the same conflict-resolution policy
 * at different layers of the registry stack.
 */
export function composePacks(
  packs: readonly DomainPack[],
  options: ComposePackOptions = {},
): ComposedPackPayload {
  const { allowFirstWins = true } = options;

  const out: ComposedPackPayload = {
    questions: [],
    complianceFrameworks: [],
    priorityCategories: {},
    dlpPatterns: [],
    ruleTemplates: [],
    ignorePatterns: [],
    validationChecks: [],
    packIds: packs.map((p) => p.id),
    warnings: [],
  };

  const seen = {
    questionIds: new Set<string>(),
    frameworkKeys: new Set<string>(),
    dlpNames: new Set<string>(),
    ruleFilenames: new Set<string>(),
    ignoreLines: new Set<string>(),
    validationNames: new Set<string>(),
  };

  for (const pack of packs) {
    for (const q of pack.questions ?? []) {
      if (seen.questionIds.has(q.id)) {
        recordCollision(out, allowFirstWins, `question id "${q.id}"`, pack.id);
        continue;
      }
      seen.questionIds.add(q.id);
      out.questions.push(q);
    }

    for (const f of pack.complianceFrameworks ?? []) {
      if (seen.frameworkKeys.has(f.key)) {
        recordCollision(out, allowFirstWins, `compliance framework "${f.key}"`, pack.id);
        continue;
      }
      seen.frameworkKeys.add(f.key);
      out.complianceFrameworks.push(f);
    }

    if (pack.priorityCategories) {
      for (const [category, tags] of Object.entries(pack.priorityCategories)) {
        const merged = new Set<string>(out.priorityCategories[category] ?? []);
        for (const t of tags) merged.add(t);
        out.priorityCategories[category] = Array.from(merged);
      }
    }

    for (const d of pack.dlpPatterns ?? []) {
      if (seen.dlpNames.has(d.name)) {
        recordCollision(out, allowFirstWins, `DLP pattern "${d.name}"`, pack.id);
        continue;
      }
      seen.dlpNames.add(d.name);
      out.dlpPatterns.push(d);
    }

    for (const r of pack.ruleTemplates ?? []) {
      if (seen.ruleFilenames.has(r.filename)) {
        recordCollision(out, allowFirstWins, `rule template "${r.filename}"`, pack.id);
        continue;
      }
      seen.ruleFilenames.add(r.filename);
      out.ruleTemplates.push(r);
    }

    for (const line of pack.ignorePatterns ?? []) {
      if (seen.ignoreLines.has(line)) continue;
      seen.ignoreLines.add(line);
      out.ignorePatterns.push(line);
    }

    for (const v of pack.validationChecks ?? []) {
      if (seen.validationNames.has(v.name)) {
        recordCollision(out, allowFirstWins, `validation check "${v.name}"`, pack.id);
        continue;
      }
      seen.validationNames.add(v.name);
      out.validationChecks.push(v);
    }
  }

  return out;
}

function recordCollision(
  out: ComposedPackPayload,
  allowFirstWins: boolean,
  what: string,
  packId: string,
): void {
  const msg = `Collision on ${what} from pack "${packId}" (kept earlier value)`;
  if (!allowFirstWins) {
    throw new PackCompositionError(msg, packId);
  }
  out.warnings.push(msg);
}
