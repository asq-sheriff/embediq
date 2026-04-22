import type {
  ComplianceFrameworkDef,
  DlpPatternDef,
  DomainValidationCheck,
  RuleTemplateDef,
} from '../domain-packs/index.js';
import type { Question } from '../types/index.js';
import { SkillCompositionError, type Skill } from './skill.js';

/**
 * The result of composing one or more skills — same shape as the
 * payload portion of a DomainPack so the existing generators and
 * validator can consume it without modification.
 */
export interface ComposedSkillPayload {
  questions: Question[];
  complianceFrameworks: ComplianceFrameworkDef[];
  priorityCategories: Record<string, string[]>;
  dlpPatterns: DlpPatternDef[];
  ruleTemplates: RuleTemplateDef[];
  ignorePatterns: string[];
  validationChecks: DomainValidationCheck[];
  /** IDs of the skills that contributed to this payload, in composition order. */
  skillIds: string[];
  /** Per-key conflicts that were resolved by first-wins. Useful for diagnostics. */
  warnings: string[];
}

export interface ComposeOptions {
  /**
   * When true (default), composing two skills with overlapping IDs/names
   * keeps the first occurrence and records a warning. When false, a
   * collision throws SkillCompositionError.
   */
  allowFirstWins?: boolean;
}

/**
 * Merge a list of skills into a single payload. Composition is order-
 * sensitive: skills earlier in the list take precedence when two skills
 * declare overlapping IDs (questions), names (DLP / validation checks),
 * filenames (rule templates), or framework keys.
 */
export function composeSkills(
  skills: readonly Skill[],
  options: ComposeOptions = {},
): ComposedSkillPayload {
  const { allowFirstWins = true } = options;

  validateRequires(skills);
  validateConflicts(skills);

  const out: ComposedSkillPayload = {
    questions: [],
    complianceFrameworks: [],
    priorityCategories: {},
    dlpPatterns: [],
    ruleTemplates: [],
    ignorePatterns: [],
    validationChecks: [],
    skillIds: skills.map((s) => s.id),
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

  for (const skill of skills) {
    for (const q of skill.questions ?? []) {
      if (seen.questionIds.has(q.id)) {
        recordCollision(out, allowFirstWins, `question id "${q.id}"`, skill.id);
        continue;
      }
      seen.questionIds.add(q.id);
      out.questions.push(q);
    }

    for (const f of skill.complianceFrameworks ?? []) {
      if (seen.frameworkKeys.has(f.key)) {
        recordCollision(out, allowFirstWins, `compliance framework "${f.key}"`, skill.id);
        continue;
      }
      seen.frameworkKeys.add(f.key);
      out.complianceFrameworks.push(f);
    }

    if (skill.priorityCategories) {
      for (const [category, tags] of Object.entries(skill.priorityCategories)) {
        const merged = new Set<string>(out.priorityCategories[category] ?? []);
        for (const t of tags) merged.add(t);
        out.priorityCategories[category] = Array.from(merged);
      }
    }

    for (const dlp of skill.dlpPatterns ?? []) {
      if (seen.dlpNames.has(dlp.name)) {
        recordCollision(out, allowFirstWins, `DLP pattern "${dlp.name}"`, skill.id);
        continue;
      }
      seen.dlpNames.add(dlp.name);
      out.dlpPatterns.push(dlp);
    }

    for (const rule of skill.ruleTemplates ?? []) {
      if (seen.ruleFilenames.has(rule.filename)) {
        recordCollision(out, allowFirstWins, `rule template "${rule.filename}"`, skill.id);
        continue;
      }
      seen.ruleFilenames.add(rule.filename);
      out.ruleTemplates.push(rule);
    }

    for (const line of skill.ignorePatterns ?? []) {
      if (seen.ignoreLines.has(line)) continue; // identical lines are silently deduped
      seen.ignoreLines.add(line);
      out.ignorePatterns.push(line);
    }

    for (const check of skill.validationChecks ?? []) {
      if (seen.validationNames.has(check.name)) {
        recordCollision(out, allowFirstWins, `validation check "${check.name}"`, skill.id);
        continue;
      }
      seen.validationNames.add(check.name);
      out.validationChecks.push(check);
    }
  }

  return out;
}

function validateRequires(skills: readonly Skill[]): void {
  const ids = new Set(skills.map((s) => s.id));
  for (const skill of skills) {
    for (const required of skill.requires ?? []) {
      if (!ids.has(required)) {
        throw new SkillCompositionError(
          `Skill "${skill.id}" requires "${required}" but it was not included in the composition`,
          skill.id,
        );
      }
    }
  }
}

function validateConflicts(skills: readonly Skill[]): void {
  const ids = new Set(skills.map((s) => s.id));
  for (const skill of skills) {
    for (const blocked of skill.conflicts ?? []) {
      if (ids.has(blocked)) {
        throw new SkillCompositionError(
          `Skill "${skill.id}" conflicts with "${blocked}" — both cannot be composed together`,
          skill.id,
        );
      }
    }
  }
}

function recordCollision(
  out: ComposedSkillPayload,
  allowFirstWins: boolean,
  what: string,
  skillId: string,
): void {
  const message = `${what} from "${skillId}" collides with an earlier skill`;
  if (!allowFirstWins) {
    throw new SkillCompositionError(message, skillId);
  }
  out.warnings.push(message);
}
