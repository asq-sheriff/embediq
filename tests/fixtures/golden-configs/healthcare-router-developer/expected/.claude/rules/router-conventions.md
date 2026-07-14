<!-- pathScope: router/**, src/router/** -->

# Local Router Conventions

This rule applies to code under `router/`. It complements the broader routing runbook at `ROUTER_RUNBOOK.md` — read both before editing the router.

## Routing policy

- **Default to local.** Only escalate when the classifier or the confidence step asks for it. Every escalation has a measurable cost; the local path is the one we audit, harden, and trust.
- **Never bypass the classifier.** Adding a new "always escalate" code path is a load-bearing decision — add a classifier signal instead.
- **Escalations forward to the gateway, never to a provider.** This router holds no credentials; `dispatch.ts` POSTs to `GATEWAY_BASE_URL`. The gateway owns keys and the egress guardrail — do not add a direct provider call here.

## Audit

- **Every request emits a JSONL audit entry** via `logRouting()`.
- **Never log the raw prompt or model response.** The audit pipeline hashes the prompt with an HMAC secret; only the hash leaves memory.
- **Never disable audit on the hot path.** If audit is failing, the route should still log the failure — not skip audit.

## PHI handling

- **PHI egress is enforced at the gateway, not here.** This router holds no credentials and cannot reach a provider — it only decides local-vs-escalate and forwards. The gateway routes only to BAA-covered destinations and applies the DLP guardrail. Do not add a direct provider call or a local filter that pretends to be one.
- **The BAA-covered route is the control, not a filter.** Redaction at the gateway is minimum-necessary hygiene, never de-identification (45 CFR 164.514).
- **Verify egress with the eligibility gate.** Run `--mode router-eligibility` against the corpus whenever the policy or the gateway config changes.

## Gateway dispatch

- **This router holds no provider keys.** `dispatch.ts` forwards to `GATEWAY_BASE_URL`; credentials live in the gateway's secrets manager, never here.
- **Timeouts and retries are caller-defined.** `forwardToGateway()` is a leaf function — the route handler owns budget and retry policy.
- **Errors from the gateway surface verbatim.** Do not silently fall back to the local model when the gateway call fails — that hides a failure mode the operator needs to see.

## Confidence self-evaluation

- **Self-evaluation runs on the local model** by design — it does not leave the host. Do not re-implement it against the gateway unless you also re-derive the threshold against measured outcomes.
- **Parse the score loosely.** Local models sometimes return prose. The loose-regex fallback to 0.5 is intentional.

## What this rule does *not* substitute for

- The full `ROUTER_RUNBOOK.md` — production hardening, smoke tests, compliance obligations.
- A real HIPAA de-identification process (45 CFR 164.514).
- A BAA with any provider the gateway routes to.
- The broader project compliance rules under `.claude/rules/`.
