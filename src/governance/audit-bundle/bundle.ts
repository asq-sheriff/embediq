import { createHash } from 'node:crypto';
import type { RoutingPolicy } from '../../synthesizer/policy/types.js';
import type {
  AuditBundleManifest,
  BuildAuditBundleInput,
  BundleArtifact,
  BundleControl,
  EgressPosture,
} from './types.js';

/** Known evidence artifacts, in the order they appear in the bundle. */
const KNOWN_ARTIFACTS: ReadonlyArray<{ kind: BundleArtifact['kind']; label: string; path: string }> = [
  { kind: 'routing-policy', label: 'Routing policy (the PDP) — eligibility lattice + destination catalog', path: 'router/routing-policy.yaml' },
  { kind: 'litellm-gateway', label: 'LiteLLM gateway config — model_list holds only eligible destinations', path: 'litellm/config.yaml' },
  { kind: 'egress-guardrail', label: 'Gateway PHI/PII egress guardrail — DLP rendered from the compliance pack', path: 'litellm/guardrails/embediq_phi_egress.py' },
  { kind: 'oscal-component', label: 'OSCAL Component Definition — the frameworks this harness addresses', path: '.embediq/oscal/component-definition.json' },
  { kind: 'oscal-ssp-fragment', label: 'OSCAL SSP fragment — control-implementation section', path: '.embediq/oscal/ssp-fragment.json' },
  { kind: 'cyclonedx-aibom', label: 'CycloneDX-ML AIBOM — every model/agent/service the harness invokes, with BAA coverage', path: '.embediq/cyclonedx/aibom.json' },
  { kind: 'provenance', label: 'Per-file provenance trace — why each file was emitted', path: '.embediq/provenance/manifest.json' },
];

