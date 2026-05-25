import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { SetupConfig, GeneratedFile, UserProfile } from '../../types/index.js';

/**
 * v3.3 — RAG scaffold generator (industry-agnostic).
 *
 * Emits a small runnable retrieval-augmented-generation application
 * under `rag/` plus a root-level `RAG_RUNBOOK.md` and one or more
 * path-scoped compliance rules under `.claude/rules/rag-*.md`.
 *
 * Industry-aware content selection:
 *   - **Chunker**: healthcare profiles get the FHIR-aware variant
 *     that preserves resource boundaries (`Patient`, `Observation`,
 *     etc.); all other industries get plain-text chunking.
 *   - **Compliance rules**: one rule file emitted per active
 *     framework on `profile.complianceFrameworks` — `rag-hipaa-`,
 *     `rag-pci-`, `rag-soc2-`, `rag-ferpa-compliance.md`. Profiles
 *     with no regulated frameworks get a single `rag-conventions.md`
 *     baseline.
 *   - **Runbook**: language + checklist adapt to the active
 *     industry and frameworks.
 *
 * Gating:
 *   - `profile.localAiEnabled === true` (RAG only makes sense with a
 *     local embedder).
 *   - The active targets include `RAG_SCAFFOLD`.
 *
 * The healthcare case is no longer special at the target-format
 * level. It is the most concrete content variant.
 *
 * Language: TypeScript by default. Python equivalents emit when the
 * profile lists Python but not TypeScript.
 */
export class RagScaffoldGenerator implements ConfigGenerator {
  name = 'rag-scaffold';
  target = TargetFormat.RAG_SCAFFOLD;

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    if (!shouldEmitRagScaffold(profile)) return [];

    const pythonOnly =
      profile.languages.includes('python') && !profile.languages.includes('typescript');

    const scaffoldFiles = pythonOnly
      ? this.emitPythonScaffold(profile)
      : this.emitTypeScriptScaffold(profile);
    const ruleFiles = this.emitComplianceRules(profile);

    return [...scaffoldFiles, ...ruleFiles];
  }

  // ─── TypeScript scaffold (default) ────────────────────────────────────

  private emitTypeScriptScaffold(profile: UserProfile): GeneratedFile[] {
    return [
      {
        relativePath: 'rag/README.md',
        content: tsReadme(profile),
        description: 'RAG scaffold — overview + smoke test (rag/README.md)',
      },
      {
        relativePath: 'rag/package.json',
        content: tsPackageJson(),
        description: 'RAG scaffold — deps + run scripts (rag/package.json)',
      },
      {
        relativePath: 'rag/.env.example',
        content: envExample(profile),
        description: 'RAG scaffold — env-var template (rag/.env.example)',
      },
      {
        relativePath: 'rag/src/chunker.ts',
        content: tsChunker(profile),
        description: chunkerDescription(profile, 'rag/src/chunker.ts'),
      },
      {
        relativePath: 'rag/src/embedder.ts',
        content: tsEmbedder(),
        description: 'RAG scaffold — Ollama embeddings (rag/src/embedder.ts)',
      },
      {
        relativePath: 'rag/src/store.ts',
        content: tsStore(),
        description: 'RAG scaffold — SQLite-VSS store (rag/src/store.ts)',
      },
      {
        relativePath: 'rag/src/audit.ts',
        content: tsAudit(profile),
        description: 'RAG scaffold — retrieval audit log (rag/src/audit.ts)',
      },
      {
        relativePath: 'rag/src/cli.ts',
        content: tsCli(profile),
        description: 'RAG scaffold — index + query CLI (rag/src/cli.ts)',
      },
      {
        relativePath: 'RAG_RUNBOOK.md',
        content: runbook(profile, 'typescript'),
        description: 'RAG runbook — setup, smoke test, compliance notes (RAG_RUNBOOK.md)',
      },
    ];
  }

  // ─── Python scaffold ──────────────────────────────────────────────────

  private emitPythonScaffold(profile: UserProfile): GeneratedFile[] {
    return [
      {
        relativePath: 'rag/README.md',
        content: pyReadme(profile),
        description: 'RAG scaffold — overview + smoke test (rag/README.md)',
      },
      {
        relativePath: 'rag/pyproject.toml',
        content: pyProjectToml(),
        description: 'RAG scaffold — deps + run scripts (rag/pyproject.toml)',
      },
      {
        relativePath: 'rag/.env.example',
        content: envExample(profile),
        description: 'RAG scaffold — env-var template (rag/.env.example)',
      },
      {
        relativePath: 'rag/src/chunker.py',
        content: pyChunker(profile),
        description: chunkerDescription(profile, 'rag/src/chunker.py'),
      },
      {
        relativePath: 'rag/src/embedder.py',
        content: pyEmbedder(),
        description: 'RAG scaffold — Ollama embeddings (rag/src/embedder.py)',
      },
      {
        relativePath: 'rag/src/store.py',
        content: pyStore(),
        description: 'RAG scaffold — SQLite-VSS store (rag/src/store.py)',
      },
      {
        relativePath: 'rag/src/audit.py',
        content: pyAudit(profile),
        description: 'RAG scaffold — retrieval audit log (rag/src/audit.py)',
      },
      {
        relativePath: 'rag/src/cli.py',
        content: pyCli(profile),
        description: 'RAG scaffold — index + query CLI (rag/src/cli.py)',
      },
      {
        relativePath: 'RAG_RUNBOOK.md',
        content: runbook(profile, 'python'),
        description: 'RAG runbook — setup, smoke test, compliance notes (RAG_RUNBOOK.md)',
      },
    ];
  }

  // ─── Per-framework rule files ─────────────────────────────────────────

  private emitComplianceRules(profile: UserProfile): GeneratedFile[] {
    const frameworks = profile.complianceFrameworks;
    const rules: GeneratedFile[] = [];

    if (frameworks.includes('hipaa')) {
      rules.push({
        relativePath: '.claude/rules/rag-hipaa-compliance.md',
        content: ragHipaaRule(),
        description: 'HIPAA RAG rule (path-scoped to rag/**)',
      });
    }
    if (frameworks.includes('pci')) {
      rules.push({
        relativePath: '.claude/rules/rag-pci-compliance.md',
        content: ragPciRule(),
        description: 'PCI-DSS RAG rule (path-scoped to rag/**)',
      });
    }
    if (frameworks.includes('soc2')) {
      rules.push({
        relativePath: '.claude/rules/rag-soc2-compliance.md',
        content: ragSoc2Rule(),
        description: 'SOC 2 RAG rule (path-scoped to rag/**)',
      });
    }
    if (frameworks.includes('ferpa')) {
      rules.push({
        relativePath: '.claude/rules/rag-ferpa-compliance.md',
        content: ragFerpaRule(),
        description: 'FERPA RAG rule (path-scoped to rag/**)',
      });
    }
    if (rules.length === 0) {
      rules.push({
        relativePath: '.claude/rules/rag-conventions.md',
        content: ragConventionsRule(),
        description: 'Generic RAG conventions (path-scoped to rag/**)',
      });
    }
    return rules;
  }
}

