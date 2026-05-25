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
  // v3.3 / 6K — local-AI targets. Opt-in only — never included in DEFAULT_TARGETS.
  // Auto-included by the orchestrator when the user has answered the local-AI
  // wizard questions; selectable explicitly via --targets / EMBEDIQ_OUTPUT_TARGETS.
  CONTINUE_DEV = 'continue-dev',
  AIDER = 'aider',
  ZED_AI = 'zed-ai',
  OLLAMA = 'ollama',
  // v3.3 / 6L — HIPAA-aware RAG scaffold. Auto-included when the user picks
  // healthcare industry AND opts into local AI. Generates a small runnable
  // RAG application under rag/, not just config files.
  RAG_SCAFFOLD = 'rag-scaffold',
  // v3.3 / 6M — Local router with confidence-based escalation. Auto-included
  // when the user opts into the router (TECH_019). Generates a runnable
  // Express dispatch service under router/ that routes simple tasks to
  // local Ollama and escalates complex tasks (or low-confidence answers)
  // to a hosted LLM after optional PHI redaction.
  LOCAL_ROUTER = 'local-router',
  // v4.0 / 8B — OSCAL Component Definition export. Opt-in only (never
  // auto-included so existing goldens stay byte-identical). When selected,
  // a post-pass step in the orchestrator emits
  // `.embediq/oscal/component-definition.json` describing which compliance
  // frameworks the generated harness addresses + the artifact manifest
  // (every file emitted in the same run). Suitable for ingestion by
  // Drata, Vanta, FedRAMP-style audit pipelines, and any OSCAL-aware
  // compliance platform.
  OSCAL_COMPONENT = 'oscal-component',
  // v4.0 / 8C — OSCAL System Security Plan (SSP) FRAGMENT export. Opt-in
  // only. When selected, a post-pass step emits
  // `.embediq/oscal/ssp-fragment.json` — the control-implementation +
  // harness-component sections of a full SSP. NOT a complete SSP: the
  // surrounding system context (authorization boundary, leveraged
  // authorizations, system-owner identity, network architecture, etc.)
  // is the operator's responsibility to fill in. Document is stamped
  // with `document-completion-status=fragment` so audit pipelines know
  // it's not a standalone artifact.
  OSCAL_SSP_FRAGMENT = 'oscal-ssp-fragment',
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
  TargetFormat.OSCAL_COMPONENT,
  TargetFormat.OSCAL_SSP_FRAGMENT,
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
