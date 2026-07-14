import {
  buildAuditBundle,
  serializeAuditBundle,
  renderAuditBundleReadme,
} from '../../governance/audit-bundle/index.js';
import type { GenerationContext, GeneratedFile } from '../../types/index.js';

/**
 * Unified audit / evidence bundle emitter — the "govern" layer of
 * enforce → prove → govern.
 *
 * Post-pass step (not a parallel `ConfigGenerator`) — same shape as the v4.0
 * governance outputs. Opt-in via `TargetFormat.AUDIT_BUNDLE`; existing goldens
 * stay byte-identical. Fires LAST so it can index every other output produced in
 * the run (including the provenance trace).
 *
 * Output: `.embediq/audit-bundle/manifest.json` (machine-readable index) +
 * `.embediq/audit-bundle/README.md` (auditor-facing summary). It composes the
 * evidence the run already emitted — routing policy, gateway config, egress
 * guardrail, OSCAL, AIBOM, provenance, DLP hook — records a content hash for
 * each, summarizes the egress posture from the routing policy, and lists the
 * runnable controls (egress eligibility gate, drift, hook enforcement). It
 * enforces and verifies nothing itself; it is the index an auditor receives.
 */
export function generateAuditBundle(
  config: GenerationContext,
  allFiles: readonly GeneratedFile[],
  embediqVersion: string,
): GeneratedFile[] {
  const manifest = buildAuditBundle({
    profile: {
      industry: config.profile.industry,
      role: config.profile.role,
      complianceFrameworks: config.profile.complianceFrameworks,
      routerEnabled: config.profile.routerEnabled,
    },
    policy: config.policy,
    generatedFiles: allFiles.map((f) => ({ relativePath: f.relativePath, content: f.content })),
    producerVersion: embediqVersion,
  });

  return [
    {
      relativePath: '.embediq/audit-bundle/manifest.json',
      content: serializeAuditBundle(manifest),
      description: 'Audit evidence bundle — policy-versioned index of every compliance artifact + runnable controls',
    },
    {
      relativePath: '.embediq/audit-bundle/README.md',
      content: renderAuditBundleReadme(manifest),
      description: 'Audit evidence bundle — auditor-facing summary of the egress posture, artifacts, and controls',
    },
  ];
}