/** Exposed for tests. RAG ships whenever the user has opted into local AI. */
export function shouldEmitRagScaffold(profile: UserProfile): boolean {
  return profile.localAiEnabled === true;
}

/** Exposed for tests. */
export function isFhirChunker(profile: UserProfile): boolean {
  return profile.industry === 'healthcare';
}

function chunkerDescription(profile: UserProfile, path: string): string {
  return isFhirChunker(profile)
    ? `RAG scaffold — FHIR-aware chunker (${path})`
    : `RAG scaffold — plain-text chunker (${path})`;
}

// ─── TypeScript scaffold content ──────────────────────────────────────────

function tsReadme(profile: UserProfile): string {
  const intro = isFhirChunker(profile)
    ? `A HIPAA-aware retrieval pipeline scaffolded for the **${profile.businessDomain || 'project'}**. ` +
      `FHIR-aware chunker preserves resource boundaries; everything else runs against local Ollama models.`
    : `A retrieval-augmented-generation scaffold for the **${profile.businessDomain || 'project'}**. ` +
      `Runs entirely on local Ollama models — no embeddings or retrieval data leaves the workstation.`;

  return `# RAG (TypeScript)

${intro}

> **Read [RAG_RUNBOOK.md](../RAG_RUNBOOK.md) at the project root
> first.** It covers the compliance obligations relevant to your
> profile, the smoke test, and the production-hardening checklist.

## Quick start

\`\`\`bash
cp rag/.env.example rag/.env
# edit rag/.env to set OLLAMA_HOST + audit log path

cd rag && npm install

# Index a directory of source documents
npx tsx src/cli.ts index ./sample-corpus

# Query
npx tsx src/cli.ts query "your question here"
\`\`\`

## Files

| File | Purpose |
|---|---|
| \`src/chunker.ts\` | ${isFhirChunker(profile) ? 'FHIR-aware chunker — preserves Patient / Observation / Encounter resource boundaries' : 'Plain-text chunker — paragraph + soft-cap splitting'} |
| \`src/embedder.ts\` | Calls local Ollama \`nomic-embed-text\` for vectors |
| \`src/store.ts\` | SQLite-VSS vector store |
| \`src/audit.ts\` | Per-query audit log (query hash, retrieved IDs, never raw content) |
| \`src/cli.ts\` | \`index <dir>\` and \`query <text>\` commands |

See \`RAG_RUNBOOK.md\` for compliance obligations and production
hardening before any sensitive data flows through this scaffold.
`;
}

function tsPackageJson(): string {
  const pkg = {
    name: 'rag',
    version: '0.1.0',
    private: true,
    type: 'module',
    description: 'Local-AI RAG pipeline (scaffolded by EmbedIQ)',
    scripts: {
      index: 'tsx src/cli.ts index',
      query: 'tsx src/cli.ts query',
      test: 'echo "see RAG_RUNBOOK.md for the smoke test"',
    },
    dependencies: {
      'better-sqlite3': '^11.0.0',
      'sqlite-vss': '^0.1.2',
      ollama: '^0.5.0',
    },
    devDependencies: {
      tsx: '^4.0.0',
      typescript: '^5.4.0',
    },
  };
  return JSON.stringify(pkg, null, 2) + '\n';
}

function envExample(profile: UserProfile): string {
  const headerNote = profile.complianceFrameworks.length > 0
    ? `# Active compliance frameworks: ${profile.complianceFrameworks.join(', ')}.\n` +
      `# Treat this file as sensitive — secret values get checked in to .env (gitignored),\n` +
      `# not committed templates.`
    : `# Copy to .env and fill in. NEVER commit .env to source control.`;

  return `# RAG environment template
${headerNote}

# Ollama runtime — local-only by default.
OLLAMA_HOST=http://localhost:11434

# Embedding model. nomic-embed-text is the default; any local Ollama
# embedding model with a 768-dim output works without code changes.
OLLAMA_EMBED_MODEL=nomic-embed-text

# SQLite-VSS database file. Encrypt the filesystem this lives on
# (LUKS / FileVault / BitLocker / EBS encryption) for any deployment
# carrying regulated data.
RAG_DB_PATH=./rag.db

# Audit log path. JSONL, append-only. Rotate via logrotate.
RAG_AUDIT_LOG_PATH=./rag-audit.jsonl

# Per-deployment HMAC secret used to hash query strings in the audit
# log so we have traceability without exposing raw content.
# Generate with: openssl rand -hex 32
RAG_QUERY_HASH_KEY=

# Top-K results to return on each query. Tune per use case.
RAG_TOP_K=8
`;
}

function tsChunker(profile: UserProfile): string {
  if (isFhirChunker(profile)) return tsChunkerFhir();
  return tsChunkerPlainText();
}

function tsChunkerFhir(): string {
  return `/**
 * FHIR-aware chunker. Splits a clinical document into retrieval units
 * while preserving FHIR resource boundaries — a chunk never spans
 * across Patient / Encounter / Observation resources, so a downstream
 * filter can apply per-resource access control.
 *
 * For non-FHIR text (clinical notes, discharge summaries), falls back
 * to paragraph-and-sentence splitting with a soft 512-token cap.
 */

export interface Chunk {
  /** Stable identifier — opaque to the chunk content (UUID or hash). */
  id: string;
  /** Source identifier (filename, FHIR resource id, etc.). */
  sourceId: string;
  /** Resource type when known: 'Patient' | 'Observation' | ... */
  resourceType?: string;
  /** The chunk text. Never includes raw identifiers reconstructable to a patient. */
  text: string;
  /** Token-level offsets — useful for spans-in-context highlighting. */
  startOffset: number;
  endOffset: number;
}

const SOFT_CAP_TOKENS = 512;
const APPROX_CHARS_PER_TOKEN = 4;

export function chunkFhirBundle(bundle: { entry?: Array<{ resource?: unknown }> }, sourceId: string): Chunk[] {
  const out: Chunk[] = [];
  const entries = bundle.entry ?? [];
  for (const entry of entries) {
    const resource = entry.resource as { resourceType?: string } | undefined;
    if (!resource) continue;
    const text = JSON.stringify(resource);
    out.push({
      id: hashChunk(sourceId, out.length, text),
      sourceId,
      resourceType: resource.resourceType,
      text,
      startOffset: 0,
      endOffset: text.length,
    });
  }
  return out;
}

export function chunkPlainText(text: string, sourceId: string): Chunk[] {
  const cap = SOFT_CAP_TOKENS * APPROX_CHARS_PER_TOKEN;
  const paragraphs = text.split(/\\n{2,}/g);
  const out: Chunk[] = [];
  let offset = 0;
  let buf = '';
  for (const p of paragraphs) {
    if ((buf + '\\n\\n' + p).length > cap && buf.length > 0) {
      out.push({
        id: hashChunk(sourceId, out.length, buf),
        sourceId,
        text: buf,
        startOffset: offset - buf.length,
        endOffset: offset,
      });
      buf = p;
    } else {
      buf = buf ? buf + '\\n\\n' + p : p;
    }
    offset += p.length + 2;
  }
  if (buf.length > 0) {
    out.push({
      id: hashChunk(sourceId, out.length, buf),
      sourceId,
      text: buf,
      startOffset: offset - buf.length,
      endOffset: offset,
    });
  }
  return out;
}

function hashChunk(sourceId: string, idx: number, text: string): string {
  let h = 0;
  const seed = \`\${sourceId}#\${idx}#\${text.length}\`;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return \`chunk-\${idx.toString(36)}-\${(h >>> 0).toString(36)}\`;
}
`;
}

