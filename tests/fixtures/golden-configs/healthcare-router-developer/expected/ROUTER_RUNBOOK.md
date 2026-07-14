# Local Router Runbook

EmbedIQ generated a hybrid-dispatch router for **Clinical decision support with hybrid local + hosted AI**. This runbook covers setup, the smoke test, the routing policy, and the production-hardening checklist.

The service exposes a single HTTP endpoint — `POST /route` — and decides per request whether to answer locally (Ollama) or escalate to the gateway.

## Prerequisites

- **Ollama** installed and running locally. See `OLLAMA_SETUP.md` for the install runbook generated alongside this router.
- A model pulled locally: `ollama pull qwen2.5-coder:32b`.
- The **LLM gateway** (LiteLLM) reachable at `GATEWAY_BASE_URL`. The router forwards escalations there; the gateway holds the provider credentials and enforces the egress guardrail. See `litellm/config.yaml`.
- A generated HMAC secret for prompt-hash audit: `openssl rand -hex 32`.

## Setup

```bash
cp router/.env.example router/.env
$EDITOR router/.env
# Set at least:
#   ROUTER_AUDIT_HASH_KEY (REQUIRED — openssl rand -hex 32)
#   GATEWAY_BASE_URL     (REQUIRED — where escalations are forwarded)

cd router && npm install
npm run dev
```

## Smoke test

```bash
# Health check
curl -s http://localhost:8787/health

# Short prompt — expect route: "local"
curl -s http://localhost:8787/route \
     -H 'content-type: application/json' \
     -d '{"prompt":"Write a regex for a US phone number."}'

# Long prompt — expect route: "gateway" (over the token threshold, forwarded)
curl -s http://localhost:8787/route \
     -H 'content-type: application/json' \
     -d "$(node -e 'process.stdout.write(JSON.stringify({prompt:"explain ".repeat(800)}))')"

```

## Routing policy

The classifier inspects each request through three layered signals:

1. **Token count.** Prompts under `ROUTER_MAX_LOCAL_TOKENS` (default 512) stay local. Longer prompts escalate.
2. **Escalation hints.** Phrases that indicate multi-step reasoning ("step by step", "draft a proposal/policy/RFC", "analyze pros and cons") force escalation regardless of length.
3. **Confidence self-evaluation.** Local answers are scored by the local model; anything below `ROUTER_CONFIDENCE_THRESHOLD` (default 0.55) is forwarded to the gateway.

### PHI egress enforcement (HIPAA)

This router holds **no provider credentials** and makes no direct provider call — it forwards escalations to the gateway. PHI/PII egress is enforced at the **gateway**, not here: the gateway's `model_list` contains only BAA-covered destinations (an uncovered provider has no route at all), and its guardrail applies the compliance pack's DLP patterns before any outbound call. Because the router has no way to reach a provider, an escalation cannot bypass that enforcement.

Gateway-side redaction is **minimum-necessary hygiene, not de-identification** per 45 CFR 164.514 (Safe Harbor / Expert Determination). The compliance control is the BAA-covered route, not the filter.

## Compliance obligations

Active frameworks for this profile: **HIPAA**.

- **HIPAA**: PHI egress is enforced at the gateway — only BAA-covered destinations are routable, and the gateway guardrail applies the DLP patterns.
- **HIPAA**: audit log retains for the required six years.
- **HIPAA**: BAA in place with any provider the gateway routes to.

## Production hardening checklist

Before any real traffic flows through the router:

- [ ] `ROUTER_AUDIT_HASH_KEY` set to a 32-byte random value, stored in a secrets manager — **not** in an .env file checked into source.
- [ ] `GATEWAY_BASE_URL` points at the hardened gateway; provider keys live in the **gateway's** secrets manager, never in this router.
- [ ] Filesystem encryption verified on the host (LUKS / FileVault / BitLocker / EBS).
- [ ] Network policy locked: Ollama bound to localhost; the router itself bound to an internal interface, never the public internet without a reverse proxy + auth.
- [ ] Audit log rotation configured (logrotate / Loki / Splunk).
- [ ] Rate-limit `POST /route` at the reverse proxy (e.g., 60 req/min per user).
- [ ] **HIPAA**: gateway `model_list` reviewed — confirm every routable destination is BAA-covered and no uncovered provider has a route.
- [ ] **HIPAA**: gateway guardrail smoke-tested with synthetic-PHI payloads — confirm it blocks the shapes your data contains. Run `--mode router-eligibility`.
- [ ] **HIPAA**: BAA in place with any provider the gateway routes to.

## What this scaffold is *not*

- **Not the egress guardrail.** PHI/PII filtering and BAA-scoped routing live at the gateway (`litellm/config.yaml`), not in this router. The router only decides local-vs-escalate and forwards; it cannot reach a provider.
- **Not a multi-tenant router.** Single-tenant by design; add per-tenant scoping at the API boundary if you need it.
- **Not opinionated about authentication.** No auth ships in the scaffold — terminate auth at a reverse proxy before exposing it.

## See also

- `OLLAMA_SETUP.md` — install + model-pull runbook
- The path-scoped rule under `.claude/rules/router-conventions.md`
