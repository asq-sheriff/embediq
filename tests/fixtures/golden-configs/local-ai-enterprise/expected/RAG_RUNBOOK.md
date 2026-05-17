# RAG Runbook

EmbedIQ generated a retrieval-augmented-generation scaffold for
**Enterprise data platform**. This runbook covers
setup, the smoke test, the compliance obligations relevant to your
profile, and the production-hardening checklist.

The scaffold runs entirely on local Ollama models by default — no
embeddings or retrieval data leaves the workstation unless you
explicitly point `OLLAMA_HOST` somewhere else.

## Prerequisites

- **Ollama** installed and running locally. See `OLLAMA_SETUP.md`
  for the install runbook generated alongside this scaffold.
- The `nomic-embed-text` model pulled: `ollama pull nomic-embed-text`.
- A generated HMAC secret for query-hash audit: `openssl rand -hex 32`.

## Setup

```bash
cp rag/.env.example rag/.env
$EDITOR rag/.env
# Set: OLLAMA_HOST (defaults to http://localhost:11434)
#      OLLAMA_EMBED_MODEL (defaults to nomic-embed-text)
#      RAG_DB_PATH (defaults to ./rag.db)
#      RAG_AUDIT_LOG_PATH (defaults to ./rag-audit.jsonl)
#      RAG_QUERY_HASH_KEY (REQUIRED — generate with openssl rand -hex 32)
#      RAG_TOP_K (defaults to 8)

cd rag && npm install
```

## Smoke test

```bash
mkdir -p sample-corpus
# (drop a few documents here — the scaffold accepts .json, .txt, .md)

# Index
npx tsx src/cli.ts index ./sample-corpus

# Query
npx tsx src/cli.ts query "your question here"
```

The retrieval is logged to `rag-audit.jsonl` — inspect with `jq` to
confirm only `queryHash`, `userId`, `model`, and `retrievedIds`
are recorded (never the raw query text).

## Compliance obligations

No regulated frameworks were declared in the wizard for this profile.
The path-scoped rule file `.claude/rules/rag-conventions.md` covers
generic RAG best practices (audit, encryption-at-rest, never log raw
queries). Layer your own framework-specific rules on top if needed.

## Production hardening checklist

Before any real data flows through this scaffold:

- [ ] `RAG_QUERY_HASH_KEY` set to a 32-byte random value,
      stored in a secrets manager (Vault, AWS Secrets,
      Kubernetes Secret) — **not** in an .env file checked
      into source.
- [ ] Filesystem encryption verified on the host (LUKS /
      FileVault / BitLocker / EBS).
- [ ] Network policy locked to localhost for Ollama (no
      inbound access from outside the trust boundary).
- [ ] Audit log rotation configured (logrotate / Loki /
      Splunk).
- [ ] User-scope filtering wired in front of `store.search()`
      — the scaffold ships with no access control by design.

## What this scaffold is *not*

- **Not a multi-tenant retrieval service.** Single-tenant by design;
  add multi-tenant scoping yourself.
- **Not a production de-identification pipeline.** Use a real
  de-identification step if your data needs it.
- **Not opinionated about the LLM step.** The scaffold ends at
  retrieval. How you compose retrieved chunks into an LLM prompt is
  intentionally yours to design.

## Troubleshooting

- **`Could not connect to Ollama`** — confirm `ollama serve` is
  running. `curl http://localhost:11434/api/tags` should return a
  non-empty model list.
- **`Module not found: sqlite-vss`** — sqlite-vss ships native
  binaries; re-run install. On Alpine, you may need glibc compat.
- **Empty retrieval results** — confirm the index step ran without
  errors and the database file exists at `RAG_DB_PATH`.

## See also

- `OLLAMA_SETUP.md` — install + model-pull runbook
- The path-scoped compliance rule(s) under `.claude/rules/rag-*.md`
  generated alongside this scaffold
