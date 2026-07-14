# Local Router

Hybrid-dispatch service for the **Clinical decision support with hybrid local + hosted AI**. Routes inbound chat / completion requests between a local Ollama model and the LLM gateway, choosing the destination from a layered set of signals. This router makes the decision and forwards escalations to the gateway; it holds no provider credentials and never calls a provider directly.

> **Read [ROUTER_RUNBOOK.md](../ROUTER_RUNBOOK.md) at the project root first.** It covers compliance obligations, the smoke test, and the production-hardening checklist.

## Quick start

```bash
cp router/.env.example router/.env
$EDITOR router/.env

cd router && npm install
npm run dev

# In another terminal —
curl -s http://localhost:8787/route -H 'content-type: application/json' \
     -d '{"prompt":"Summarize this README in one sentence."}'
```

## Files

| File | Purpose |
|---|---|
| `src/server.ts` | Express entry point — exposes `POST /route` |
| `src/classifier.ts` | Token / regex heuristics — local-vs-escalate decision |
| `src/local-client.ts` | Ollama client |
| `src/dispatch.ts` | Forwards escalations to the LLM gateway — holds NO provider credentials |
| `src/audit.ts` | Per-request JSONL audit log (prompt hash, decision, latency) |
| `routing-policy.yaml` | Serialized routing policy (eligibility + destinations) — diffable, drift-scanned |
| `src/confidence.ts` | Self-evaluation — re-routes low-confidence answers |

See `ROUTER_RUNBOOK.md` for what to harden before any sensitive traffic flows through this service.
