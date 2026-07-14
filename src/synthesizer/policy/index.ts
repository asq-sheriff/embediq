/**
 * Routing policy module — the Policy Decision Point (PDP).
 *
 * Pure, deterministic, industry-neutral. `buildRoutingPolicy(profile)` produces
 * the one versioned artifact that the router, the LLM-gateway config, and the
 * ignore file are each compiled from — so they cannot drift. Wiring into the
 * orchestrator and the enforcement-point generators is a later phase; this
 * module stands alone and is testable on its own.
 */

export * from './types.js';
export { buildRoutingPolicy } from './policy-builder.js';
export {
  NEUTRAL_CORE,
  composeEligibility,
  ruleFor,
  categoryOf,
  eligibleDestinations,
} from './eligibility.js';
export { packEligibility } from './framework-eligibility.js';
export { resolveDestinations, contextWindowFor } from './catalog.js';