function tsChunkerPlainText(): string {
  return `/**
 * Plain-text chunker. Splits documents into retrieval units via
 * paragraph + soft-cap splitting. Replace with a format-aware variant
 * (FHIR, legal-case-aware, code-aware) when the source corpus
 * justifies it.
 */

export interface Chunk {
  /** Stable identifier — opaque to the chunk content. */
  id: string;
  /** Source identifier (filename, document id, etc.). */
  sourceId: string;
  /** The chunk text. */
  text: string;
  /** Char-offset start in the source document. */
  startOffset: number;
  endOffset: number;
}

const SOFT_CAP_TOKENS = 512;
const APPROX_CHARS_PER_TOKEN = 4;

export function chunkPlainText(text: string, sourceId: string): Chunk[] {
  const cap = SOFT_CAP_TOKENS * APPROX_CHARS_PER_TOKEN;
  const paragraphs = text.split(/\\n{2,}/g);
  const out: Chunk[] = [];
  let offset = 0;
  let buf = '';
  for (const p of paragraphs) {
    if ((buf + '\\n\\n' + p).length > cap && buf.length > 0) {
      out.push({
        id: hashChunk(sourceId, out.length, buf),
        sourceId,
        text: buf,
        startOffset: offset - buf.length,
        endOffset: offset,
      });
      buf = p;
    } else {
      buf = buf ? buf + '\\n\\n' + p : p;
    }
    offset += p.length + 2;
  }
  if (buf.length > 0) {
    out.push({
      id: hashChunk(sourceId, out.length, buf),
      sourceId,
      text: buf,
      startOffset: offset - buf.length,
      endOffset: offset,
    });
  }
  return out;
}

function hashChunk(sourceId: string, idx: number, text: string): string {
  let h = 0;
  const seed = \`\${sourceId}#\${idx}#\${text.length}\`;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return \`chunk-\${idx.toString(36)}-\${(h >>> 0).toString(36)}\`;
}
`;
}

function tsEmbedder(): string {
  return `/**
 * Ollama embedder — wraps the local Ollama HTTP API. All calls stay
 * on-host by default (OLLAMA_HOST defaults to http://localhost:11434).
 */

import { Ollama } from 'ollama';

const host = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
const model = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';
const client = new Ollama({ host });

export async function embed(text: string): Promise<Float32Array> {
  const res = await client.embeddings({ model, prompt: text });
  return new Float32Array(res.embedding);
}

export async function embedBatch(texts: readonly string[]): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  for (const t of texts) out.push(await embed(t));
  return out;
}

export function embeddingDim(): number {
  return 768; // nomic-embed-text default; override here if you swap models.
}
`;
}

function tsStore(): string {
  return `/**
 * SQLite-VSS-backed vector store.
 *
 * Schema keeps the embedding (in a VSS virtual table) separate from
 * chunk metadata so the embedding column can be dropped without
 * losing audit-relevant fields.
 */

import Database from 'better-sqlite3';
import * as sqliteVss from 'sqlite-vss';
import type { Chunk } from './chunker.js';
import { embeddingDim } from './embedder.js';

const DB_PATH = process.env.RAG_DB_PATH ?? './rag.db';
const TOP_K_DEFAULT = Number.parseInt(process.env.RAG_TOP_K ?? '8', 10);

export interface RetrievedChunk {
  id: string;
  sourceId: string;
  text: string;
  distance: number;
  resourceType?: string;
}

export class RagStore {
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    this.db = new Database(dbPath);
    sqliteVss.load(this.db);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(
      \`CREATE TABLE IF NOT EXISTS chunks (
         id          TEXT PRIMARY KEY,
         source_id   TEXT NOT NULL,
         resource    TEXT,
         text        TEXT NOT NULL,
         created_at  TEXT NOT NULL DEFAULT (datetime('now'))
       );

       CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vss0(
         embedding(\${embeddingDim()})
       );

       CREATE TABLE IF NOT EXISTS chunk_vector_map (
         chunk_id   TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
         rowid      INTEGER NOT NULL
       );\`,
    );
  }

  insert(chunk: Chunk & { resourceType?: string }, embedding: Float32Array): void {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(\`INSERT OR REPLACE INTO chunks (id, source_id, resource, text) VALUES (?, ?, ?, ?)\`)
        .run(chunk.id, chunk.sourceId, chunk.resourceType ?? null, chunk.text);

      const result = this.db
        .prepare(\`INSERT INTO chunk_vectors (embedding) VALUES (?)\`)
        .run(Buffer.from(embedding.buffer));

      this.db
        .prepare(\`INSERT OR REPLACE INTO chunk_vector_map (chunk_id, rowid) VALUES (?, ?)\`)
        .run(chunk.id, result.lastInsertRowid);
    });
    tx();
  }

  search(queryEmbedding: Float32Array, topK: number = TOP_K_DEFAULT): RetrievedChunk[] {
    const rows = this.db
      .prepare(
        \`SELECT c.id, c.source_id, c.resource, c.text, v.distance
         FROM (
           SELECT rowid, distance FROM chunk_vectors
           WHERE vss_search(embedding, ?)
           LIMIT ?
         ) v
         JOIN chunk_vector_map m ON m.rowid = v.rowid
         JOIN chunks c ON c.id = m.chunk_id
         ORDER BY v.distance ASC\`,
      )
      .all(Buffer.from(queryEmbedding.buffer), topK) as Array<{
        id: string;
        source_id: string;
        resource: string | null;
        text: string;
        distance: number;
      }>;

    return rows.map((r) => ({
      id: r.id,
      sourceId: r.source_id,
      resourceType: r.resource ?? undefined,
      text: r.text,
      distance: r.distance,
    }));
  }

  close(): void {
    this.db.close();
  }
}
`;
}

