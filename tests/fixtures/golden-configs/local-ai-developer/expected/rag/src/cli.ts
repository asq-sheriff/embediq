#!/usr/bin/env tsx
/**
 * CLI entry point for the RAG scaffold.
 *
 *   tsx src/cli.ts index <dir>           index every file under <dir>
 *   tsx src/cli.ts query <text>          retrieve top-K chunks for <text>
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, basename } from 'node:path';
import { chunkPlainText, type Chunk } from './chunker.js';
import { embed, embedBatch } from './embedder.js';
import { RagStore } from './store.js';
import { logRetrieval } from './audit.js';

async function indexDir(dir: string): Promise<void> {
  const store = new RagStore();
  const files = walk(dir);
  console.log(`Indexing ${files.length} file(s) from ${dir}`);

  for (const file of files) {
    const text = readFileSync(file, 'utf-8');
    const chunks: Chunk[] = chunkPlainText(text, basename(file));

    const embeddings = await embedBatch(chunks.map((c) => c.text));
    for (let i = 0; i < chunks.length; i++) {
      store.insert(chunks[i], embeddings[i]);
    }
    console.log(`  ✓ ${file}  (${chunks.length} chunks)`);
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
    console.log(`[${r.distance.toFixed(4)}] ${r.id}  src=${r.sourceId}${r.resourceType ? ' type=' + r.resourceType : ''}`);
    console.log(`  ${r.text.slice(0, 200).replace(/\s+/g, ' ')}${r.text.length > 200 ? '…' : ''}`);
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
