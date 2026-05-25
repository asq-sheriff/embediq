import type { Skill } from '../skill.js';
import { nistAiRmfPack } from '../../domain-packs/built-in/nist-ai-rmf.js';

/**
 * v4.0 — Composable skill wrapping the NIST AI RMF domain pack.
 *
 * Same shape as the other "*.full" skills (healthcare.full, finance.full,
 * education.full): one skill = one bundled domain pack. Available via the
 * skill registry for callers that want to compose NIST AI RMF coverage
 * alongside other skills via `composeSkills(...)` rather than via
 * `composeFromPacks(...)`.
 */
export const nistAiRmfSkill: Skill = {
  id: 'nist-ai-rmf.full',
  name: nistAiRmfPack.name,
  version: nistAiRmfPack.version,
  description: nistAiRmfPack.description,
  tags: ['ai-rmf', 'nist', 'ai-governance', 'ai-600-1', 'generative-ai', 'compliance'],
  source: 'built-in',
  questions: nistAiRmfPack.questions,
  complianceFrameworks: nistAiRmfPack.complianceFrameworks,
  priorityCategories: nistAiRmfPack.priorityCategories,
  dlpPatterns: nistAiRmfPack.dlpPatterns,
  ruleTemplates: nistAiRmfPack.ruleTemplates,
  ignorePatterns: nistAiRmfPack.ignorePatterns,
  validationChecks: nistAiRmfPack.validationChecks,
};
