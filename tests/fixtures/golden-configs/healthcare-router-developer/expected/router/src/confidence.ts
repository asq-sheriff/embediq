/**
 * Self-evaluation step. Asks the local model to rate its own answer
 * on a 0..1 confidence scale. The score is parsed loosely — anything
 * that doesn't yield a clean number falls back to 0.5 (neither
 * confident nor non-confident).
 *
 * HIPAA: the self-evaluation prompt is built from the original input,
 * but never leaves the local Ollama instance. Only the *forwarded*
 * follow-up (in server.ts) goes to the gateway, which routes solely to
 * BAA-covered destinations and enforces the egress guardrail.
 */

import { generateLocal } from './local-client.js';

function buildEvalPrompt(prompt: string, answer: string): string {
  return [
    'You are a confidence calibrator. Given the user request and the',
    'candidate answer below, return a single floating-point number between',
    '0.0 and 1.0 indicating your confidence that the answer is correct,',
    'specific, and complete. Return ONLY the number. No commentary.',
    '',
    'USER REQUEST:',
    prompt,
    '',
    'CANDIDATE ANSWER:',
    answer,
    '',
    'Confidence:',
  ].join('\n');
}

export interface ConfidenceInput {
  prompt: string;
  answer: string;
  model: string;
}

export async function scoreConfidence(input: ConfidenceInput): Promise<number> {
  const evalPrompt = buildEvalPrompt(input.prompt, input.answer);
  const res = await generateLocal({ prompt: evalPrompt, model: input.model });
  const raw = res.text.trim();
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0.5;
  const score = Number.parseFloat(match[1]);
  if (!Number.isFinite(score)) return 0.5;
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
}
