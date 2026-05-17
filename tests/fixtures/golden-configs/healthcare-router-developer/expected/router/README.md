# Local Router

Hybrid-dispatch service for the **Clinical decision support with hybrid local + hosted AI**. Routes inbound chat / completion requests between a local Ollama model and an optional hosted LLM, choosing the destination from a layered set of signals.

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
| `src/classifier.ts` | Token / regex heuristics — local-vs-hosted decision |
| `src/local-client.ts` | Ollama client |
| `src/hosted-client.ts` | Anthropic client |
| `src/audit.ts` | Per-request JSONL audit log (prompt hash, decision, latency) |
| `src/redactor.ts` | PHI redactor — runs before any escalation |
| `src/confidence.ts` | Self-evaluation — re-routes low-confidence answers |

See `ROUTER_RUNBOOK.md` for what to harden before any sensitive traffic flows through this service.
