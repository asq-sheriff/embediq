/**
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
