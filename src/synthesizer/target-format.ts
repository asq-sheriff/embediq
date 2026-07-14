/**
 * Output targets selected by the caller (CLI flag or `EMBEDIQ_OUTPUT_TARGETS`
 * env var). Each target corresponds to a family of generators: `claude`
 * produces the native Claude Code setup (the existing 12 generators), and
 * each other target produces a single agent-specific file (or scoped set).
 *
 * Keep this enum in lockstep with `ConfigGenerator.targets` on each
 * generator, otherwise the orchestrator's filtering will silently drop
 * valid generators.
 */
export enum TargetFormat {
  CLAUDE = 'claude',
  AGENTS_MD = 'agents-md',
  CURSOR = 'cursor',
  COPILOT = 'copilot',
  GEMINI = 'gemini',
  WINDSURF = 'windsurf',
  // v3.3 — local-AI targets. Opt-in only — never included in DEFAULT_TARGETS.
  // Auto-included by the orchestrator when the user has answered the local-AI
  // wizard questions; selectable explicitly via --targets / EMBEDIQ_OUTPUT_TARGETS.
  CONTINUE_DEV = 'continue-dev',
  AIDER = 'aider',
  ZED_AI = 'zed-ai',
  OLLAMA = 'ollama',
  // v3.3 — HIPAA-aware RAG scaffold. Auto-included when the user picks
  // healthcare industry AND opts into local AI. Generates a small runnable
  // RAG application under rag/, not just config files.
  RAG_SCAFFOLD = 'rag-scaffold',
  // v3.3 — Local router with confidence-based escalation. Auto-included
  // when the user opts into the router (TECH_019). Generates a runnable
  // Express dispatch service under router/ that routes simple tasks to
  // local Ollama and escalates complex tasks (or low-confidence answers)
  // to a hosted LLM after optional PHI redaction.
  LOCAL_ROUTER = 'local-router',
  // 6M — LiteLLM gateway config compiled from the routing policy (the PDP).
  // Opt-in only (never auto-included, so existing goldens stay byte-identical).
  // Emits `litellm/config.yaml`: a `model_list` from the policy's eligible
  // destinations (local + BAA-covered external) plus `context_window_fallbacks`
  // from the cascade budget. On a regulated profile an uncovered external
  // provider is absent from the file entirely — the gateway has no route to it.
  LITELLM_GATEWAY = 'litellm',
  // v4.0 — OSCAL Component Definition export. Opt-in only (never
  // auto-included so existing goldens stay byte-identical). When selected,
  // a post-pass step in the orchestrator emits
  // `.embediq/oscal/component-definition.json` describing which compliance
  // frameworks the generated harness addresses + the artifact manifest
  // (every file emitted in the same run). Suitable for ingestion by
  // Drata, Vanta, FedRAMP-style audit pipelines, and any OSCAL-aware
  // compliance platform.
  OSCAL_COMPONENT = 'oscal-component',
  // v4.0 — OSCAL System Security Plan (SSP) FRAGMENT export. Opt-in
  // only. When selected, a post-pass step emits
  // `.embediq/oscal/ssp-fragment.json` — the control-implementation +
  // harness-component sections of a full SSP. NOT a complete SSP: the
  // surrounding system context (authorization boundary, leveraged
  // authorizations, system-owner identity, network architecture, etc.)
  // is the operator's responsibility to fill in. Document is stamped
  // with `document-completion-status=fragment` so audit pipelines know
  // it's not a standalone artifact.
  OSCAL_SSP_FRAGMENT = 'oscal-ssp-fragment',
  // v4.0 — CycloneDX-ML AI Bill of Materials. Opt-in only. When
  // selected, a post-pass step emits `.embediq/cyclonedx/aibom.json`
  // enumerating every AI model, agent, and service the generated
  // harness invokes (Ollama local models, hosted APIs like Anthropic
  // and OpenAI, IDE-resident agents like Continue.dev / Aider / Zed AI,
  // the local-router service). Conforms to CycloneDX 1.6 with ML-BOM
  // extensions (modelCard fields on machine-learning-model components).
  // Procurement-relevant — EO 14110 and emerging FedRAMP guidance
  // expect AI/ML BOMs as part of supply-chain disclosure.
  CYCLONEDX_AIBOM = 'cyclonedx-aibom',
  // v4.0 — Per-file provenance trace. Opt-in only. When selected,
  // a post-pass step emits `.embediq/provenance/manifest.json` with one
  // entry per generated file: authoritative generator attribution
  // (which `ConfigGenerator` produced the file) + heuristic driver
  // inference (which profile fields, target selections, and compliance
  // frameworks caused the generator to emit it). Auditor-facing
  // "why is this file present?" answer-key. The trace itself is always
  // last in the post-pass chain so its manifest can include every
  // other governance output (the v4.0 governance phases).
  PROVENANCE = 'provenance',
  // Unified audit / evidence bundle. Opt-in only. When selected, a
  // post-pass step (LAST in the chain) emits `.embediq/audit-bundle/`
  // — a policy-versioned manifest + auditor-facing README that indexes
  // every compliance artifact produced in the run (routing policy,
  // gateway config, egress guardrail, OSCAL, AIBOM, provenance, DLP
  // hook) with a content hash each, summarizes the egress posture from
  // the routing policy, and lists the runnable controls (egress
  // eligibility gate, drift, hook enforcement) an auditor can execute.
  // Composes shipped outputs — no new runtime. Only credible because the
  // eligibility gate exists to anchor it.
  AUDIT_BUNDLE = 'audit-bundle',
}

