/**
 * The eligibility lattice — the constraint-satisfaction core.
 *
 * Deny-unless-listed. Industry-neutral: the core defines only the universal
 * classes and the fail-closed default; regulated classes (`phi`, `pci`, …) are
 * *contributed* (today by `framework-eligibility.ts`, tomorrow by domain-pack
 * `eligibilityRules` payloads) and composed in. There are no `if (hipaa)`
 * branches here — adding a vertical is data, not code.
 */

import type {
  AllowTarget,
  DataClass,
  Destination,
  EligibilityRule,
} from './types.js';

/**
 * The universal, industry-neutral rules. Always present, always first (so a
 * contributed rule can never loosen a core class — see composeEligibility).
 *
 * `unknown` is local-only: it is the fall-through for any class no rule names,
 * which is what makes an unmodeled data class fail CLOSED rather than open.
 */
export const NEUTRAL_CORE: readonly EligibilityRule[] = [
  { dataClass: 'public',     allow: ['local', 'external-covered', 'external-uncovered'], redactionCanPromote: false, minimizeOnEgress: 'off' },
  { dataClass: 'internal',   allow: ['local', 'external-covered'],                        redactionCanPromote: false, minimizeOnEgress: 'off' },
  { dataClass: 'restricted', allow: ['local'],                                            redactionCanPromote: false, minimizeOnEgress: 'off' },
  { dataClass: 'unknown',    allow: ['local'],                                            redactionCanPromote: false, minimizeOnEgress: 'off' },
];

/**
 * Merge the neutral core with contributed (pack/framework) rules. Core first,
 * first-wins by `dataClass`: the neutral classes are authoritative and a
 * contribution can only ADD new classes, never redefine `public`/`internal`/
 * `restricted`/`unknown`. Safe by default — a pack cannot loosen the core.
 */
export function composeEligibility(contributed: readonly EligibilityRule[]): EligibilityRule[] {
  const byClass = new Map<DataClass, EligibilityRule>();
  for (const rule of [...NEUTRAL_CORE, ...contributed]) {
    if (!byClass.has(rule.dataClass)) byClass.set(rule.dataClass, rule);
  }
  return Array.from(byClass.values());
}

/**
 * The rule for a class, falling through to `unknown` (local-only) when the
 * class is unmodeled — the fail-closed property. If even `unknown` is absent
 * (a malformed lattice), returns a synthetic local-only rule so nothing ever
 * leaks by omission.
 */
export function ruleFor(rules: readonly EligibilityRule[], dataClass: DataClass): EligibilityRule {
  return (
    rules.find((r) => r.dataClass === dataClass) ??
    rules.find((r) => r.dataClass === 'unknown') ?? {
      dataClass: 'unknown',
      allow: ['local'],
      redactionCanPromote: false,
      minimizeOnEgress: 'off',
    }
  );
}

/** Which allow-category a destination falls into for a given rule. */
export function categoryOf(dest: Destination, rule: EligibilityRule): AllowTarget {
  if (dest.locality === 'local') return 'local';
  const required = rule.requiresCoverage ?? [];
  const isCovered =
    required.length > 0
      ? required.every((f) => dest.covered.includes(f))
      : dest.covered.length > 0;
  return isCovered ? 'external-covered' : 'external-uncovered';
}

/**
 * The eligible destination set for a data class: the intersection of what the
 * policy PERMITS (rule.allow) and what actually EXISTS (the catalog). An empty
 * result means the dispatcher must refuse. This is the function every enforcer
 * runs *before* any optimization.
 */
export function eligibleDestinations(
  destinations: readonly Destination[],
  rules: readonly EligibilityRule[],
  dataClass: DataClass,
): Destination[] {
  const rule = ruleFor(rules, dataClass);
  return destinations.filter((d) => rule.allow.includes(categoryOf(d, rule)));
}
