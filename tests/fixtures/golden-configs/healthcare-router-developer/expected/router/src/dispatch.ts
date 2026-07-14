/**
 * Forwards an escalated request to the LLM gateway (LiteLLM), which holds the
 * provider credentials and enforces the PHI/PII egress guardrail. This router
 * never imports a provider SDK and never sees a key — that is what makes the
 * compliance gate unbypassable: any path that wants to reach a provider must go
 * through the gateway.
 */

const GATEWAY_BASE_URL = process.env.GATEWAY_BASE_URL ?? 'http://localhost:4000';

export interface GatewayInput {
  prompt: string;
  /** Gateway model_name to target; the gateway falls back to its default. */
  model?: string;
}

export interface GatewayOutput {
  text: string;
  model: string;
}

export async function forwardToGateway(input: GatewayInput): Promise<GatewayOutput> {
  const res = await fetch(GATEWAY_BASE_URL + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: input.model ?? 'escalation',
      messages: [{ role: 'user', content: input.prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error('gateway error ' + res.status + ': ' + body);
  }
  const payload = (await res.json()) as { model?: string; choices?: Array<{ message?: { content?: string } }> };
  return { text: payload.choices?.[0]?.message?.content ?? '', model: payload.model ?? 'gateway' };
}
