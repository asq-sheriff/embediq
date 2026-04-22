import type { Skill } from '../skill.js';
import { educationPack } from '../../domain-packs/built-in/education.js';

/**
 * v1 education skill — packages the Education domain pack as a single
 * skill. Follow-up will decompose into ferpa-core, coppa, state-privacy
 * sub-skills.
 */
export const educationFullSkill: Skill = {
  id: 'education.full',
  name: educationPack.name,
  version: educationPack.version,
  description: educationPack.description,
  tags: ['education', 'ferpa', 'coppa', 'student-privacy', 'compliance'],
  questions: educationPack.questions,
  complianceFrameworks: educationPack.complianceFrameworks,
  priorityCategories: educationPack.priorityCategories,
  dlpPatterns: educationPack.dlpPatterns,
  ruleTemplates: educationPack.ruleTemplates,
  ignorePatterns: educationPack.ignorePatterns,
  validationChecks: educationPack.validationChecks,
};
