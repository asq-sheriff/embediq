/**
 * Retrieval audit logger. Writes one JSONL entry per query with
 * { timestamp, queryHash, retrievedIds, userId, model }.
 *
 * Never writes raw query text or retrieved chunk content — the query
 * is hashed with a per-deployment HMAC key (RAG_QUERY_HASH_KEY) for
 * traceability without exposure.
// Compliance frameworks active: hipaa.
// The hash key MUST be set in production — never let the dev fallback ship.
 */

import { appendFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const LOG_PATH = process.env.RAG_AUDIT_LOG_PATH ?? './rag-audit.jsonl';
const HASH_KEY = process.env.RAG_QUERY_HASH_KEY ?? '';

if (!HASH_KEY) {
  console.warn(
    '[rag-audit] RAG_QUERY_HASH_KEY is unset — using a static fallback. ' +
    'Set it before any sensitive data flows through this pipeline.',
  );
}

export interface AuditEntry {
  query: string;
  userId: string;
  model: string;
  retrievedIds: readonly string[];
}

export function logRetrieval(entry: AuditEntry): void {
  const queryHash = createHmac('sha256', HASH_KEY || 'dev-fallback-do-not-ship')
    .update(entry.query)
    .digest('hex');

  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    queryHash,
    userId: entry.userId,
    model: entry.model,
    retrievedIds: entry.retrievedIds,
    retrievedCount: entry.retrievedIds.length,
  });

  try {
    appendFileSync(LOG_PATH, line + '\n', 'utf-8');
  } catch (err) {
    console.error('[rag-audit] write failed:', err);
  }
}
