"""
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
MINIMIZE_MODE = "off"  # off | safe-classes | all

# Pattern labels safe to strip under "safe-classes" mode. Task-critical
# referents (MRN under debug, Patient/<id>) are NEVER stripped — redaction must
# not defeat the capability the BAA was signed to enable.
SAFE_CLASSES: list[str] = []

# (label, severity, compiled pattern) — the compliance DLP set, one source.
PATTERNS = [
    ("Medical Record Number (MRN)", "CRITICAL", re.compile("\\b(?:MRN|Med\\s*Rec)\\s*[:#]?\\s*\\d{6,10}\\b")),
    ("Health Plan Beneficiary Number", "CRITICAL", re.compile("\\b(?:HPBN|Beneficiary|Member\\s*ID)\\s*[:#]?\\s*[A-Z0-9]{8,15}\\b")),
    ("ICD-10 Code with Patient Context", "HIGH", re.compile("\\b(?:patient|dx|diagnosis)\\s*[:#]?\\s*[A-TV-Z]\\d{2}\\.?\\d{0,4}\\b")),
    ("DEA Number", "CRITICAL", re.compile("\\b[ABFGMPRabfgmpr][A-Za-z]\\d{7}\\b")),
    ("NPI Number", "HIGH", re.compile("\\b(?:NPI|Natl\\s*Provider)\\s*[:#]?\\s*\\d{10}\\b")),
    ("FHIR Patient Resource ID", "HIGH", re.compile("\\bPatient\\/[A-Za-z0-9\\-]{1,64}\\b")),
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
