/**
 * Wraps the local Ollama HTTP API. Stays on-host by default
 * (OLLAMA_HOST defaults to http://localhost:11434).
 */

import { Ollama } from 'ollama';

const host = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
const defaultModel = process.env.OLLAMA_LOCAL_MODEL ?? 'qwen2.5-coder:32b';
const client = new Ollama({ host });

export interface LocalGenerateInput {
  prompt: string;
  model?: string;
}

export interface LocalGenerateOutput {
  text: string;
  model: string;
}

export async function generateLocal(input: LocalGenerateInput): Promise<LocalGenerateOutput> {
  const model = input.model ?? defaultModel;
  const res = await client.chat({
    model,
    messages: [{ role: 'user', content: input.prompt }],
    stream: false,
  });
  return { text: res.message?.content ?? '', model };
}