function tsAudit(profile: UserProfile): string {
  const hashNote = profile.complianceFrameworks.length > 0
    ? `// Compliance frameworks active: ${profile.complianceFrameworks.join(', ')}.\n` +
      `// The hash key MUST be set in production — never let the dev fallback ship.`
    : `// Hash queries to keep traceability without exposing raw content.`;

  return `/**
 * Retrieval audit logger. Writes one JSONL entry per query with
 * { timestamp, queryHash, retrievedIds, userId, model }.
 *
 * Never writes raw query text or retrieved chunk content — the query
 * is hashed with a per-deployment HMAC key (RAG_QUERY_HASH_KEY) for
 * traceability without exposure.
${hashNote}
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
    appendFileSync(LOG_PATH, line + '\\n', 'utf-8');
  } catch (err) {
    console.error('[rag-audit] write failed:', err);
  }
}
`;
}

function tsCli(profile: UserProfile): string {
  const fhirImport = isFhirChunker(profile)
    ? `import { chunkFhirBundle, chunkPlainText, type Chunk } from './chunker.js';`
    : `import { chunkPlainText, type Chunk } from './chunker.js';`;
  const chunkChoice = isFhirChunker(profile)
    ? `file.endsWith('.fhir.json') || isFhirBundle(text)\n      ? chunkFhirBundle(JSON.parse(text), basename(file))\n      : chunkPlainText(text, basename(file));`
    : `chunkPlainText(text, basename(file));`;
  const fhirHelper = isFhirChunker(profile)
    ? `\nfunction isFhirBundle(text: string): boolean {\n  try {\n    const obj = JSON.parse(text);\n    return obj && typeof obj === 'object' && obj.resourceType === 'Bundle';\n  } catch {\n    return false;\n  }\n}\n`
    : ``;

  return `#!/usr/bin/env tsx
/**
 * CLI entry point for the RAG scaffold.
 *
 *   tsx src/cli.ts index <dir>           index every file under <dir>
 *   tsx src/cli.ts query <text>          retrieve top-K chunks for <text>
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, basename } from 'node:path';
${fhirImport}
import { embed, embedBatch } from './embedder.js';
import { RagStore } from './store.js';
import { logRetrieval } from './audit.js';

async function indexDir(dir: string): Promise<void> {
  const store = new RagStore();
  const files = walk(dir);
  console.log(\`Indexing \${files.length} file(s) from \${dir}\`);

  for (const file of files) {
    const text = readFileSync(file, 'utf-8');
    const chunks: Chunk[] = ${chunkChoice}

    const embeddings = await embedBatch(chunks.map((c) => c.text));
    for (let i = 0; i < chunks.length; i++) {
      store.insert(chunks[i], embeddings[i]);
    }
    console.log(\`  ✓ \${file}  (\${chunks.length} chunks)\`);
  }
  store.close();
}

async function query(text: string): Promise<void> {
  if (!text) throw new Error('query requires a non-empty argument');
  const store = new RagStore();
  const queryEmbedding = await embed(text);
  const results = store.search(queryEmbedding);
  const userId = process.env.USER ?? 'unknown';
  const model = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';

  logRetrieval({
    query: text,
    userId,
    model,
    retrievedIds: results.map((r) => r.id),
  });

  for (const r of results) {
    console.log(\`[\${r.distance.toFixed(4)}] \${r.id}  src=\${r.sourceId}\${r.resourceType ? ' type=' + r.resourceType : ''}\`);
    console.log(\`  \${r.text.slice(0, 200).replace(/\\s+/g, ' ')}\${r.text.length > 200 ? '…' : ''}\`);
  }
  store.close();
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (['.json', '.txt', '.md'].includes(extname(p))) out.push(p);
  }
  return out;
}
${fhirHelper}
const [, , cmd, ...args] = process.argv;
const handlers: Record<string, () => Promise<void>> = {
  index: () => indexDir(args[0]),
  query: () => query(args.join(' ')),
};
const handler = handlers[cmd];
if (!handler) {
  console.error('usage: tsx src/cli.ts <index <dir> | query <text>>');
  process.exit(2);
}
handler().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;
}

// ─── Python scaffold content ──────────────────────────────────────────────

function pyReadme(profile: UserProfile): string {
  const intro = isFhirChunker(profile)
    ? `A HIPAA-aware retrieval pipeline scaffolded for the **${profile.businessDomain || 'project'}**. ` +
      `FHIR-aware chunker preserves resource boundaries.`
    : `A retrieval-augmented-generation scaffold for the **${profile.businessDomain || 'project'}**.`;

  return `# RAG (Python)

${intro} Runs entirely on local Ollama models — no embeddings or
retrieval data leaves the workstation by default.

> **Read [RAG_RUNBOOK.md](../RAG_RUNBOOK.md) at the project root
> first.** It covers compliance obligations for your profile, the
> smoke test, and the production-hardening checklist.

## Quick start

\`\`\`bash
cp rag/.env.example rag/.env
# edit rag/.env to set OLLAMA_HOST + audit log path

cd rag && pip install -e .

# Index a directory of source documents
python -m src.cli index ./sample-corpus

# Query
python -m src.cli query "your question here"
\`\`\`

See \`pyproject.toml\` for the (small) dependency set.
`;
}

function pyProjectToml(): string {
  return `[project]
name = "rag"
version = "0.1.0"
description = "Local-AI RAG pipeline (scaffolded by EmbedIQ)"
requires-python = ">=3.10"
dependencies = [
    "ollama>=0.4.0",
    "sqlite-vss>=0.1.2",
    "python-dotenv>=1.0.0",
]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["src*"]
`;
}

function pyChunker(profile: UserProfile): string {
  if (isFhirChunker(profile)) return pyChunkerFhir();
  return pyChunkerPlainText();
}

function pyChunkerFhir(): string {
  return `"""FHIR-aware chunker. See chunker.ts for the design rationale —
this is a faithful port.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Optional


SOFT_CAP_TOKENS = 512
APPROX_CHARS_PER_TOKEN = 4


@dataclass(frozen=True)
class Chunk:
    id: str
    source_id: str
    resource_type: Optional[str]
    text: str
    start_offset: int
    end_offset: int


def chunk_fhir_bundle(bundle: dict, source_id: str) -> list[Chunk]:
    out: list[Chunk] = []
    for idx, entry in enumerate(bundle.get("entry", [])):
        resource = entry.get("resource")
        if not resource:
            continue
        text = json.dumps(resource, sort_keys=True)
        out.append(
            Chunk(
                id=_hash_chunk(source_id, idx, text),
                source_id=source_id,
                resource_type=resource.get("resourceType"),
                text=text,
                start_offset=0,
                end_offset=len(text),
            )
        )
    return out


def chunk_plain_text(text: str, source_id: str) -> list[Chunk]:
    cap = SOFT_CAP_TOKENS * APPROX_CHARS_PER_TOKEN
    paragraphs = [p for p in text.split("\\n\\n") if p]
    out: list[Chunk] = []
    offset = 0
    buf = ""

    for p in paragraphs:
        candidate = (buf + "\\n\\n" + p) if buf else p
        if len(candidate) > cap and buf:
            out.append(
                Chunk(
                    id=_hash_chunk(source_id, len(out), buf),
                    source_id=source_id,
                    resource_type=None,
                    text=buf,
                    start_offset=offset - len(buf),
                    end_offset=offset,
                )
            )
            buf = p
        else:
            buf = candidate
        offset += len(p) + 2

    if buf:
        out.append(
            Chunk(
                id=_hash_chunk(source_id, len(out), buf),
                source_id=source_id,
                resource_type=None,
                text=buf,
                start_offset=offset - len(buf),
                end_offset=offset,
            )
        )

    return out


def _hash_chunk(source_id: str, idx: int, text: str) -> str:
    seed = f"{source_id}#{idx}#{len(text)}".encode("utf-8")
    h = hashlib.sha1(seed).hexdigest()[:8]
    return f"chunk-{idx:x}-{h}"
`;
}

