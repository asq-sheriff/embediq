/**
 * The Policy Decision Point builder.
 *
 * Pure. Deterministic. No I/O. Same shape as `src/engine/profile-builder.ts`:
 * the same profile in produces a byte-identical policy out. This determinism
 * is the product — it is what lets the same policy compile to many enforcement
 * points that provably cannot drift.
 */

import type { UserProfile } from '../../types/index.js';
import type { RoutingPolicy } from './types.js';
import { POLICY_SCHEMA_VERSION } from './types.js';
import { composeEligibility } from './eligibility.js';
import { packEligibility } from './framework-eligibility.js';
import { resolveDestinations, contextWindowFor } from './catalog.js';

/** cascade default self-eval threshold (0..10) when confidence escalation is on. */
const DEFAULT_CONFIDENCE_THRESHOLD = 6;

export function buildRoutingPolicy(profile: UserProfile): RoutingPolicy {
  // Regulated-class rules are CONTRIBUTED by the domain packs, not hardcoded in
  // the lattice core: each pack declares its `eligibilityContributions` and this
  // composes the active ones. Adding a vertical is pack data, not a core edit.
  const contributed = packEligibility(profile.complianceFrameworks ?? [], profile.industry);

  return {
    version: POLICY_SCHEMA_VERSION,
    strategy: 'cascade', // v1 default; learned/ensemble reserved behind the interface
    destinations: resolveDestinations(profile),
    eligibility: composeEligibility(contributed),
    confidenceThreshold: profile.confidenceEscalation ? DEFAULT_CONFIDENCE_THRESHOLD : undefined,
    tokenBudgetOverflow: contextWindowFor(profile.defaultLocalModel),
    failMode: 'closed',
  };
}
