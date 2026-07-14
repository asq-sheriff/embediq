import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { GenerationContext, GeneratedFile } from '../../types/index.js';
import type { DlpPatternDef } from '../../domain-packs/index.js';
import type { MinimizeMode } from '../policy/types.js';

/**
 * LiteLLM egress-guardrail generator — the DLP layer of the ③ LLM-gateway PEP.
 *
 * Emits `litellm/guardrails/embediq_phi_egress.py`: an OSS custom-code LiteLLM
 * guardrail rendered from the compliance pack's DLP patterns — the SAME source
 * the rest of the harness uses (hooks, ignore, validation). This is the C2 fix:
 * the old router shipped a second, divergent inline redactor; there is now one
 * source of truth and the guardrail is derived from it by construction.
 *
 * Honesty boundary: the guardrail is DEFENCE IN DEPTH, never the compliance
 * control. The control is the gateway's `model_list` (only BAA-covered
 * destinations are routable — an uncovered provider is absent) plus credential
 * locality. Redaction here is minimum-necessary hygiene on the covered path
 * (default `off`), never HIPAA de-identification (45 CFR 164.514).
 *
 * Rides the LiteLLM gateway target. Emits only when the active compliance pack
 * contributes DLP patterns for the profile's frameworks, so a non-regulated
 * gateway selection stays byte-identical.
 */
export class LiteLlmGuardrailGenerator implements ConfigGenerator {
  name = 'litellm-guardrail';
  target = TargetFormat.LITELLM_GATEWAY;

  generate(ctx: GenerationContext): GeneratedFile[] {
    const patterns = guardrailPatterns(ctx);
    if (patterns.length === 0) return [];
    return [
      {
        relativePath: 'litellm/guardrails/embediq_phi_egress.py',
        content: renderGuardrail(patterns, minimizeModeOf(ctx)),
        description:
          'LiteLLM egress guardrail — PHI/PII DLP rendered from the compliance pack (litellm/guardrails/embediq_phi_egress.py)',
      },
    ];
  }
}

/**
 * DLP patterns applicable to the profile's active frameworks — the single
 * source the guardrail (and the gateway's `guardrails:` block) both key on, so
 * the config reference and the rendered file cannot disagree.
 */
export function guardrailPatterns(ctx: GenerationContext): DlpPatternDef[] {
  const frameworks = ctx.profile.complianceFrameworks ?? [];
  const patterns = ctx.domainPack?.dlpPatterns ?? [];
  return patterns.filter((p) => !p.requiresFramework || frameworks.includes(p.requiresFramework));
}

/** True when the gateway should render + reference the egress guardrail. */
export function shouldEmitGuardrail(ctx: GenerationContext): boolean {
  return guardrailPatterns(ctx).length > 0;
}

/**
 * The strongest minimum-necessary redaction mode the policy asks for on any
 * covered (coverage-requiring) class. Default `off` — redaction is the
 * customer's attributed choice, never EmbedIQ's silent default.
 */
function minimizeModeOf(ctx: GenerationContext): MinimizeMode {
  const rank: Record<MinimizeMode, number> = { off: 0, 'safe-classes': 1, all: 2 };
  let mode: MinimizeMode = 'off';
  for (const rule of ctx.policy?.eligibility ?? []) {
    if ((rule.requiresCoverage?.length ?? 0) === 0) continue;
    if (rank[rule.minimizeOnEgress] > rank[mode]) mode = rule.minimizeOnEgress;
  }
  return mode;
}

/**
 * Render each DLP pattern as `(label, severity, compiled)`. The regex is
 * emitted via JSON.stringify so backslashes survive into a valid Python string
 * literal with no raw-string edge cases — the same escaping discipline the
 * decision-only router rewrite adopted after the earlier double-escaping bug.
 */
