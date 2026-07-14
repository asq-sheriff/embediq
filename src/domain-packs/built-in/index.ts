import type { DomainPack } from '../index.js';
import { healthcarePack } from './healthcare.js';
import { financePack } from './finance.js';
import { educationPack } from './education.js';
import { nistAiRmfPack } from './nist-ai-rmf.js';

/**
 * The built-in domain packs, in registration order (first-wins on compose).
 * Single source for both the registry (registration) and the routing-policy
 * builder (eligibility-rule composition), so adding a vertical is one edit here
 * plus the pack itself — never a change to the eligibility lattice core.
 */
export const BUILT_IN_PACKS: readonly DomainPack[] = [
  healthcarePack,
  financePack,
  educationPack,
  nistAiRmfPack,
];

export { healthcarePack, financePack, educationPack, nistAiRmfPack };
