<!-- pathScope: router/**, src/router/** -->

# Local Router Conventions

This rule applies to code under `router/`. It complements the broader routing runbook at `ROUTER_RUNBOOK.md` — read both before editing the router.

## Routing policy

- **Default to local.** Only escalate when the classifier or the confidence step asks for it. Every escalation has a measurable cost; the local path is the one we audit, harden, and trust.
- **Never bypass the classifier.** Adding a new "always escalate" code path is a load-bearing decision — add a classifier signal instead.
- **Never escalate raw input.** The hosted-client call site assumes its `prompt` has already been redacted (where redaction applies).

## Audit

- **Every request emits a JSONL audit entry** via `logRouting()`.
- **Never log the raw prompt or model response.** The audit pipeline hashes the prompt with an HMAC secret; only the hash leaves memory.
- **Never disable audit on the hot path.** If audit is failing, the route should still log the failure — not skip audit.

## PHI handling

- **All escalations pass through `redactor.ts`.** A new escalation path that skips redaction is a HIPAA violation by construction.
- **Treat the redactor as defense in depth.** Real de-identification is the responsibility of the upstream pipeline (45 CFR 164.514).
- **Test the redactor with synthetic PHI fixtures** every time the pattern list changes — golden fixtures in `tests/fixtures/synthetic-phi/`.

## Hosted-LLM clients

- **API keys never live in source.** They live in `.env` (gitignored) in dev, and in a real secrets manager in production.
- **Timeouts and retries are caller-defined.** `generateHosted()` is a leaf function — the route handler owns budget and retry policy.
- **Errors from the hosted client surface verbatim.** Do not silently fall back to the local model when the hosted call fails — that hides a failure mode the operator needs to see.

## Confidence self-evaluation

- **Self-evaluation runs on the local model** by design — it does not leave the host. Do not re-implement it against the hosted LLM unless you also re-derive the threshold against measured outcomes.
- **Parse the score loosely.** Local models sometimes return prose. The loose-regex fallback to 0.5 is intentional.

## What this rule does *not* substitute for

- The full `ROUTER_RUNBOOK.md` — production hardening, smoke tests, compliance obligations.
- A real HIPAA de-identification process (45 CFR 164.514).
- A BAA with any hosted LLM provider used by this router.
- The broader project compliance rules under `.claude/rules/`.
