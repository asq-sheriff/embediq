import type { Skill } from '../skill.js';
import { healthcarePack } from '../../domain-packs/built-in/healthcare.js';

/**
 * v1 of the healthcare skill packages the entire Healthcare domain pack
 * as a single skill. A follow-up will split this into smaller composable
 * skills (hipaa-core, hitech, healthcare-interop, fda-samd) once the
 * registry is exercised in production. For now the 1:1 mapping
 * preserves byte-identical output for the existing goldens and tests.
 */
export const healthcareFullSkill: Skill = {
  id: 'healthcare.full',
  name: healthcarePack.name,
  version: healthcarePack.version,
  description: healthcarePack.description,
  tags: ['healthcare', 'hipaa', 'hitech', '42cfr-part2', 'phi', 'compliance'],
  questions: healthcarePack.questions,
  complianceFrameworks: healthcarePack.complianceFrameworks,
  priorityCategories: healthcarePack.priorityCategories,
  dlpPatterns: healthcarePack.dlpPatterns,
  ruleTemplates: healthcarePack.ruleTemplates,
  ignorePatterns: healthcarePack.ignorePatterns,
  validationChecks: healthcarePack.validationChecks,
};
