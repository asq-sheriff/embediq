import {
  buildProvenanceTrace,
  serializeProvenanceTrace,
} from '../../governance/provenance/index.js';
import type { SetupConfig, GeneratedFile } from '../../types/index.js';

/**
 * v4.0 — Provenance Trace emitter.
 *
 * Post-pass step (not a parallel `ConfigGenerator`). Runs LAST in the
 * post-pass chain so its manifest can include every other governance
 * output (component-def SSP fragment AIBOM) alongside the
 * regular generator output.
 *
 * Output: `.embediq/provenance/manifest.json`.
 *
 * The trace combines:
 *   - **Authoritative generator attribution** — passed in via the
 *     `generatorByPath` / `targetByPath` maps the orchestrator
 *     populates as files flow through the parallel batch.
 *   - **Heuristic driver inference** — applied inside the builder via
 *     the `driver-heuristics` rule catalog. Each rule matches a file
 *     path pattern and emits the profile fields / target selections /
 *     compliance frameworks that cause the generator to produce the
 *     file.
 */
export function generateProvenanceTrace(
  config: SetupConfig,
  allFiles: readonly GeneratedFile[],
  generatorByPath: ReadonlyMap<string, string>,
  targetByPath: ReadonlyMap<string, string>,
  targets: readonly string[],
  embediqVersion: string,
): GeneratedFile {
  const trace = buildProvenanceTrace({
    config,
    files: allFiles,
    generatorByPath,
    targetByPath,
    targets,
    embediqVersion,
  });

  return {
    relativePath: '.embediq/provenance/manifest.json',
    content: serializeProvenanceTrace(trace),
    description: 'Provenance trace — per-file authoritative generator attribution + heuristic driver inference',
  };
}
