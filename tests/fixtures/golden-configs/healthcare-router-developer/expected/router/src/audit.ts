/**
 * Routing audit logger. Writes one JSONL entry per request with
 * { timestamp, promptHash, destination, reason, model, latencyMs }.
 *
 * Never writes raw prompt or model response — the prompt is hashed
 * with a per-deployment HMAC key (ROUTER_AUDIT_HASH_KEY) for
 * traceability without exposure.
// Compliance frameworks active: hipaa.
// The hash key MUST be set in production — never let the dev fallback ship.
 */

import { appendFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const LOG_PATH = process.env.ROUTER_AUDIT_LOG_PATH ?? './router-audit.jsonl';
const HASH_KEY = process.env.ROUTER_AUDIT_HASH_KEY ?? '';

if (!HASH_KEY) {
  console.warn(
    '[router-audit] ROUTER_AUDIT_HASH_KEY is unset — using a static fallback. ' +
    'Set it before any sensitive traffic flows through this service.',
  );
}

export interface RoutingAuditEntry {
  promptForAudit: string;
  destination: 'local' | 'gateway' | 'error';
  reason: string;
  model: string;
  latencyMs: number;
  confidence?: number;
  error?: string;
}

export function logRouting(entry: RoutingAuditEntry): void {
  const promptHash = createHmac('sha256', HASH_KEY || 'dev-fallback-do-not-ship')
    .update(entry.promptForAudit)
    .digest('hex');

  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    promptHash,
    destination: entry.destination,
    reason: entry.reason,
    model: entry.model,
    latencyMs: entry.latencyMs,
    confidence: entry.confidence,
    error: entry.error,
  });

  try {
    appendFileSync(LOG_PATH, line + '\n', 'utf-8');
  } catch (err) {
    console.error('[router-audit] write failed:', err);
  }
}