function sha256hex(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** Distill the compliance-relevant egress posture from the routing policy. */
export function egressPostureOf(policy: RoutingPolicy | undefined): EgressPosture {
  if (!policy) {
    return { airgapped: false, regulatedClasses: [], coveredFrameworks: [], destinations: [] };
  }
  const regulatedClasses = policy.eligibility
    .filter((r) => (r.requiresCoverage?.length ?? 0) > 0)
    .map((r) => String(r.dataClass));

  const externalCovered = policy.destinations.filter((d) => d.locality === 'external' && d.covered.length > 0);
  const coveredFrameworks = [...new Set(externalCovered.flatMap((d) => d.covered))].sort();

  // Air-gapped: the policy governs at least one regulated class, and no external
  // destination is covered for anything — so route absence is the gate.
  const airgapped = regulatedClasses.length > 0 && externalCovered.length === 0;

  return {
    airgapped,
    regulatedClasses,
    coveredFrameworks,
    destinations: policy.destinations.map((d) => ({
      id: d.id,
      locality: d.locality,
      provider: d.provider,
      covered: d.covered,
    })),
  };
}

/** Find the emitted PreToolUse DLP hook, if any (path varies by profile). */
function findDlpHook(
  files: ReadonlyArray<{ relativePath: string; content: string }>,
): { relativePath: string; content: string } | undefined {
  return files.find(
    (f) =>
      f.relativePath.startsWith('.claude/hooks/') &&
      f.relativePath.endsWith('.py') &&
      /PreToolUse|redact|BLOCK|dlp/i.test(f.content),
  );
}

/**
 * Pure builder: composes the run's evidence into one policy-versioned manifest.
 * Composes only — it enforces and verifies nothing itself.
 */
export function buildAuditBundle(input: BuildAuditBundleInput): AuditBundleManifest {
  const now = input.now ?? (() => new Date().toISOString());
  const hash = input.sha256 ?? sha256hex;
  const byPath = new Map(input.generatedFiles.map((f) => [f.relativePath, f.content]));

  const artifacts: BundleArtifact[] = KNOWN_ARTIFACTS.map((a) => {
    const content = byPath.get(a.path);
    return content !== undefined
      ? { ...a, present: true, sha256: hash(content) }
      : { ...a, present: false };
  });

  // The DLP hook path is profile-dependent, so resolve it by content.
  const hook = findDlpHook(input.generatedFiles);
  if (hook) {
    artifacts.push({
      kind: 'dlp-hook',
      label: 'PreToolUse DLP hook — blocks a PHI/PII-bearing write at the source (exit 2)',
      path: hook.relativePath,
      present: true,
      sha256: hash(hook.content),
    });
  }

  const posture = egressPostureOf(input.policy);

  const controls: BundleControl[] = [];
  // Egress eligibility — only meaningful when the router/policy governs egress.
  if (input.profile.routerEnabled || posture.regulatedClasses.length > 0) {
    controls.push({
      id: 'egress-eligibility',
      type: 'preventive+detective',
      proves: 'No regulated prompt can reach a destination its class forbids — even when the classifier misses it.',
      verify: 'npm run evaluate -- --mode router-eligibility',
    });
  }
  // Drift — always applicable; the detective backstop for hand-edits.
  controls.push({
    id: 'drift',
    type: 'detective',
    proves: 'The generated controls on disk still match what EmbedIQ would regenerate — no silent hand-edit.',
    verify: 'npm run drift -- --target <dir> --archetype <id>',
  });
  // DLP hook — only when the hook is present in this harness.
  if (hook) {
    controls.push({
      id: 'dlp-hook',
      type: 'preventive',
      proves: 'The PreToolUse hook refuses a write containing a regulated identifier (exit 2 = BLOCK).',
      verify: 'npm test -- hook-enforcement',
    });
  }

  return {
    bundleVersion: 1,
    producer: 'EmbedIQ',
    producerVersion: input.producerVersion,
    generatedAt: now(),
    profile: {
      industry: input.profile.industry,
      role: input.profile.role,
      complianceFrameworks: [...input.profile.complianceFrameworks],
    },
    policy: {
      version: input.policy?.version ?? 'none',
      strategy: input.policy?.strategy ?? 'none',
      failMode: input.policy?.failMode ?? 'none',
      egressPosture: posture,
    },
    artifacts,
    controls,
  };
}

export function serializeAuditBundle(manifest: AuditBundleManifest): string {
  return JSON.stringify(manifest, null, 2) + '\n';
}

/** Human/auditor-facing companion to the manifest. */
export function renderAuditBundleReadme(manifest: AuditBundleManifest): string {
  const p = manifest.policy.egressPosture;
  const lines: string[] = [];
  lines.push(`# Audit Evidence Bundle`);
  lines.push('');
  lines.push(
    `Generated by EmbedIQ ${manifest.producerVersion} for the ` +
      `**${manifest.profile.industry} / ${manifest.profile.role}** profile. This bundle ` +
      `indexes the compliance evidence produced in one generation run and the controls ` +
      `you can run to re-verify it. EmbedIQ *authors and indexes* this evidence; it does ` +
      `not store it or act as your auditor.`,
  );
  lines.push('');
  lines.push(`**Routing policy:** version ${manifest.policy.version}, strategy ` +
    `\`${manifest.policy.strategy}\`, fail-mode \`${manifest.policy.failMode}\`.`);
  lines.push('');

  lines.push(`## Egress posture`);
  lines.push('');
  if (p.regulatedClasses.length === 0) {
    lines.push(`No regulated data classes are governed by this policy.`);
  } else {
    lines.push(`Regulated classes: ${p.regulatedClasses.map((c) => `\`${c}\``).join(', ')}.`);
    if (p.airgapped) {
      lines.push('');
      lines.push(
        `> **Air-gapped by construction.** No external destination is BAA/DPA-covered, so ` +
          `the gateway has no route to send regulated data off-host. This is provable by reading ` +
          `\`litellm/config.yaml\` — the \`model_list\` contains no external entry. Route absence ` +
          `is the gate; there is no filter to trust.`,
      );
    } else {
      lines.push(`Covered frameworks (a BAA/DPA is attested): ` +
        `${p.coveredFrameworks.map((f) => `\`${f}\``).join(', ')}. Regulated data may reach a ` +
        `covered destination only — an uncovered provider has no route.`);
    }
  }
  lines.push('');
  if (p.destinations.length > 0) {
    lines.push(`| Destination | Locality | Covered for |`);
    lines.push(`|---|---|---|`);
    for (const d of p.destinations) {
      lines.push(`| \`${d.id}\` | ${d.locality} | ${d.covered.length > 0 ? d.covered.join(', ') : '—'} |`);
    }
    lines.push('');
  }

  lines.push(`## Artifacts`);
  lines.push('');
  lines.push(`| Artifact | Path | Present | sha256 |`);
  lines.push(`|---|---|---|---|`);
  for (const a of manifest.artifacts) {
    const hashShort = a.sha256 ? `\`${a.sha256.slice(0, 12)}…\`` : '—';
    lines.push(`| ${a.label} | \`${a.path}\` | ${a.present ? '✓' : '—'} | ${hashShort} |`);
  }
  lines.push('');

  lines.push(`## Controls you can run`);
  lines.push('');
  for (const c of manifest.controls) {
    lines.push(`- **${c.id}** (${c.type}) — ${c.proves}`);
    lines.push(`  \`\`\`bash`);
    lines.push(`  ${c.verify}`);
    lines.push(`  \`\`\``);
  }
  lines.push('');
  lines.push(`Full machine-readable index: \`manifest.json\` alongside this file.`);
  lines.push('');
  return lines.join('\n');
}
