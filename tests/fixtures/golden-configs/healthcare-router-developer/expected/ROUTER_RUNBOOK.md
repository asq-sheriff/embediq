# Local Router Runbook

EmbedIQ generated a hybrid-dispatch router for **Clinical decision support with hybrid local + hosted AI**. This runbook covers setup, the smoke test, the routing policy, and the production-hardening checklist.

The service exposes a single HTTP endpoint — `POST /route` — and decides per request whether to answer locally (Ollama) or escalate to a hosted LLM.

## Prerequisites

- **Ollama** installed and running locally. See `OLLAMA_SETUP.md` for the install runbook generated alongside this router.
- A model pulled locally: `ollama pull qwen2.5-coder:32b`.
- An Anthropic API key with the minimum capability required for your workload.
- A generated HMAC secret for prompt-hash audit: `openssl rand -hex 32`.

## Setup

```bash
cp router/.env.example router/.env
$EDITOR router/.env
# Set at least:
#   ROUTER_AUDIT_HASH_KEY (REQUIRED — openssl rand -hex 32)
#   ANTHROPIC_API_KEY

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

# Long prompt — expect route: "hosted" (over the token threshold)
curl -s http://localhost:8787/route \
     -H 'content-type: application/json' \
     -d "$(node -e 'process.stdout.write(JSON.stringify({prompt:"explain ".repeat(800)}))')"

```

## Routing policy

The classifier inspects each request through three layered signals:

1. **Token count.** Prompts under `ROUTER_MAX_LOCAL_TOKENS` (default 512) stay local. Longer prompts escalate.
2. **Escalation hints.** Phrases that indicate multi-step reasoning ("step by step", "draft a proposal/policy/RFC", "analyze pros and cons") force escalation regardless of length.
3. **Confidence self-evaluation.** Local answers are scored by the local model; anything below `ROUTER_CONFIDENCE_THRESHOLD` (default 0.55) is re-dispatched to the hosted LLM.

### PHI redaction (HIPAA)

Every escalated prompt passes through `redactor.ts` before it leaves the host. The redactor catches SSN, MRN-style identifiers, US phone, email, date-of-birth, and 5+-digit ZIP codes by default — review the pattern list against your data before any real PHI flows through.

This redactor is **defense in depth**, not a replacement for a real de-identification process per 45 CFR 164.514 (Safe Harbor / Expert Determination).

## Compliance obligations

Active frameworks for this profile: **HIPAA**.

- **HIPAA**: every escalation passes through `redactor.ts` before leaving the host.
- **HIPAA**: audit log retains for the required six years.
- **HIPAA**: BAA in place with any hosted LLM you route to.

## Production hardening checklist

Before any real traffic flows through the router:

- [ ] `ROUTER_AUDIT_HASH_KEY` set to a 32-byte random value, stored in a secrets manager — **not** in an .env file checked into source.
- [ ] `ANTHROPIC_API_KEY` stored in a secrets manager with quarterly rotation.
- [ ] Filesystem encryption verified on the host (LUKS / FileVault / BitLocker / EBS).
- [ ] Network policy locked: Ollama bound to localhost; the router itself bound to an internal interface, never the public internet without a reverse proxy + auth.
- [ ] Audit log rotation configured (logrotate / Loki / Splunk).
- [ ] Rate-limit `POST /route` at the reverse proxy (e.g., 60 req/min per user).
- [ ] **HIPAA**: redactor pattern list reviewed against the data corpus.
- [ ] **HIPAA**: smoke-tested with synthetic-PHI payloads — confirm `redactor.ts` catches every shape your data contains.
- [ ] **HIPAA**: BAA in place with any hosted LLM provider used here.

## What this scaffold is *not*

- **Not a production-grade redactor.** The PHI redactor is defense in depth over a real de-identification process.
- **Not a multi-tenant router.** Single-tenant by design; add per-tenant scoping at the API boundary if you need it.
- **Not opinionated about authentication.** No auth ships in the scaffold — terminate auth at a reverse proxy before exposing it.

## See also

- `OLLAMA_SETUP.md` — install + model-pull runbook
- The path-scoped rule under `.claude/rules/router-conventions.md`
