<!-- pathScope: rag/**, src/rag/** -->

# HIPAA Compliance for RAG Code

This rule applies to retrieval-augmented generation code that may
index or query Protected Health Information (PHI). It complements
`.claude/rules/hipaa-phi-handling.md` — read both before editing.

## Vector store

- **Never use PHI as a vector key.** Use opaque identifiers
  (UUIDs, HMAC-SHA256 of a salted record ID).
- **Encrypt the vector store at rest.** Filesystem encryption
  (LUKS / FileVault / BitLocker / AWS EBS) is the minimum.
- **Never check vector dumps into source control.**

## Embeddings

- **Use local Ollama embeddings.** Hosted embedding APIs require
  a BAA with the provider.
- **Never log raw chunk text.** Log only the chunk hash, the
  source identifier, and the embedding model name.

## Retrieval audit

- **Audit every query** with `{timestamp, queryHash, userId,
  retrievedIds, model}`. Retain logs for the HIPAA-required
  six-year minimum (§164.316(b)(2)).
- **Never log the raw query string.** Hash it (HMAC-SHA256) for
  traceability without exposure.

## Access control

- **Filter retrieval results by the requesting user's
  authorization scope.** A query for patient A must not return
  documents about patient B.
- **Reject queries with missing or invalid `userId`** at the API
  boundary.

## What this rule does *not* substitute for

- The full HIPAA Privacy / Security Rule text (45 CFR Parts 160,
  162, 164).
- Your BAA with any non-local embedding or LLM provider.
- A real de-identification process per 45 CFR 164.514.
