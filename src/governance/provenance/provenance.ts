import type { SetupConfig, GeneratedFile } from '../../types/index.js';
import { matchHeuristic } from './driver-heuristics.js';
import type {
  ProvenanceTrace,
  ProvenanceFileEntry,
  ProvenanceProfileSummary,
} from './types.js';

const METHODOLOGY_NOTE =
  'Generator attribution is authoritative — recorded by the orchestrator as files '
  + 'flow through the parallel batch. Driver attribution is heuristic in v4.0: '
  + 'the trace infers which profile fields, target selections, and compliance '
  + 'frameworks cause each file from its relative path against a rule catalog '
  + '(src/governance/provenance/driver-heuristics.ts). Per-generator self-declared '
  + 'drivers are reserved for a follow-up iteration. Files with no matched '
  + 'heuristic record an empty drivers array and matchedHeuristic=undefined — '
  + 'usually custom domain pack output, external skills, or post-pass overlays.';

export interface BuildProvenanceInput {
  config: SetupConfig;
  /** Every file emitted in the synthesizer run (the same `allFiles` the orchestrator computed). */
  files: readonly GeneratedFile[];
  /** Authoritative map of `relativePath → generatorName` built by the orchestrator. */
  generatorByPath: ReadonlyMap<string, string>;
  /** Authoritative map of `relativePath → target` built by the orchestrator. */
  targetByPath: ReadonlyMap<string, string>;
  /** Active targets for this run. Surfaced in the document so the trace reads standalone. */
  targets: readonly string[];
  embediqVersion: string;
  /** Injectable for deterministic tests. */
  now?: () => string;
}

/**
 * Pure builder for the provenance trace document. No I/O. Combines
 * authoritative (generator, target) attribution with heuristic
 * (driver) inference per file.
 */
export function buildProvenanceTrace(input: BuildProvenanceInput): ProvenanceTrace {
  const now = input.now ?? (() => new Date().toISOString());
  const timestamp = now();

  const entries: ProvenanceFileEntry[] = input.files.map((file) => {
    const generatorName = input.generatorByPath.get(file.relativePath) ?? 'post-pass';
    const target = input.targetByPath.get(file.relativePath) ?? 'post-pass';
    const matched = matchHeuristic(file.relativePath, input.config);

    return {
      relativePath: file.relativePath,
      generatorName,
      target,
      description: file.description,
      drivers: matched ? matched.drivers : [],
      matchedHeuristic: matched?.rule.name,
    };
  });

  return {
    schemaVersion: 1,
    producer: { name: 'EmbedIQ', version: input.embediqVersion },
    generatedAt: timestamp,
    profileSummary: summarizeProfile(input.config),
    targets: [...input.targets].sort(),
    files: entries,
    methodology: {
      generatorAttribution: 'authoritative',
      driverInference: 'heuristic',
      note: METHODOLOGY_NOTE,
    },
  };
}

export function serializeProvenanceTrace(trace: ProvenanceTrace): string {
  return JSON.stringify(trace, null, 2) + '\n';
}

function summarizeProfile(config: SetupConfig): ProvenanceProfileSummary {
  const p = config.profile;
  return {
    role: p.role,
    industry: p.industry,
    businessDomain: p.businessDomain || undefined,
    technicalProficiency: p.technicalProficiency,
    complianceFrameworks: [...p.complianceFrameworks].sort(),
    languages: [...p.languages].sort(),
    securityConcerns: [...p.securityConcerns].sort(),
    teamSize: p.teamSize,
    localAiEnabled: p.localAiEnabled || undefined,
    routerEnabled: p.routerEnabled || undefined,
  };
}
