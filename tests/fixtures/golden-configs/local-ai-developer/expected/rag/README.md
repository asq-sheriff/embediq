# RAG (TypeScript)

A retrieval-augmented-generation scaffold for the **Local AI Sandbox**. Runs entirely on local Ollama models — no embeddings or retrieval data leaves the workstation.

> **Read [RAG_RUNBOOK.md](../RAG_RUNBOOK.md) at the project root
> first.** It covers the compliance obligations relevant to your
> profile, the smoke test, and the production-hardening checklist.

## Quick start

```bash
cp rag/.env.example rag/.env
# edit rag/.env to set OLLAMA_HOST + audit log path

cd rag && npm install

# Index a directory of source documents
npx tsx src/cli.ts index ./sample-corpus

# Query
npx tsx src/cli.ts query "your question here"
```

## Files

| File | Purpose |
|---|---|
| `src/chunker.ts` | Plain-text chunker — paragraph + soft-cap splitting |
| `src/embedder.ts` | Calls local Ollama `nomic-embed-text` for vectors |
| `src/store.ts` | SQLite-VSS vector store |
| `src/audit.ts` | Per-query audit log (query hash, retrieved IDs, never raw content) |
| `src/cli.ts` | `index <dir>` and `query <text>` commands |

See `RAG_RUNBOOK.md` for compliance obligations and production
hardening before any sensitive data flows through this scaffold.
