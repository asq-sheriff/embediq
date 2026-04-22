export {
  ComplianceAdapterError,
  ComplianceAdapterRegistry,
  signingSecretEnvVar,
  type ComplianceAdapterInput,
  type ComplianceEvent,
  type ComplianceEventAdapter,
  type SignatureVerifyInput,
} from './compliance-adapter.js';
export { hmacSha256Hex, timingSafeCompare } from './hmac.js';

export { DrataAdapter, drataAdapter } from './drata-adapter.js';
export { VantaAdapter, vantaAdapter } from './vanta-adapter.js';
export { GenericComplianceAdapter, genericComplianceAdapter } from './generic-adapter.js';

import { ComplianceAdapterRegistry } from './compliance-adapter.js';
import { drataAdapter } from './drata-adapter.js';
import { vantaAdapter } from './vanta-adapter.js';
import { genericComplianceAdapter } from './generic-adapter.js';

/**
 * Default registry populated with the three built-in adapters. Web
 * servers can register additional adapters by calling `register()` on
 * this instance or by constructing their own registry and injecting it.
 */
export const defaultComplianceRegistry = new ComplianceAdapterRegistry();
defaultComplianceRegistry.register(drataAdapter);
defaultComplianceRegistry.register(vantaAdapter);
defaultComplianceRegistry.register(genericComplianceAdapter);