export const ALL_TARGETS: readonly TargetFormat[] = [
  TargetFormat.CLAUDE,
  TargetFormat.AGENTS_MD,
  TargetFormat.CURSOR,
  TargetFormat.COPILOT,
  TargetFormat.GEMINI,
  TargetFormat.WINDSURF,
  TargetFormat.CONTINUE_DEV,
  TargetFormat.AIDER,
  TargetFormat.ZED_AI,
  TargetFormat.OLLAMA,
  TargetFormat.RAG_SCAFFOLD,
  TargetFormat.LOCAL_ROUTER,
  TargetFormat.LITELLM_GATEWAY,
  TargetFormat.OSCAL_COMPONENT,
  TargetFormat.OSCAL_SSP_FRAGMENT,
  TargetFormat.CYCLONEDX_AIBOM,
  TargetFormat.PROVENANCE,
  TargetFormat.AUDIT_BUNDLE,
];

/** When the caller supplies nothing, we emit the native Claude Code setup only. */
export const DEFAULT_TARGETS: readonly TargetFormat[] = [TargetFormat.CLAUDE];

export class InvalidTargetError extends Error {
  constructor(
    readonly token: string,
    readonly allowed: readonly TargetFormat[] = ALL_TARGETS,
  ) {
    super(
      `Unknown output target "${token}". Valid values: ${allowed.join(', ')}, all`,
    );
    this.name = 'InvalidTargetError';
  }
}

/**
 * Parse a user-supplied selection into a deduplicated, ordered list of
 * targets. Accepts comma-separated tokens, whitespace, "all", and case
 * variations. Returns the default when the input is null/empty.
 *
 *   parseTargets("claude,cursor")       → [CLAUDE, CURSOR]
 *   parseTargets("all")                 → ALL_TARGETS
 *   parseTargets("  CURSOR , agents-md") → [CURSOR, AGENTS_MD]
 *   parseTargets(undefined)             → DEFAULT_TARGETS
 */
export function parseTargets(input: string | string[] | undefined | null): TargetFormat[] {
  if (input == null) return [...DEFAULT_TARGETS];

  const tokens = Array.isArray(input)
    ? input.flatMap(splitTokens)
    : splitTokens(input);

  if (tokens.length === 0) return [...DEFAULT_TARGETS];

  const seen = new Set<TargetFormat>();
  const out: TargetFormat[] = [];
  for (const raw of tokens) {
    const token = raw.toLowerCase();
    if (token === 'all') {
      for (const t of ALL_TARGETS) {
        if (!seen.has(t)) {
          seen.add(t);
          out.push(t);
        }
      }
      continue;
    }
    const target = asTargetFormat(token);
    if (!seen.has(target)) {
      seen.add(target);
      out.push(target);
    }
  }
  return out;
}

/** Parse `EMBEDIQ_OUTPUT_TARGETS` — falls back to the default when unset/empty. */
export function parseTargetsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TargetFormat[] {
  return parseTargets(env.EMBEDIQ_OUTPUT_TARGETS ?? undefined);
}

function splitTokens(s: string): string[] {
  return s
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function asTargetFormat(token: string): TargetFormat {
  const match = ALL_TARGETS.find((t) => t === token);
  if (!match) throw new InvalidTargetError(token);
  return match;
}
