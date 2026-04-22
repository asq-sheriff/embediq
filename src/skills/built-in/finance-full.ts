import type { Skill } from '../skill.js';
import { financePack } from '../../domain-packs/built-in/finance.js';

/**
 * v1 finance skill — packages the Finance domain pack as a single
 * skill. Follow-up will decompose into pci-dss, sox, glba, aml-bsa
 * sub-skills.
 */
export const financeFullSkill: Skill = {
  id: 'finance.full',
  name: financePack.name,
  version: financePack.version,
  description: financePack.description,
  tags: ['finance', 'pci-dss', 'sox', 'glba', 'aml-bsa', 'finra', 'compliance'],
  questions: financePack.questions,
  complianceFrameworks: financePack.complianceFrameworks,
  priorityCategories: financePack.priorityCategories,
  dlpPatterns: financePack.dlpPatterns,
  ruleTemplates: financePack.ruleTemplates,
  ignorePatterns: financePack.ignorePatterns,
  validationChecks: financePack.validationChecks,
};
