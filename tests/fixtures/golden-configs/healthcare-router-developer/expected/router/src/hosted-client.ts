/**
 * Hosted-LLM client. Picks a backend from the request body (when
 * provided), falls back to the configured default. Returns 501 when
 * the chosen backend has no API key set.
 *
 * Every call assumes the prompt has already been redacted upstream
 * (see redactor.ts / server.ts) when running under HIPAA. Do not
 * re-introduce raw PHI into this path.
 */

export interface HostedGenerateInput {
  prompt: string;
  backend?: 'anthropic' | 'openai';
}

export interface HostedGenerateOutput {
  text: string;
  model: string;
}

const DEFAULT_BACKEND: 'anthropic' | 'openai' = 'anthropic';

export async function generateHosted(input: HostedGenerateInput): Promise<HostedGenerateOutput> {
  const backend = input.backend ?? DEFAULT_BACKEND;
  if (backend === 'anthropic') {
    return callAnthropic(input.prompt);
  }
  throw Object.assign(
    new Error(`Unknown backend: ${backend}`),
    { statusCode: 400 },
  );
}

async function callAnthropic(prompt: string): Promise<HostedGenerateOutput> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw Object.assign(
      new Error('ANTHROPIC_API_KEY is unset — cannot escalate to Anthropic.'),
      { statusCode: 501 },
    );
  }
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`anthropic error ${res.status}: ${body}`);
  }
  const payload = await res.json() as { content?: Array<{ text?: string }> };
  const text = (payload.content ?? []).map((c) => c.text ?? '').join('');
  return { text, model };
}
