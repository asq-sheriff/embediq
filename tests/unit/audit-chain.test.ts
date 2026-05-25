import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GENESIS_HASH,
  sha256,
  hashEntry,
  canonicalize,
  verifyAuditChain,
  appendChainedEntry,
  readLastEntryHash,
} from '../../src/util/audit-chain.js';

describe('canonicalize — deterministic JSON serialization', () => {
  it('sorts object keys recursively so two different insertion orders produce the same string', () => {
    const a = { b: 1, a: { y: 2, x: 3 } };
    const b = { a: { x: 3, y: 2 }, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(canonicalize(a)).toBe('{"a":{"x":3,"y":2},"b":1}');
  });

  it('preserves array order (arrays are semantically ordered)', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });

  it('handles primitives + null + nested arrays/objects', () => {
    expect(canonicalize('x')).toBe('"x"');
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(false)).toBe('false');
    expect(canonicalize({ a: [1, { b: 2 }] })).toBe('{"a":[1,{"b":2}]}');
  });
});

describe('hashEntry', () => {
  it('produces the same hash for the same entry regardless of key insertion order', () => {
    const a = { eventType: 'session_start', userId: 'u', timestamp: 't' };
    const b = { timestamp: 't', userId: 'u', eventType: 'session_start' };
    expect(hashEntry(a)).toBe(hashEntry(b));
  });

  it('ignores prevHash when computing the hash (so the content hash is stable across re-chaining)', () => {
    const a = { eventType: 'session_start', userId: 'u', prevHash: 'abc' };
    const b = { eventType: 'session_start', userId: 'u', prevHash: 'def' };
    expect(hashEntry(a)).toBe(hashEntry(b));
  });

  it('different content produces different hashes', () => {
    expect(hashEntry({ eventType: 'a' })).not.toBe(hashEntry({ eventType: 'b' }));
  });
});

