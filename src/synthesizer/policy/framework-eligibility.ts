/**
 * Pack-contributed eligibility composition.
 *
 * The regulated-class rules (phi, pci, …) no longer live in the policy core —
 * each domain pack declares its own `eligibilityContributions` (see
 * `DomainPack`). This resolver collects them from the built-in packs for a given
 * profile, so adding a vertical's egress policy is pack data, not an edit here.
 *
 * A contribution is active when its `framework` is explicitly selected OR the
 * profile's `industry` is one the contribution declares as implying it. Pure and
 * order-stable: it iterates `BUILT_IN_PACKS` in registration order and each
 * pack's contributions in declared order, so the same profile yields a
 * byte-identical rule list.
 */

import type { EligibilityRule } from './types.js';
import { BUILT_IN_PACKS } from '../../domain-packs/built-in/index.js';

export function packEligibility(frameworks: readonly string[], industry: string): EligibilityRule[] {
  const out: EligibilityRule[] = [];
  for (const pack of BUILT_IN_PACKS) {
    for (const contribution of pack.eligibilityContributions ?? []) {
      const active =
        frameworks.includes(contribution.framework) ||
        (contribution.industries?.includes(industry) ?? false);
      if (active) out.push(...contribution.rules);
    }
  }
  return out;
}
