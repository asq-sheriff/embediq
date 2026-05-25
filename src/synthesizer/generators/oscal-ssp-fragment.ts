import {
  buildSspFragment,
  serializeSspFragment,
} from '../../governance/oscal/ssp-fragment.js';
import type { SetupConfig, GeneratedFile } from '../../types/index.js';

/**
 * v4.0 — OSCAL System Security Plan (SSP) FRAGMENT emitter.
 *
 * Post-pass step (not a parallel `ConfigGenerator`) — same pattern as
 * the component-definition generator. Opt-in via
 * `TargetFormat.OSCAL_SSP_FRAGMENT`; existing goldens stay
 * byte-identical.
 *
 * Output: `.embediq/oscal/ssp-fragment.json`. NOT a complete SSP —
 * the document is stamped with `document-completion-status=fragment`
 * and contains placeholder `<<REPLACE: …>>` markers for the
 * operator-owned sections (authorization boundary, system identifiers,
 * authorization status, user populations).
 *
 * Environment overrides (operator-supplied to avoid hand-editing the
 * generated JSON):
 *   - EMBEDIQ_OSCAL_SSP_PROFILE_HREF — stamped into `import-profile.href`
 *   - EMBEDIQ_OSCAL_SSP_SYSTEM_NAME  — stamped into `system-characteristics.system-name`
 *   - EMBEDIQ_OSCAL_SSP_SENSITIVITY  — `fips-199-low` / `moderate` / `high`
 */
export function generateOscalSspFragment(
  config: SetupConfig,
  allFiles: readonly GeneratedFile[],
  embediqVersion: string,
  env: NodeJS.ProcessEnv = process.env,
): GeneratedFile {
  const frameworks = config.domainPack?.complianceFrameworks ?? [];

  const sensitivityRaw = env.EMBEDIQ_OSCAL_SSP_SENSITIVITY;
  const sensitivityLevel = sensitivityRaw === 'fips-199-low'
    || sensitivityRaw === 'fips-199-moderate'
    || sensitivityRaw === 'fips-199-high'
      ? sensitivityRaw
      : undefined;

  const doc = buildSspFragment({
    profile: {
      industry: config.profile.industry,
      role: config.profile.role,
      complianceFrameworks: config.profile.complianceFrameworks,
    },
    frameworks,
    generatedFiles: allFiles,
    embediqVersion,
    profileHref: env.EMBEDIQ_OSCAL_SSP_PROFILE_HREF,
    systemName: env.EMBEDIQ_OSCAL_SSP_SYSTEM_NAME,
    sensitivityLevel,
  });

  return {
    relativePath: '.embediq/oscal/ssp-fragment.json',
    content: serializeSspFragment(doc),
    description: 'OSCAL System Security Plan FRAGMENT — operator must complete before audit submission',
  };
}
