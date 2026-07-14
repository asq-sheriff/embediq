/**
 * Decide whether a prompt should be answered locally or escalated to the
 * gateway. Heuristics only — designed to be replaced with a learned
 * classifier as evaluation data accrues.
 */

export interface RouteDecision {
  destination: 'local' | 'escalate';
  reason: string;
}

const APPROX_CHARS_PER_TOKEN = 4;

// Cheap signals that suggest escalation to the gateway is needed: long-form
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
    return { destination: 'escalate', reason: `prompt over ${maxLocal} tokens` };
  }

  for (const hint of ESCALATION_HINTS) {
    if (hint.test(prompt)) {
      return { destination: 'escalate', reason: `escalation hint: ${hint}` };
    }
  }

  return { destination: 'local', reason: 'short / simple — staying local' };
}