function pyChunkerPlainText(): string {
  return `"""Plain-text chunker. Paragraph + soft-cap splitting."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass


SOFT_CAP_TOKENS = 512
APPROX_CHARS_PER_TOKEN = 4


@dataclass(frozen=True)
class Chunk:
    id: str
    source_id: str
    text: str
    start_offset: int
    end_offset: int


def chunk_plain_text(text: str, source_id: str) -> list[Chunk]:
    cap = SOFT_CAP_TOKENS * APPROX_CHARS_PER_TOKEN
    paragraphs = [p for p in text.split("\\n\\n") if p]
    out: list[Chunk] = []
    offset = 0
    buf = ""

    for p in paragraphs:
        candidate = (buf + "\\n\\n" + p) if buf else p
        if len(candidate) > cap and buf:
            out.append(
                Chunk(
                    id=_hash_chunk(source_id, len(out), buf),
                    source_id=source_id,
                    text=buf,
                    start_offset=offset - len(buf),
                    end_offset=offset,
                )
            )
            buf = p
        else:
            buf = candidate
        offset += len(p) + 2

    if buf:
        out.append(
            Chunk(
                id=_hash_chunk(source_id, len(out), buf),
                source_id=source_id,
                text=buf,
                start_offset=offset - len(buf),
                end_offset=offset,
            )
        )

    return out


def _hash_chunk(source_id: str, idx: int, text: str) -> str:
    seed = f"{source_id}#{idx}#{len(text)}".encode("utf-8")
    h = hashlib.sha1(seed).hexdigest()[:8]
    return f"chunk-{idx:x}-{h}"
`;
}

function pyEmbedder(): string {
  return `"""Local Ollama embedder."""
from __future__ import annotations

import os
from ollama import Client

_host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
_model = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")
_client = Client(host=_host)


def embed(text: str) -> list[float]:
    res = _client.embeddings(model=_model, prompt=text)
    return list(res["embedding"])


def embed_batch(texts: list[str]) -> list[list[float]]:
    return [embed(t) for t in texts]


def embedding_dim() -> int:
    return 768
`;
}

function pyStore(): string {
  return `"""SQLite-VSS-backed vector store."""
from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass
from typing import Optional

import sqlite_vss

from .chunker import Chunk
from .embedder import embedding_dim


_DB_PATH = os.environ.get("RAG_DB_PATH", "./rag.db")
_TOP_K_DEFAULT = int(os.environ.get("RAG_TOP_K", "8"))


@dataclass(frozen=True)
class RetrievedChunk:
    id: str
    source_id: str
    resource_type: Optional[str]
    text: str
    distance: float


class RagStore:
    def __init__(self, db_path: str = _DB_PATH) -> None:
        self.db = sqlite3.connect(db_path)
        self.db.enable_load_extension(True)
        sqlite_vss.load(self.db)

        self.db.execute("PRAGMA journal_mode = WAL")
        self.db.execute("PRAGMA synchronous = NORMAL")
        self.db.execute("PRAGMA foreign_keys = ON")

        self.db.executescript(
            f\"\"\"
            CREATE TABLE IF NOT EXISTS chunks (
                id         TEXT PRIMARY KEY,
                source_id  TEXT NOT NULL,
                resource   TEXT,
                text       TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vss0(
                embedding({embedding_dim()})
            );

            CREATE TABLE IF NOT EXISTS chunk_vector_map (
                chunk_id TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
                rowid    INTEGER NOT NULL
            );
            \"\"\"
        )
        self.db.commit()

    def insert(self, chunk: Chunk, embedding: list[float]) -> None:
        cur = self.db.cursor()
        resource_type = getattr(chunk, "resource_type", None)
        cur.execute(
            "INSERT OR REPLACE INTO chunks (id, source_id, resource, text) VALUES (?, ?, ?, ?)",
            (chunk.id, chunk.source_id, resource_type, chunk.text),
        )
        cur.execute(
            "INSERT INTO chunk_vectors (embedding) VALUES (?)",
            (json.dumps(embedding),),
        )
        rowid = cur.lastrowid
        cur.execute(
            "INSERT OR REPLACE INTO chunk_vector_map (chunk_id, rowid) VALUES (?, ?)",
            (chunk.id, rowid),
        )
        self.db.commit()

    def search(self, query_embedding: list[float], top_k: int = _TOP_K_DEFAULT) -> list[RetrievedChunk]:
        cur = self.db.execute(
            \"\"\"
            SELECT c.id, c.source_id, c.resource, c.text, v.distance
            FROM (
                SELECT rowid, distance FROM chunk_vectors
                WHERE vss_search(embedding, ?)
                LIMIT ?
            ) v
            JOIN chunk_vector_map m ON m.rowid = v.rowid
            JOIN chunks c ON c.id = m.chunk_id
            ORDER BY v.distance ASC
            \"\"\",
            (json.dumps(query_embedding), top_k),
        )
        return [
            RetrievedChunk(
                id=row[0],
                source_id=row[1],
                resource_type=row[2],
                text=row[3],
                distance=float(row[4]),
            )
            for row in cur.fetchall()
        ]

    def close(self) -> None:
        self.db.close()
`;
}

function pyAudit(_profile: UserProfile): string {
  return `"""Retrieval audit logger — never writes raw query or chunk content."""
from __future__ import annotations

import hmac
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from typing import Iterable


_LOG_PATH = os.environ.get("RAG_AUDIT_LOG_PATH", "./rag-audit.jsonl")
_HASH_KEY = os.environ.get("RAG_QUERY_HASH_KEY", "")

if not _HASH_KEY:
    print(
        "[rag-audit] RAG_QUERY_HASH_KEY is unset — using a static fallback. "
        "Set it before any sensitive data flows through this pipeline.",
        file=sys.stderr,
    )


def log_retrieval(query: str, user_id: str, model: str, retrieved_ids: Iterable[str]) -> None:
    key = (_HASH_KEY or "dev-fallback-do-not-ship").encode("utf-8")
    query_hash = hmac.new(key, query.encode("utf-8"), hashlib.sha256).hexdigest()
    ids = list(retrieved_ids)
    line = json.dumps(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "queryHash": query_hash,
            "userId": user_id,
            "model": model,
            "retrievedIds": ids,
            "retrievedCount": len(ids),
        }
    )
    try:
        with open(_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\\n")
    except OSError as err:
        print(f"[rag-audit] write failed: {err}", file=sys.stderr)
`;
}

