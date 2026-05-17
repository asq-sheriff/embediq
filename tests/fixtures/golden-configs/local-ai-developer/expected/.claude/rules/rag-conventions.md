<!-- pathScope: rag/**, src/rag/** -->

# RAG Conventions

Generic best practices for the retrieval-augmented-generation
scaffold under `rag/`. No regulated frameworks are active for this
profile, so this rule covers the engineering hygiene that applies
to all RAG code regardless of compliance regime.

## Vector store

- **Use opaque chunk identifiers.** Never use source content as
  the primary key — hashed or UUID identifiers only.
- **Never commit vector dumps to source control.** Patterns like
  `*.embeddings.bin` and `*.vectors.dump` are already in
  `.gitignore`; do not weaken them.
- **Encrypt the host filesystem** if the source corpus is
  sensitive.

## Embeddings

- **Prefer local embedders** (`nomic-embed-text` via Ollama).
- **Cache embeddings idempotently.** The chunk hash should be
  the cache key so re-indexing the same content is a no-op.

## Retrieval audit

- **Log every query** with `{timestamp, queryHash, userId,
  retrievedIds, model}`. Hash the query — never store raw query
  text in the audit log.
- **Rotate audit logs.** Even outside regulated retention
  requirements, audit logs grow fast.

## Access control

- **Filter retrieval by user scope.** If the corpus contains
  per-user data, enforce the filter in the retrieval layer.
- **Reject anonymous queries.** Replace the `USER` env-var
  default with your real auth identity at the API boundary.

## Performance

- **Batch embeddings** when indexing — single-call latency is
  dominated by HTTP overhead.
- **SQLite-VSS handles ~100k chunks comfortably.** Beyond that,
  consider Qdrant / pgvector / Weaviate for the data layer.
