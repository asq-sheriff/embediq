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
}

export const ALL_TARGETS: readonly TargetFormat[] = [
  TargetFormat.CLAUDE,
  TargetFormat.AGENTS_MD,
  TargetFormat.CURSOR,
  TargetFormat.COPILOT,
  TargetFormat.GEMINI,
  TargetFormat.WINDSURF,
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
