import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  readFileSync,
} from 'node:fs';

/**
 * v4.0 — Tamper-evident audit chain.
 *
 * Linked-log pattern (inspired by RFC 6962 Certificate Transparency).
 * Each appended entry carries `prevHash` — the SHA-256 of the previous
 * entry's serialized form WITHOUT its own `prevHash` field. Tampering
 * with any entry breaks the chain from that point forward; a verifier
 * walks the file and reports the first break.
 *
 * Not full Merkle: we don't compute a tree, don't produce inclusion
 * proofs, don't sign chain heads. Those are bigger features reserved
 * for a follow-up (HSM signing in particular). Linked-log gives the
 * "every line is anchored to the one before it" property — sufficient
 * for the audit-evidence-tampering threat model EmbedIQ's operators
 * actually face.
 *
 * Genesis hash anchors the start of the chain. Deterministic — the
 * same string seeds every EmbedIQ audit chain so two operators
 * comparing chains can confirm they share the same root.
 */
const GENESIS_SEED = 'embediq-audit-chain-v1';
export const GENESIS_HASH = sha256(GENESIS_SEED);

/** SHA-256 helper (Node built-in; no dependency). */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Compute the canonical hash of an entry. Hashes the JSON
 * representation EXCLUDING the entry's own `prevHash` field — so the
 * hash represents the entry's *content* (everything except its link
 * to the previous entry). This means the hash of any entry is stable
 * even if you re-chain the log to a different predecessor.
 *
 * Key ordering: `JSON.stringify` preserves insertion order. Callers
 * write entries with a stable field order (the wizard-audit writer
 * does so), but for cross-implementation portability the verifier
 * doesn't depend on key order — it parses + re-serializes through
 * `canonicalize` below. Two implementations writing the same logical
 * entry produce the same hash.
 */
export function hashEntry(entry: Record<string, unknown>): string {
  const { prevHash: _ignored, ...rest } = entry;
  return sha256(canonicalize(rest));
}

/**
 * Deterministic JSON serialization: sort keys recursively. Avoids the
 * "two writers wrote the same logical entry in different key orders →
 * different hashes" problem. Arrays preserve their order (per JSON
 * spec they're ordered); objects get keys sorted; primitives serialize
 * with `JSON.stringify`'s native rules.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
  return `{${parts.join(',')}}`;
}

export interface AuditChainVerifyResult {
  ok: boolean;
  /** Number of entries the verifier successfully walked. Equals total when ok=true. */
  entriesVerified: number;
  /** Total entries in the input (post line-split, before any rejection). */
  totalEntries: number;
  /** When ok=false, 1-indexed line number of the first break. */
  brokenAtLine?: number;
  /** When ok=false, why the chain broke at that line. */
  reason?: string;
  /** When ok=false, the prevHash the verifier expected to find. */
  expectedPrevHash?: string;
  /** When ok=false, the prevHash actually found on the broken entry. */
  actualPrevHash?: string;
}

/**
 * Walk a list of JSONL lines as an audit chain. Returns a verification
 * report rather than throwing — callers (CLI, programmatic users) can
 * decide what to do with a break.
 */
export function verifyAuditChain(lines: readonly string[]): AuditChainVerifyResult {
  const total = lines.length;
  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < total; i++) {
    const lineNumber = i + 1;
    let entry: Record<string, unknown>;
    try {
      const parsed = JSON.parse(lines[i]);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return {
          ok: false,
          entriesVerified: i,
          totalEntries: total,
          brokenAtLine: lineNumber,
          reason: 'Line is not a JSON object',
        };
      }
      entry = parsed as Record<string, unknown>;
    } catch (err) {
      return {
        ok: false,
        entriesVerified: i,
        totalEntries: total,
        brokenAtLine: lineNumber,
        reason: `Malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const actualPrevHash = entry.prevHash;
    if (typeof actualPrevHash !== 'string') {
      return {
        ok: false,
        entriesVerified: i,
        totalEntries: total,
        brokenAtLine: lineNumber,
        reason: 'Entry is missing required string field `prevHash` — chain mode requires every entry to be chained.',
      };
    }
    if (actualPrevHash !== expectedPrevHash) {
      return {
        ok: false,
        entriesVerified: i,
        totalEntries: total,
        brokenAtLine: lineNumber,
        reason:
          i === 0
            ? 'First entry does not chain to the EmbedIQ genesis hash. The file may have been truncated or pre-dates chain mode.'
            : 'Entry\'s prevHash does not match the recomputed hash of the previous entry. Tampering or out-of-order writes.',
        expectedPrevHash,
        actualPrevHash,
      };
    }

    expectedPrevHash = hashEntry(entry);
  }

  return { ok: true, entriesVerified: total, totalEntries: total };
}

/**
 * Read the last entry from a chain file and return the hash that the
 * next appended entry must reference in its `prevHash` field.
 * Returns `GENESIS_HASH` when the file does not exist or is empty,
 * so the first appended entry chains to the genesis.
 */
export function readLastEntryHash(filePath: string): string {
  if (!existsSync(filePath)) return GENESIS_HASH;
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return GENESIS_HASH;
  try {
    const lastEntry = JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
    return hashEntry(lastEntry);
  } catch (err) {
    // Caller decides how to handle — most likely re-throws. Don't
    // swallow silently because writing a new entry against a wrong
    // prevHash would create a broken chain.
    throw new Error(
      `Cannot compute prevHash from the last entry in ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Append an entry to a chain file. Computes `prevHash` by reading the
 * file's last entry (or genesis when empty). Single-writer assumption
 * — concurrent processes appending to the same file will produce a
 * broken chain. Operators who need multi-writer audit should run a
 * single audit-ingester process (out of scope for this iteration).
 */
export function appendChainedEntry(
  filePath: string,
  entry: Record<string, unknown>,
): void {
  const prevHash = readLastEntryHash(filePath);
  const chained = { ...entry, prevHash };
  appendFileSync(filePath, JSON.stringify(chained) + '\n', 'utf-8');
}
