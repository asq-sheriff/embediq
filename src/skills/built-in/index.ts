import type { Skill } from '../skill.js';
import { healthcareFullSkill } from './healthcare-full.js';
import { financeFullSkill } from './finance-full.js';
import { educationFullSkill } from './education-full.js';

/**
 * Built-in skills registered at module load by `SkillRegistry`. Adding
 * a new skill: drop a file under `src/skills/built-in/`, import it
 * here, push it onto the array. Order is preserved by the registry's
 * `list()` (it sorts by id).
 */
export const BUILT_IN_SKILLS: readonly Skill[] = [
  healthcareFullSkill,
  financeFullSkill,
  educationFullSkill,
];