function pyCli(profile: UserProfile): string {
  const fhirImports = isFhirChunker(profile)
    ? `from .chunker import Chunk, chunk_fhir_bundle, chunk_plain_text`
    : `from .chunker import Chunk, chunk_plain_text`;
  const fhirChunkChoice = isFhirChunker(profile)
    ? `if path.name.endswith(".fhir.json") or _is_fhir_bundle(text):\n            chunks = chunk_fhir_bundle(json.loads(text), path.name)\n        else:\n            chunks = chunk_plain_text(text, path.name)`
    : `chunks = chunk_plain_text(text, path.name)`;
  const fhirHelper = isFhirChunker(profile)
    ? `\n\ndef _is_fhir_bundle(text: str) -> bool:\n    try:\n        obj = json.loads(text)\n    except json.JSONDecodeError:\n        return False\n    return isinstance(obj, dict) and obj.get("resourceType") == "Bundle"`
    : ``;

  return `"""Python CLI for the RAG scaffold."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

${fhirImports}
from .embedder import embed, embed_batch
from .store import RagStore
from .audit import log_retrieval


def index_dir(directory: str) -> None:
    store = RagStore()
    files = _walk(directory)
    print(f"Indexing {len(files)} file(s) from {directory}")

    for path in files:
        text = path.read_text(encoding="utf-8")
        chunks: list[Chunk]
        ${fhirChunkChoice}
        embeddings = embed_batch([c.text for c in chunks])
        for chunk, vec in zip(chunks, embeddings):
            store.insert(chunk, vec)
        print(f"  ✓ {path}  ({len(chunks)} chunks)")
    store.close()


def query(text: str) -> None:
    if not text:
        raise SystemExit("query requires a non-empty argument")
    store = RagStore()
    vec = embed(text)
    results = store.search(vec)
    user_id = os.environ.get("USER", "unknown")
    model = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")
    log_retrieval(text, user_id, model, [r.id for r in results])

    for r in results:
        preview = r.text[:200].replace("\\n", " ")
        rt = f" type={r.resource_type}" if r.resource_type else ""
        print(f"[{r.distance:.4f}] {r.id}  src={r.source_id}{rt}")
        print(f"  {preview}{'…' if len(r.text) > 200 else ''}")
    store.close()


def _walk(directory: str) -> list[Path]:
    out: list[Path] = []
    for path in Path(directory).rglob("*"):
        if path.suffix in {".json", ".txt", ".md"} and path.is_file():
            out.append(path)
    return out${fhirHelper}


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python -m src.cli <index <dir> | query <text>>", file=sys.stderr)
        return 2
    cmd, *args = sys.argv[1:]
    if cmd == "index":
        index_dir(args[0])
    elif cmd == "query":
        query(" ".join(args))
    else:
        print("usage: python -m src.cli <index <dir> | query <text>>", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;
}

// ─── Industry-aware runbook ───────────────────────────────────────────────

function runbook(profile: UserProfile, lang: 'typescript' | 'python'): string {
  const installCmd = lang === 'python'
    ? 'cd rag && pip install -e .'
    : 'cd rag && npm install';
  const indexCmd = lang === 'python'
    ? 'python -m src.cli index ./sample-corpus'
    : 'npx tsx src/cli.ts index ./sample-corpus';
  const queryCmd = lang === 'python'
    ? 'python -m src.cli query "your question here"'
    : 'npx tsx src/cli.ts query "your question here"';

  const obligations = complianceObligationsBlock(profile);
  const hardening = productionHardeningBlock(profile);

  return `# RAG Runbook

EmbedIQ generated a retrieval-augmented-generation scaffold for
**${profile.businessDomain || 'this project'}**. This runbook covers
setup, the smoke test, the compliance obligations relevant to your
profile, and the production-hardening checklist.

The scaffold runs entirely on local Ollama models by default — no
embeddings or retrieval data leaves the workstation unless you
explicitly point \`OLLAMA_HOST\` somewhere else.

## Prerequisites

- **Ollama** installed and running locally. See \`OLLAMA_SETUP.md\`
  for the install runbook generated alongside this scaffold.
- The \`nomic-embed-text\` model pulled: \`ollama pull nomic-embed-text\`.
- A generated HMAC secret for query-hash audit: \`openssl rand -hex 32\`.

## Setup

\`\`\`bash
cp rag/.env.example rag/.env
$EDITOR rag/.env
# Set: OLLAMA_HOST (defaults to http://localhost:11434)
#      OLLAMA_EMBED_MODEL (defaults to nomic-embed-text)
#      RAG_DB_PATH (defaults to ./rag.db)
#      RAG_AUDIT_LOG_PATH (defaults to ./rag-audit.jsonl)
#      RAG_QUERY_HASH_KEY (REQUIRED — generate with openssl rand -hex 32)
#      RAG_TOP_K (defaults to 8)

${installCmd}
\`\`\`

## Smoke test

\`\`\`bash
mkdir -p sample-corpus
# (drop a few documents here — the scaffold accepts .json, .txt, .md)

# Index
${indexCmd}

# Query
${queryCmd}
\`\`\`

The retrieval is logged to \`rag-audit.jsonl\` — inspect with \`jq\` to
confirm only \`queryHash\`, \`userId\`, \`model\`, and \`retrievedIds\`
are recorded (never the raw query text).

${obligations}

${hardening}

## What this scaffold is *not*

- **Not a multi-tenant retrieval service.** Single-tenant by design;
  add multi-tenant scoping yourself.
- **Not a production de-identification pipeline.** Use a real
  de-identification step if your data needs it.
- **Not opinionated about the LLM step.** The scaffold ends at
  retrieval. How you compose retrieved chunks into an LLM prompt is
  intentionally yours to design.

## Troubleshooting

- **\`Could not connect to Ollama\`** — confirm \`ollama serve\` is
  running. \`curl http://localhost:11434/api/tags\` should return a
  non-empty model list.
- **\`Module not found: sqlite-vss\`** — sqlite-vss ships native
  binaries; re-run install. On Alpine, you may need glibc compat.
- **Empty retrieval results** — confirm the index step ran without
  errors and the database file exists at \`RAG_DB_PATH\`.

## See also

- \`OLLAMA_SETUP.md\` — install + model-pull runbook
- The path-scoped compliance rule(s) under \`.claude/rules/rag-*.md\`
  generated alongside this scaffold
`;
}

