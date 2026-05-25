<!-- audience: public -->

# Tamper-Evident Audit Chain (v4.0 / 8F)

EmbedIQ's audit log can run in a **tamper-evident chain** mode: every appended entry carries a SHA-256 `prevHash` linking it to the previous entry (or to a deterministic genesis hash for the first entry). Tampering with any entry breaks the chain from that entry forward, and the bundled `verify-audit-log` CLI walks the chain and reports the first break.

The design is a linked-log pattern inspired by [RFC 6962 Certificate Transparency](https://www.rfc-editor.org/rfc/rfc6962). It is **not** a full Merkle tree — we don't compute inclusion proofs or sign chain heads. Those are bigger features reserved for a follow-up iteration (HSM signing is the most-requested addition). The linked-log property is enough for the threat model EmbedIQ's operators actually face: detecting after-the-fact modification of audit entries.

## Opting in

Two environment variables, both required to write a chained log:

```bash
# 1. Audit log itself (existing — unchanged from prior versions)
EMBEDIQ_AUDIT_LOG=/var/log/embediq/audit.jsonl

# 2. Chain mode (new in v4.0 / 8F)
EMBEDIQ_AUDIT_CHAIN_ENABLED=true
```

When both are set, every entry written via the EmbedIQ audit logger carries a `prevHash` field. When `EMBEDIQ_AUDIT_CHAIN_ENABLED` is unset (or any value other than `true`), the writer falls back to plain JSONL — existing audit pipelines continue working unchanged.

Mixing modes against the same file produces a broken chain on the first chained entry that follows a plain one. **Switch a file to chain mode by rotating it out and starting fresh** — there is no automatic migration.

## What gets hashed

Each entry's `prevHash` is the SHA-256 of the **previous entry's content** — the JSON serialization of the entry WITHOUT its own `prevHash` field. Computed via a deterministic canonicalization (recursive key sort) so two writers running the same logical event produce the same hash.

The first entry's `prevHash` equals `GENESIS_HASH = sha256("embediq-audit-chain-v1")`. Stable across EmbedIQ deployments — two operators comparing chains can confirm they share the same root.

## Verifying a chain

```bash
# CLI
npm run verify-audit-log -- --input /var/log/embediq/audit.jsonl

# Make target
make verify-audit-log -- --input /var/log/embediq/audit.jsonl

# JSON output for CI / monitoring pipelines
npm run verify-audit-log -- --input /var/log/embediq/audit.jsonl --format json
```

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Chain verified clean — every entry's `prevHash` matches the recomputed hash of the previous entry |
| 1 | Chain broken — first break details printed |
| 2 | Configuration error (missing `--input`, file not found, malformed JSON, etc.) |

Clean run:

```
EmbedIQ audit-chain verification
  Input:        /var/log/embediq/audit.jsonl
  Genesis hash: b21618edcb800b72092a77b6698550944baa04c19034d77c63836ad5afc6087a
  Entries:      3

  ✓ Chain verified clean. 3 entries.
```

Broken run (line 2 was modified after the fact):

```
EmbedIQ audit-chain verification
  Input:        /var/log/embediq/audit.jsonl
  Entries:      3

  ✗ Chain broken at line 3.
    Reason:   Entry's prevHash does not match the recomputed hash of the previous entry. Tampering or out-of-order writes.
    Expected: 38d9a6af655dedf66e7a71697d99e6508e77893f6d72a38efd5695415978dce3
    Actual:   51ecd57286e1a4833d20bae068faaa221fa1be6a3a27e22c9edab48e2cf6cad2
    Verified up to: 2 of 3
```

Note that the break is reported on **line 3**, not the tampered line 2 — because the tamper invalidates the *next* entry's chain-link, which is where the verifier first notices the mismatch. The `Verified up to:` count tells you how many entries were intact.

## When to run verification

| Scenario | Recommendation |
|---|---|
| **Post-incident review** — auditor asks for evidence integrity | Run once, capture JSON output, archive alongside the audit log |
| **Scheduled CI check** — daily / weekly integrity sweep | Wire `make verify-audit-log -- --input <path>` into a cron / scheduled-pipeline; exit code is the signal |
| **Pre-rotation** — about to archive `audit.jsonl` and start a new file | Verify clean before rotation; the next file's first entry starts a new chain from genesis |
| **Forensic investigation** — looking for "when did this audit entry change?" | Walk through the JSON output (entriesVerified count) — that's the line up to which the chain is intact |

## What an attacker can and can't do

The linked-log property defends against these attack vectors:

- ✅ **Modifying a single entry** — the next entry's prevHash no longer matches, verifier flags the break.
- ✅ **Deleting an entry from the middle** — same: the entry after the deletion no longer chains correctly.
- ✅ **Inserting a forged entry in the middle** — its prevHash would need to match the previous entry's content hash, which the attacker can compute, but then the following entry's prevHash no longer matches THIS forged entry's content hash. Cascading failure.

It does **not** defend against:

- ❌ **Truncation from the end** — removing the last N entries produces a shorter but still-valid chain. Detect by comparing entry counts against expectations (operators are responsible for knowing roughly how many entries to expect).
- ❌ **Re-chaining the whole log** — an attacker who controls the file can rewrite every entry's `prevHash` to forge a clean chain. Defense requires external anchoring (publishing chain heads to a write-only store, signing with an HSM key the attacker can't access). Both are out of scope for 8F; reserved for a follow-up.
- ❌ **Race conditions with multiple writers** — the writer reads the last entry to compute `prevHash`, then appends. Two concurrent appends race on the read+write step and produce a broken chain. **Use a single-writer audit pipeline** — the existing `EMBEDIQ_AUDIT_LOG` writer is sync-fs-based and single-process by design.

## Composing with the rest of the v4.0 governance suite

The audit chain provides the **WHEN-and-IN-WHAT-ORDER** dimension of the audit trail. It pairs with:

- **8B** (OSCAL component-definition) — product-level compliance claim
- **8C** (OSCAL SSP fragment) — deployment-level compliance claim
- **8D** (CycloneDX-ML AIBOM) — AI supply-chain disclosure
- **8E** (provenance trace) — per-file authoritative-attribution + heuristic-driver explanation

When an auditor asks *"who did what when, and is the record intact?"*, the answer is:
- **who + what** — comes from the audit log's `userId` / `eventType` / `filePath` fields
- **when** — comes from the audit log's `timestamp` field
- **was it modified after the fact** — comes from `verify-audit-log` over the chained log

For a clean handoff to an external compliance platform (Drata / Vanta / FedRAMP audit pipeline), combine the chain-verified audit log with the OSCAL + AIBOM + provenance outputs into one evidence package.

## See also

- [`session-backends.md`](session-backends.md) — session-side persistence (separate from audit).
- [`../extension-guide/exporting-provenance-trace.md`](../extension-guide/exporting-provenance-trace.md) — 8E provenance.
- [RFC 6962 — Certificate Transparency](https://www.rfc-editor.org/rfc/rfc6962) — the design lineage of the linked-log pattern.
- [`src/util/audit-chain.ts`](../../src/util/audit-chain.ts) — implementation reference (hashEntry, canonicalize, verifyAuditChain).
