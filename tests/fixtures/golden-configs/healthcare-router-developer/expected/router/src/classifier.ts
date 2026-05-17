/**
 * Decide whether a prompt should be answered locally or escalated to a
 * hosted LLM. Heuristics only — designed to be replaced with a learned
 * classifier as evaluation data accrues.
 */

export interface RouteDecision {
  destination: 'local' | 'hosted';
  reason: string;
}

const APPROX_CHARS_PER_TOKEN = 4;

// Cheap signals that suggest a hosted LLM is needed: long-form
// reasoning markers, multi-step instructions, or explicit "deep" cues.
const ESCALATION_HINTS = [
  /step[- ]by[- ]step/i,
  /reason through/i,
  /analyze .{0,30} pros and cons/i,
  /draft .{0,20} (proposal|policy|RFC)/i,
];

export function classify(prompt: string): RouteDecision {
  const maxLocal = Number.parseInt(process.env.ROUTER_MAX_LOCAL_TOKENS ?? '512', 10);
  const approxTokens = Math.ceil(prompt.length / APPROX_CHARS_PER_TOKEN);

  if (approxTokens > maxLocal) {
    return { destination: 'hosted', reason: `prompt over ${maxLocal} tokens` };
  }

  for (const hint of ESCALATION_HINTS) {
    if (hint.test(prompt)) {
      return { destination: 'hosted', reason: `escalation hint: ${hint}` };
    }
  }

  return { destination: 'local', reason: 'short / simple — staying local' };
}
