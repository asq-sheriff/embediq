import type {
  ComplianceFrameworkDef,
  DlpPatternDef,
  DomainValidationCheck,
  RuleTemplateDef,
} from '../domain-packs/index.js';
import type { Question } from '../types/index.js';

/**
 * A composable skill — the v3.1 evolution of Phase 3's monolithic
 * domain pack. Skills are the lower-level primitive: each one captures
 * a single concern (e.g. HIPAA PHI handling, PCI cardholder data, FERPA
 * student records) and can be mixed and matched independently.
 *
 * Domain packs (Phase 3) continue to exist as pre-composed "skill
 * bundles" — they declare the skills they include and the registry
 * composes them at registration time. New code can also compose
 * skills directly via SkillComposer without going through a pack.
 */
export interface Skill {
  /** Globally unique identifier (recommend dotted path, e.g. `healthcare.hipaa-core`). */
  id: string;
  /** Human-readable label shown in the registry UI. */
  name: string;
  /** SemVer string. Future versions of the registry will use this for compatibility. */
  version: string;
  /** One-paragraph description for discovery. */
  description: string;
  /** Discovery tags (e.g. `hipaa`, `compliance`, `phi`). */
  tags: readonly string[];
  /** Where this skill came from — affects display and trust signaling. */
  source?: 'built-in' | 'external' | 'workspace';

  // ─── Composition ──────────────────────────────────────────────────
  /** Skill IDs that must also be present (composer fails if missing). */
  requires?: readonly string[];
  /** Skill IDs that cannot coexist with this one. */
  conflicts?: readonly string[];

  // ─── Payload (all optional — a skill can be questions-only, etc.) ─
  questions?: readonly Question[];
  complianceFrameworks?: readonly ComplianceFrameworkDef[];
  /** Tag map merged key-wise into the PriorityAnalyzer's categories. */
  priorityCategories?: Record<string, readonly string[]>;
  dlpPatterns?: readonly DlpPatternDef[];
  ruleTemplates?: readonly RuleTemplateDef[];
  ignorePatterns?: readonly string[];
  validationChecks?: readonly DomainValidationCheck[];
}

export class SkillCompositionError extends Error {
  constructor(
    message: string,
    readonly skillId?: string,
  ) {
    super(message);
    this.name = 'SkillCompositionError';
  }
}

/**
 * Public-safe view of a skill — strips function-typed fields
 * (`validationChecks[].check`) so the object can be JSON-serialized
 * for the management API.
 */
export interface SkillSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  tags: readonly string[];
  source: Skill['source'];
  requires: readonly string[];
  conflicts: readonly string[];
  counts: {
    questions: number;
    complianceFrameworks: number;
    priorityCategories: number;
    dlpPatterns: number;
    ruleTemplates: number;
    ignorePatterns: number;
    validationChecks: number;
  };
}

export function summarizeSkill(skill: Skill): SkillSummary {
  return {
    id: skill.id,
    name: skill.name,
    version: skill.version,
    description: skill.description,
    tags: [...skill.tags],
    source: skill.source ?? 'built-in',
    requires: skill.requires ? [...skill.requires] : [],
    conflicts: skill.conflicts ? [...skill.conflicts] : [],
    counts: {
      questions: skill.questions?.length ?? 0,
      complianceFrameworks: skill.complianceFrameworks?.length ?? 0,
      priorityCategories: skill.priorityCategories
        ? Object.keys(skill.priorityCategories).length
        : 0,
      dlpPatterns: skill.dlpPatterns?.length ?? 0,
      ruleTemplates: skill.ruleTemplates?.length ?? 0,
      ignorePatterns: skill.ignorePatterns?.length ?? 0,
      validationChecks: skill.validationChecks?.length ?? 0,
    },
  };
}