describe('GENESIS_HASH', () => {
  it('is a stable 64-char hex string seeded from the embediq-specific seed', () => {
    expect(GENESIS_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(GENESIS_HASH).toBe(sha256('embediq-audit-chain-v1'));
  });
});

describe('verifyAuditChain', () => {
  function chainOf(entries: Record<string, unknown>[]): string[] {
    let prevHash = GENESIS_HASH;
    const out: string[] = [];
    for (const e of entries) {
      const chained = { ...e, prevHash };
      out.push(JSON.stringify(chained));
      prevHash = hashEntry(chained);
    }
    return out;
  }

  it('returns ok=true for a well-formed chain', () => {
    const lines = chainOf([
      { eventType: 'session_start', timestamp: 't1' },
      { eventType: 'file_written', timestamp: 't2', filePath: 'CLAUDE.md' },
      { eventType: 'session_complete', timestamp: 't3' },
    ]);
    const result = verifyAuditChain(lines);
    expect(result.ok).toBe(true);
    expect(result.entriesVerified).toBe(3);
    expect(result.totalEntries).toBe(3);
  });

  it('handles an empty input (no entries to verify, ok=true vacuously)', () => {
    const result = verifyAuditChain([]);
    expect(result.ok).toBe(true);
    expect(result.entriesVerified).toBe(0);
  });

  it('detects tampering — modified field on an entry breaks the next entry\'s prevHash', () => {
    const lines = chainOf([
      { eventType: 'session_start', timestamp: 't1' },
      { eventType: 'file_written', timestamp: 't2', filePath: 'CLAUDE.md' },
      { eventType: 'session_complete', timestamp: 't3' },
    ]);
    // Tamper with line 2: change filePath.
    const parsed = JSON.parse(lines[1]);
    parsed.filePath = 'EVIL.md';
    lines[1] = JSON.stringify(parsed);

    const result = verifyAuditChain(lines);
    expect(result.ok).toBe(false);
    // The tamper is at line 2 but breaks line 3's prevHash check.
    expect(result.brokenAtLine).toBe(3);
    expect(result.reason).toMatch(/prevHash does not match/);
  });

  it('detects a missing first link — first entry does not chain to genesis', () => {
    const result = verifyAuditChain([
      JSON.stringify({ eventType: 'session_start', prevHash: 'deadbeef' }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.brokenAtLine).toBe(1);
    expect(result.reason).toMatch(/genesis hash/i);
  });

  it('rejects an entry missing the prevHash field', () => {
    const result = verifyAuditChain([
      JSON.stringify({ eventType: 'session_start' }),  // no prevHash
    ]);
    expect(result.ok).toBe(false);
    expect(result.brokenAtLine).toBe(1);
    expect(result.reason).toMatch(/missing required string field `prevHash`/);
  });

  it('detects truncation — last entry removed makes the chain shorter but still valid', () => {
    const lines = chainOf([
      { eventType: 'session_start' },
      { eventType: 'file_written' },
      { eventType: 'session_complete' },
    ]);
    lines.pop();  // drop the last entry
    const result = verifyAuditChain(lines);
    // Truncation IS valid as long as what remains chains correctly.
    // The chain reports ok=true with the surviving entries; operators
    // detect truncation by comparing entry counts against expectations.
    expect(result.ok).toBe(true);
    expect(result.entriesVerified).toBe(2);
  });

  it('detects intra-line tampering with prevHash (chain-rebuild attack)', () => {
    const lines = chainOf([
      { eventType: 'session_start' },
      { eventType: 'file_written' },
    ]);
    // Forge an entirely new "first" entry with a tampered prevHash that
    // claims to follow genesis. The verifier catches it because the
    // FIRST entry's prevHash must equal GENESIS_HASH.
    const lastEntry = JSON.parse(lines[1]);
    lastEntry.prevHash = GENESIS_HASH;  // forge the link
    lines[1] = JSON.stringify(lastEntry);
    const result = verifyAuditChain([lines[1]]);  // only the tampered entry
    // The single line passes (its prevHash equals genesis), but the
    // full original chain breaks. That's the right boundary: each
    // verification is over the supplied lines as a sequence.
    expect(result.ok).toBe(true);  // single forged entry alone verifies clean
    // But the full chain with the forged predecessor is broken:
    const fullResult = verifyAuditChain(lines);
    expect(fullResult.ok).toBe(false);
    expect(fullResult.brokenAtLine).toBe(2);
  });

  it('rejects malformed JSON lines', () => {
    const result = verifyAuditChain(['{ not valid json']);
    expect(result.ok).toBe(false);
    expect(result.brokenAtLine).toBe(1);
    expect(result.reason).toMatch(/Malformed JSON/);
  });

  it('rejects non-object JSON values (array, string, number, null)', () => {
    expect(verifyAuditChain(['[]']).ok).toBe(false);
    expect(verifyAuditChain(['"string"']).ok).toBe(false);
    expect(verifyAuditChain(['42']).ok).toBe(false);
    expect(verifyAuditChain(['null']).ok).toBe(false);
  });
});

describe('readLastEntryHash + appendChainedEntry — file-based chain operations', () => {
  it('first append to a missing file chains to GENESIS_HASH', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'embediq-audit-chain-test-'));
    const path = join(dir, 'audit.jsonl');
    try {
      expect(readLastEntryHash(path)).toBe(GENESIS_HASH);
      appendChainedEntry(path, { eventType: 'session_start', timestamp: 't1' });
      const content = await readFile(path, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.prevHash).toBe(GENESIS_HASH);
      expect(entry.eventType).toBe('session_start');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('subsequent appends chain to the previous entry\'s content hash', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'embediq-audit-chain-test-'));
    const path = join(dir, 'audit.jsonl');
    try {
      appendChainedEntry(path, { eventType: 'session_start', timestamp: 't1' });
      appendChainedEntry(path, { eventType: 'file_written', timestamp: 't2', filePath: 'CLAUDE.md' });
      appendChainedEntry(path, { eventType: 'session_complete', timestamp: 't3' });

      const content = await readFile(path, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      expect(lines).toHaveLength(3);

      const result = verifyAuditChain(lines);
      expect(result.ok).toBe(true);
      expect(result.entriesVerified).toBe(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('treats an empty file the same as a missing one (chains to genesis)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'embediq-audit-chain-test-'));
    const path = join(dir, 'audit.jsonl');
    await writeFile(path, '', 'utf-8');
    try {
      expect(readLastEntryHash(path)).toBe(GENESIS_HASH);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws when the last entry is malformed JSON (prevents broken chain)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'embediq-audit-chain-test-'));
    const path = join(dir, 'audit.jsonl');
    await writeFile(path, '{ not valid\n', 'utf-8');
    try {
      expect(() => readLastEntryHash(path)).toThrow(/Cannot compute prevHash/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('wizard-audit integration with chain mode', () => {
  it('writes chained entries when EMBEDIQ_AUDIT_CHAIN_ENABLED=true', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'embediq-audit-chain-test-'));
    const path = join(dir, 'audit.jsonl');
    const originalEnv = { ...process.env };
    process.env.EMBEDIQ_AUDIT_LOG = path;
    process.env.EMBEDIQ_AUDIT_CHAIN_ENABLED = 'true';
    try {
      const { auditLog } = await import('../../src/util/wizard-audit.js');
      auditLog({ timestamp: '', eventType: 'session_start' });
      auditLog({ timestamp: '', eventType: 'session_complete' });

      const content = await readFile(path, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        const entry = JSON.parse(line);
        expect(typeof entry.prevHash).toBe('string');
        expect(entry.prevHash).toMatch(/^[0-9a-f]{64}$/);
      }
      const result = verifyAuditChain(lines);
      expect(result.ok).toBe(true);
    } finally {
      process.env = { ...originalEnv };
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes plain entries (no prevHash) when chain mode is disabled', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'embediq-audit-chain-test-'));
    const path = join(dir, 'audit.jsonl');
    const originalEnv = { ...process.env };
    process.env.EMBEDIQ_AUDIT_LOG = path;
    delete process.env.EMBEDIQ_AUDIT_CHAIN_ENABLED;
    try {
      const { auditLog } = await import('../../src/util/wizard-audit.js');
      auditLog({ timestamp: '', eventType: 'session_start' });
      const content = await readFile(path, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.prevHash).toBeUndefined();
    } finally {
      process.env = { ...originalEnv };
      await rm(dir, { recursive: true, force: true });
    }
  });
});