function complianceObligationsBlock(profile: UserProfile): string {
  const frameworks = profile.complianceFrameworks;
  if (frameworks.length === 0) {
    return `## Compliance obligations

No regulated frameworks were declared in the wizard for this profile.
The path-scoped rule file \`.claude/rules/rag-conventions.md\` covers
generic RAG best practices (audit, encryption-at-rest, never log raw
queries). Layer your own framework-specific rules on top if needed.`;
  }

  const lines: string[] = ['## Compliance obligations', ''];
  lines.push(
    `Active frameworks for this profile: **${frameworks.join(', ').toUpperCase()}**.`,
  );
  lines.push('');
  lines.push(
    'EmbedIQ emitted one path-scoped rule file per framework under',
  );
  lines.push('`.claude/rules/`:');
  lines.push('');
  if (frameworks.includes('hipaa')) lines.push('- `rag-hipaa-compliance.md` — PHI handling, BAA, six-year audit retention');
  if (frameworks.includes('pci')) lines.push('- `rag-pci-compliance.md` — cardholder data, never index full PANs, one-year audit retention');
  if (frameworks.includes('soc2')) lines.push('- `rag-soc2-compliance.md` — access logging, change management');
  if (frameworks.includes('ferpa')) lines.push('- `rag-ferpa-compliance.md` — student education records, parental consent');
  lines.push('');
  lines.push('These rule files are path-scoped to `rag/**` and');
  lines.push('`src/rag/**`, so Claude Code loads them automatically');
  lines.push('whenever you edit retrieval code.');
  return lines.join('\n');
}

function productionHardeningBlock(profile: UserProfile): string {
  const items: string[] = ['## Production hardening checklist', ''];
  items.push('Before any real data flows through this scaffold:');
  items.push('');
  items.push('- [ ] `RAG_QUERY_HASH_KEY` set to a 32-byte random value,');
  items.push('      stored in a secrets manager (Vault, AWS Secrets,');
  items.push('      Kubernetes Secret) — **not** in an .env file checked');
  items.push('      into source.');
  items.push('- [ ] Filesystem encryption verified on the host (LUKS /');
  items.push('      FileVault / BitLocker / EBS).');
  items.push('- [ ] Network policy locked to localhost for Ollama (no');
  items.push('      inbound access from outside the trust boundary).');
  items.push('- [ ] Audit log rotation configured (logrotate / Loki /');
  items.push('      Splunk).');
  items.push('- [ ] User-scope filtering wired in front of `store.search()`');
  items.push('      — the scaffold ships with no access control by design.');

  if (profile.complianceFrameworks.includes('hipaa')) {
    items.push('- [ ] **HIPAA**: six-year retention on the audit log');
    items.push('      (Security Rule §164.316(b)(2)).');
    items.push('- [ ] **HIPAA**: BAA in place with any non-local LLM or');
    items.push('      embedding provider you route to.');
    items.push('- [ ] **HIPAA**: de-identification (Safe Harbor / Expert');
    items.push('      Determination per 45 CFR 164.514) if retrieval');
    items.push('      results flow outside treatment contexts.');
  }
  if (profile.complianceFrameworks.includes('pci')) {
    items.push('- [ ] **PCI-DSS**: never index full PANs. If cardholder');
    items.push('      data must be referenced, store last-four only.');
    items.push('- [ ] **PCI-DSS**: one-year retention minimum on the');
    items.push('      audit log; daily review for the first three months.');
  }
  if (profile.complianceFrameworks.includes('soc2')) {
    items.push('- [ ] **SOC 2**: every change to the scaffold goes');
    items.push('      through your standard change-management process.');
    items.push('- [ ] **SOC 2**: access reviews quarterly for anyone with');
    items.push('      direct DB access.');
  }
  if (profile.complianceFrameworks.includes('ferpa')) {
    items.push('- [ ] **FERPA**: parental consent before indexing any');
    items.push('      student records for students under 18.');
    items.push('- [ ] **FERPA**: directory-information distinction —');
    items.push('      apply per-record opt-out before retrieval.');
  }

  return items.join('\n');
}

// ─── Per-framework rule files ─────────────────────────────────────────────

function ragHipaaRule(): string {
  return [
    '<!-- pathScope: rag/**, src/rag/** -->',
    '',
    '# HIPAA Compliance for RAG Code',
    '',
    'This rule applies to retrieval-augmented generation code that may',
    'index or query Protected Health Information (PHI). It complements',
    '`.claude/rules/hipaa-phi-handling.md` — read both before editing.',
    '',
    '## Vector store',
    '',
    '- **Never use PHI as a vector key.** Use opaque identifiers',
    '  (UUIDs, HMAC-SHA256 of a salted record ID).',
    '- **Encrypt the vector store at rest.** Filesystem encryption',
    '  (LUKS / FileVault / BitLocker / AWS EBS) is the minimum.',
    '- **Never check vector dumps into source control.**',
    '',
    '## Embeddings',
    '',
    '- **Use local Ollama embeddings.** Hosted embedding APIs require',
    '  a BAA with the provider.',
    '- **Never log raw chunk text.** Log only the chunk hash, the',
    '  source identifier, and the embedding model name.',
    '',
    '## Retrieval audit',
    '',
    '- **Audit every query** with `{timestamp, queryHash, userId,',
    '  retrievedIds, model}`. Retain logs for the HIPAA-required',
    '  six-year minimum (§164.316(b)(2)).',
    '- **Never log the raw query string.** Hash it (HMAC-SHA256) for',
    '  traceability without exposure.',
    '',
    '## Access control',
    '',
    '- **Filter retrieval results by the requesting user\'s',
    '  authorization scope.** A query for patient A must not return',
    '  documents about patient B.',
    '- **Reject queries with missing or invalid `userId`** at the API',
    '  boundary.',
    '',
    '## What this rule does *not* substitute for',
    '',
    '- The full HIPAA Privacy / Security Rule text (45 CFR Parts 160,',
    '  162, 164).',
    '- Your BAA with any non-local embedding or LLM provider.',
    '- A real de-identification process per 45 CFR 164.514.',
    '',
  ].join('\n');
}