function renderPatternRows(patterns: DlpPatternDef[]): string {
  return patterns
    .map((p) => `    (${JSON.stringify(p.name)}, ${JSON.stringify(p.severity)}, re.compile(${JSON.stringify(p.pattern)})),`)
    .join('\n');
}

function renderGuardrail(patterns: DlpPatternDef[], minimize: MinimizeMode): string {
  return `"""
EmbedIQ PHI/PII egress guardrail for the LiteLLM gateway.

Rendered from the compliance pack's DLP patterns — the SAME source the rest of
the harness uses (hooks, ignore, validation), so there is no second, divergent
copy to drift. This replaces the old inline router redactor.

DEFENCE IN DEPTH, not the compliance control. The control is the gateway's
model_list (only BAA-covered destinations are routable) plus credential
locality. Redaction here is minimum-necessary hygiene on the covered path,
never HIPAA de-identification (45 CFR 164.514).

Behaviour (rendered from the routing policy):
  - Always: detect matches and emit a structured audit record — counts only,
    never raw content — for the decision trace.
  - MINIMIZE_MODE != "off": replace matched spans with [REDACTED:<label>].
  - EMBEDIQ_GUARDRAIL_BLOCK=1: hard-fail (HTTP 400) on any CRITICAL match —
    fail-closed posture for the no-BAA / air-gapped deployment.

Pinned for the LiteLLM proxy custom-guardrail API (CustomGuardrail +
async_pre_call_hook). That signature has churned across releases; a guardrail
that stops loading fails OPEN on the safety-critical path, so verify it loads
after any proxy upgrade.
"""
import os
import re
import json
import logging

from litellm.integrations.custom_guardrail import CustomGuardrail
from litellm.proxy._types import UserAPIKeyAuth
from litellm.caching.caching import DualCache

logger = logging.getLogger("embediq.guardrail")

# Rendered from the routing policy's covered-path minimize mode.
MINIMIZE_MODE = ${JSON.stringify(minimize)}  # off | safe-classes | all

# Pattern labels safe to strip under "safe-classes" mode. Task-critical
# referents (MRN under debug, Patient/<id>) are NEVER stripped — redaction must
# not defeat the capability the BAA was signed to enable.
SAFE_CLASSES: list[str] = []

# (label, severity, compiled pattern) — the compliance DLP set, one source.
PATTERNS = [
${renderPatternRows(patterns)}
]


def _scan(text: str) -> list[tuple[str, str, int]]:
    hits = []
    for label, severity, rx in PATTERNS:
        n = len(rx.findall(text))
        if n:
            hits.append((label, severity, n))
    return hits


def _redact(text: str) -> str:
    for label, severity, rx in PATTERNS:
        if MINIMIZE_MODE == "all" or (MINIMIZE_MODE == "safe-classes" and label in SAFE_CLASSES):
            text = rx.sub("[REDACTED:" + label + "]", text)
    return text


class EmbedIQPhiEgress(CustomGuardrail):
    """Scans outbound messages for regulated identifiers before egress."""

    async def async_pre_call_hook(
        self,
        user_api_key_dict: UserAPIKeyAuth,
        cache: DualCache,
        data: dict,
        call_type: str,
    ):
        totals: dict[str, int] = {}
        critical = 0
        for msg in data.get("messages", []):
            content = msg.get("content")
            if not isinstance(content, str):
                continue
            for label, severity, n in _scan(content):
                totals[label] = totals.get(label, 0) + n
                if severity == "CRITICAL":
                    critical += n
            if MINIMIZE_MODE != "off":
                msg["content"] = _redact(content)

        if totals:
            # Counts only — never the matched content itself.
            logger.warning("embediq-guardrail egress match: %s", json.dumps(totals))

        if critical and os.environ.get("EMBEDIQ_GUARDRAIL_BLOCK") == "1":
            from fastapi import HTTPException

            raise HTTPException(
                status_code=400,
                detail="EmbedIQ guardrail blocked egress: regulated identifiers present",
            )

        return data
`;
}
