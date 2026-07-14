import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { GenerationContext, GeneratedFile } from '../../types/index.js';
import type { Destination, RoutingPolicy } from '../policy/types.js';
import { shouldEmitGuardrail } from './litellm-guardrail.js';

/**
 * LiteLLM gateway generator — the ③ LLM-gateway Policy Enforcement Point.
 *
 * Compiles `litellm/config.yaml` from the SAME `RoutingPolicy` the router is
 * compiled from (read off `ctx.policy`), so the gateway's `model_list` and the
 * router's eligibility set cannot drift apart. The gateway is the unbypassable
 * chokepoint: it is the only layer that holds credentials, so what it *cannot*
 * reach, nothing can.
 *
 * Defence-in-depth property enforced here: on a regulated profile an
 * **uncovered** external destination does not appear in `model_list` at all —
 * absent, not merely unreachable. With no BAA attested (`coveredProviders`
 * empty) the file has zero external entries: air-gapped by construction, and
 * you can prove it by reading the file.
 *
 * Auto-included whenever the router is enabled (`profile.routerEnabled`) — the
 * decision-only router forwards escalations here — and selectable explicitly via
 * `--targets litellm`. Renders a `guardrails:` block referencing the egress
 * guardrail only when the profile contributes DLP patterns (see
 * `shouldEmitGuardrail`), so a non-regulated router stays byte-identical.
 */
export class LiteLlmGatewayGenerator implements ConfigGenerator {
  name = 'litellm-gateway';
  target = TargetFormat.LITELLM_GATEWAY;

  generate(ctx: GenerationContext): GeneratedFile[] {
    const policy = ctx.policy;
    if (!policy) return [];
    return [
      {
        relativePath: 'litellm/config.yaml',
        content: renderConfig(policy, shouldEmitGuardrail(ctx)),
        description: 'LiteLLM gateway config compiled from the routing policy (litellm/config.yaml)',
      },
    ];
  }
}

/** Regulated: the lattice restricts at least one class to covered destinations. */
function isRegulated(policy: RoutingPolicy): boolean {
  return policy.eligibility.some((r) => (r.requiresCoverage?.length ?? 0) > 0);
}

/** Destinations that belong in the gateway's model_list. */
function gatewayDestinations(policy: RoutingPolicy): Destination[] {
  const regulated = isRegulated(policy);
  return policy.destinations.filter((d) => {
    if (d.locality === 'local') return true;
    return regulated ? d.covered.length > 0 : true; // uncovered externals absent on a regulated profile
  });
}

function modelName(d: Destination): string {
  // Local model_name must be unique per model — a coder model and an embedding
  // model that collide under one model_name would let a request route to the
  // wrong one. External providers keep their bare provider name (one covered
  // destination per provider on a regulated profile).
  return d.locality === 'local' ? `local-${modelIdOf(d)}` : d.provider;
}

function modelIdOf(d: Destination): string {
  const idx = d.id.indexOf(':');
  return idx >= 0 ? d.id.slice(idx + 1) : d.id;
}

function renderConfig(policy: RoutingPolicy, withGuardrail: boolean): string {
  const dests = gatewayDestinations(policy);
  const lines: string[] = [];

  lines.push(`# LiteLLM gateway — compiled from EmbedIQ routing policy ${policy.version}.`);
  lines.push(`# Pin a signed, immutable LiteLLM proxy image tag before production use.`);
  lines.push(`# Guardrails (PHI/PII egress filtering) render from the compliance skill payload — see the router runbook.`);
  lines.push('');
  lines.push('model_list:');
  for (const d of dests) {
    const covered = d.covered.length > 0 ? d.covered.join(',') : 'none';
    lines.push(`  - model_name: ${modelName(d)}                 # locality: ${d.locality}, covered: [${covered}]`);
    lines.push(`    litellm_params:`);
    if (d.locality === 'local') {
      lines.push(`      model: ollama/${modelIdOf(d)}`);
      lines.push(`      api_base: os.environ/OLLAMA_HOST`);
    } else {
      lines.push(`      model: ${d.provider}/${modelIdOf(d)}`);
      lines.push(`      api_key: os.environ/${d.provider.toUpperCase()}_API_KEY`);
    }
  }

  const local = dests.find((d) => d.locality === 'local');
  const escalation = dests.find((d) => d.locality === 'external');
  if (local && escalation) {
    lines.push('');
    lines.push('litellm_settings:');
    lines.push('  context_window_fallbacks:');
    lines.push(`    - ${modelName(local)}: [${modelName(escalation)}]`);
  }

  if (withGuardrail) {
    // The guardrail file is rendered by LiteLlmGuardrailGenerator from the same
    // compliance DLP set; both key on shouldEmitGuardrail(ctx) so this reference
    // and the file cannot disagree.
    lines.push('');
    lines.push('guardrails:');
    lines.push('  - guardrail_name: embediq-phi-egress');
    lines.push('    litellm_params:');
    lines.push('      guardrail: guardrails.embediq_phi_egress.EmbedIQPhiEgress');
    lines.push('      mode: pre_call');
    lines.push('      default_on: true');
  }

  lines.push('');
  return lines.join('\n');
}