function ragPciRule(): string {
  return [
    '<!-- pathScope: rag/**, src/rag/** -->',
    '',
    '# PCI-DSS Compliance for RAG Code',
    '',
    'This rule applies to retrieval-augmented generation code that may',
    'index or query cardholder data. Read alongside the broader',
    '`.claude/rules/pci-compliance.md` when present.',
    '',
    '## Cardholder data handling',
    '',
    '- **Never index full PANs.** Mask to last-four-only before any',
    '  text reaches the chunker. The full PAN must never appear in',
    '  the vector store.',
    '- **Never index CVV / CVC.** These are SAD (Sensitive',
    '  Authentication Data) and must not be stored after',
    '  authorization, full stop.',
    '- **Never log retrieved chunk content** — masked or otherwise.',
    '',
    '## Vector store',
    '',
    '- **Encrypt the vector store at rest.** Filesystem encryption',
    '  plus database-level encryption (SQLCipher or equivalent) for',
    '  any deployment storing tokenized card references.',
    '- **Network-segment the host.** PCI-scope hosts run in a CDE',
    '  (cardholder data environment).',
    '',
    '## Retrieval audit',
    '',
    '- **Audit every query** with `{timestamp, queryHash, userId,',
    '  retrievedIds}`. PCI-DSS requires at least one year of retained',
    '  audit logs, with 90 days immediately available.',
    '- **Daily log review** for the first three months after deployment.',
    '',
    '## Access control',
    '',
    '- **Least privilege.** Only users with explicit business need',
    '  access the retrieval API.',
    '- **MFA enforced** for any human user accessing the CDE.',
    '',
    '## What this rule does *not* substitute for',
    '',
    '- The full PCI-DSS standard (v4.0 or later).',
    '- A QSA-led annual assessment.',
    '- A real tokenization pipeline upstream of the chunker.',
    '',
  ].join('\n');
}

function ragSoc2Rule(): string {
  return [
    '<!-- pathScope: rag/**, src/rag/** -->',
    '',
    '# SOC 2 Compliance for RAG Code',
    '',
    'This rule applies to retrieval-augmented generation code in a',
    'SOC 2-scoped engineering environment. Aligns with the',
    'Trust Services Criteria — Security, Availability, Confidentiality.',
    '',
    '## Change management (CC8.1)',
    '',
    '- **Every change to retrieval code goes through PR review.** No',
    '  direct commits to the protected branches.',
    '- **Schema migrations are versioned.** Use the existing project',
    '  migration tooling rather than ad-hoc DDL.',
    '',
    '## Access control (CC6.1, CC6.2, CC6.3)',
    '',
    '- **Quarterly access reviews** for anyone with direct DB access',
    '  to the vector store.',
    '- **Least privilege** on the retrieval API — no shared service',
    '  accounts for human users.',
    '- **Filter retrieval results** by the requesting user\'s',
    '  authorization scope.',
    '',
    '## Logging & monitoring (CC7.2)',
    '',
    '- **Audit every query** with `{timestamp, queryHash, userId,',
    '  retrievedIds, model}`.',
    '- **Centralize logs** (SIEM / Splunk / Loki / Elastic) — local',
    '  files are not sufficient for SOC 2 evidence.',
    '- **Alert on anomalies** — sudden query-rate spikes, queries from',
    '  unexpected user IDs, retrieved-count outliers.',
    '',
    '## Confidentiality (C1.1, C1.2)',
    '',
    '- **Never log raw queries or chunk content.** Hash queries with',
    '  HMAC-SHA256 for traceability.',
    '- **Encrypt the vector store at rest** (filesystem-level minimum).',
    '- **TLS for any cross-host traffic** even on internal networks.',
    '',
    '## What this rule does *not* substitute for',
    '',
    '- Your SOC 2 Type II controls catalog.',
    '- The auditor\'s sample-testing of those controls.',
    '- Your incident-response runbook.',
    '',
  ].join('\n');
}

function ragFerpaRule(): string {
  return [
    '<!-- pathScope: rag/**, src/rag/** -->',
    '',
    '# FERPA Compliance for RAG Code',
    '',
    'This rule applies to retrieval-augmented generation code that may',
    'index or query education records. FERPA (20 U.S.C. § 1232g) governs',
    'the disclosure of student education records.',
    '',
    '## Education records',
    '',
    '- **Distinguish education records from directory information.**',
    '  Directory information (name, address, attendance status) can',
    '  flow through retrieval without consent unless the student/parent',
    '  has opted out. Education records (grades, disciplinary, special',
    '  ed) require consent or a FERPA exception.',
    '- **Never index grade or disciplinary content without consent**',
    '  unless the retrieval flows back only to the student/parent (or',
    '  the school official with legitimate educational interest).',
    '',
    '## Consent + opt-out',
    '',
    '- **Check the directory-information opt-out flag** for each',
    '  student before any retrieval returns their record.',
    '- **For students under 18**: parental consent required before',
    '  indexing education records.',
    '- **For students 18+**: student consent applies; parental access',
    '  restricted unless the student is a dependent.',
    '',
    '## Retrieval audit',
    '',
    '- **Audit every query** with `{timestamp, queryHash, userId,',
    '  retrievedIds}`. FERPA requires the ability to identify who',
    '  accessed which student\'s records and for what purpose.',
    '',
    '## What this rule does *not* substitute for',
    '',
    '- The full FERPA regulations (34 CFR Part 99).',
    '- Your institution\'s FERPA officer / registrar.',
    '- Annual FERPA notification + your consent collection process.',
    '',
  ].join('\n');
}

function ragConventionsRule(): string {
  return [
    '<!-- pathScope: rag/**, src/rag/** -->',
    '',
    '# RAG Conventions',
    '',
    'Generic best practices for the retrieval-augmented-generation',
    'scaffold under `rag/`. No regulated frameworks are active for this',
    'profile, so this rule covers the engineering hygiene that applies',
    'to all RAG code regardless of compliance regime.',
    '',
    '## Vector store',
    '',
    '- **Use opaque chunk identifiers.** Never use source content as',
    '  the primary key — hashed or UUID identifiers only.',
    '- **Never commit vector dumps to source control.** Patterns like',
    '  `*.embeddings.bin` and `*.vectors.dump` are already in',
    '  `.gitignore`; do not weaken them.',
    '- **Encrypt the host filesystem** if the source corpus is',
    '  sensitive.',
    '',
    '## Embeddings',
    '',
    '- **Prefer local embedders** (`nomic-embed-text` via Ollama).',
    '- **Cache embeddings idempotently.** The chunk hash should be',
    '  the cache key so re-indexing the same content is a no-op.',
    '',
    '## Retrieval audit',
    '',
    '- **Log every query** with `{timestamp, queryHash, userId,',
    '  retrievedIds, model}`. Hash the query — never store raw query',
    '  text in the audit log.',
    '- **Rotate audit logs.** Even outside regulated retention',
    '  requirements, audit logs grow fast.',
    '',
    '## Access control',
    '',
    '- **Filter retrieval by user scope.** If the corpus contains',
    '  per-user data, enforce the filter in the retrieval layer.',
    '- **Reject anonymous queries.** Replace the `USER` env-var',
    '  default with your real auth identity at the API boundary.',
    '',
    '## Performance',
    '',
    '- **Batch embeddings** when indexing — single-call latency is',
    '  dominated by HTTP overhead.',
    '- **SQLite-VSS handles ~100k chunks comfortably.** Beyond that,',
    '  consider Qdrant / pgvector / Weaviate for the data layer.',
    '',
  ].join('\n');
}
