import { stringify as stringifyYaml } from 'yaml';
import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { GenerationContext, GeneratedFile, UserProfile } from '../../types/index.js';

/**
 * Local Router generator — emits a runnable Express dispatch service
 * under `router/` plus a root-level `ROUTER_RUNBOOK.md` and a
 * path-scoped rule file at `.claude/rules/router-conventions.md`.
 *
 * Decision-only: the router classifies a request, checks eligibility, and
 * either answers it locally (Ollama) or FORWARDS the escalation to the LLM
 * gateway (LiteLLM). It holds NO provider credentials and makes no direct
 * provider call — the gateway holds the keys and enforces the PHI/PII egress
 * guardrail, which is what makes the compliance gate unbypassable.
 *
 *   1. A classifier (token count, language hints, simple regex heuristics) —
 *      short / simple requests stay local.
 *   2. Optional confidence-based re-route — the local model self-scores its own
 *      answer; below a threshold the request is forwarded to the gateway.
 *
 * Gating: the orchestrator only includes the LOCAL_ROUTER target when
 * `profile.routerEnabled === true`. The serialized routing policy is emitted as
 * `router/routing-policy.yaml` for diffing and drift scanning.
 *
 * Files (TypeScript scaffold):
 *   router/package.json
 *   router/.env.example           — no provider keys; GATEWAY_BASE_URL only
 *   router/README.md
 *   router/src/server.ts          — Express entrypoint
 *   router/src/classifier.ts      — local-vs-escalate decision
 *   router/src/local-client.ts    — Ollama client
 *   router/src/dispatch.ts        — forwards escalations to the gateway (no keys)
 *   router/src/audit.ts           — JSONL routing decision trace
 *   router/src/confidence.ts      — self-evaluation module (opt-in)
 *   router/routing-policy.yaml    — serialized routing policy
 *   ROUTER_RUNBOOK.md             — operator runbook
 *   .claude/rules/router-conventions.md
 */
export class LocalRouterGenerator implements ConfigGenerator {
  name = 'local-router';
  target = TargetFormat.LOCAL_ROUTER;

  generate(config: GenerationContext): GeneratedFile[] {
    const { profile } = config;
    if (!shouldEmitLocalRouter(profile)) return [];

    const hipaa = profile.complianceFrameworks.includes('hipaa');
    const confidence = profile.confidenceEscalation === true;

    const files: GeneratedFile[] = [
      {
        relativePath: 'router/package.json',
        content: packageJson(),
        description: 'Local router — deps + run scripts (router/package.json)',
      },
      {
        relativePath: 'router/.env.example',
        content: envExample(profile),
        description: 'Local router — env-var template (router/.env.example)',
      },
      {
        relativePath: 'router/README.md',
        content: readme(profile),
        description: 'Local router — overview + smoke test (router/README.md)',
      },
      {
        relativePath: 'router/src/server.ts',
        content: serverTs(profile),
        description: 'Local router — Express entrypoint (router/src/server.ts)',
      },
      {
        relativePath: 'router/src/classifier.ts',
        content: classifierTs(),
        description: 'Local router — classifier (router/src/classifier.ts)',
      },
      {
        relativePath: 'router/src/local-client.ts',
        content: localClientTs(profile),
        description: 'Local router — Ollama client (router/src/local-client.ts)',
      },
      {
        relativePath: 'router/src/dispatch.ts',
        content: dispatchTs(),
        description: 'Local router — gateway dispatch, holds no credentials (router/src/dispatch.ts)',
      },
      {
        relativePath: 'router/src/audit.ts',
        content: auditTs(profile),
        description: 'Local router — routing audit log (router/src/audit.ts)',
      },
      {
        relativePath: 'ROUTER_RUNBOOK.md',
        content: runbook(profile),
        description: 'Local router runbook — setup, smoke test, hardening (ROUTER_RUNBOOK.md)',
      },
      {
        relativePath: '.claude/rules/router-conventions.md',
        content: routerRule(profile),
        description: 'Local router conventions (path-scoped to router/**)',
      },
    ];

    if (config.policy) {
      files.push({
        relativePath: 'router/routing-policy.yaml',
        // Serialize under the YAML 1.1 schema so `minimizeOnEgress: off` is
        // quoted ("off"). Under 1.2-core `off` is a plain string and stays
        // bare, but 1.1 parsers (PyYAML et al.) read a bare `off` as boolean
        // false — this keeps the policy round-tripping to the same string
        // everywhere. Only the `off` values change; booleans/other strings are
        // untouched.
        content: stringifyYaml(config.policy, { schema: 'yaml-1.1' }),
        description: 'Local router — serialized routing policy, diffable + drift-scanned (router/routing-policy.yaml)',
      });
    }

    if (confidence) {
      files.push({
        relativePath: 'router/src/confidence.ts',
        content: confidenceTs(hipaa),
        description: 'Local router — confidence-based escalation (router/src/confidence.ts)',
      });
    }

    return files;
  }
}

/** Exposed for tests. */
export function shouldEmitLocalRouter(profile: UserProfile): boolean {
  return profile.routerEnabled === true;
}

// ─── package.json + env template ─────────────────────────────────────────

function packageJson(): string {
  const pkg = {
    name: 'router',
    version: '0.1.0',
    private: true,
    type: 'module',
    description: 'Local-AI dispatch router (scaffolded by EmbedIQ)',
    scripts: {
      dev: 'tsx watch src/server.ts',
      start: 'tsx src/server.ts',
      test: 'echo "see ROUTER_RUNBOOK.md for the smoke test"',
    },
    dependencies: {
      express: '^4.19.0',
      ollama: '^0.5.0',
    },
    devDependencies: {
      '@types/express': '^4.17.0',
      tsx: '^4.0.0',
      typescript: '^5.4.0',
    },
  };
  return JSON.stringify(pkg, null, 2) + '\n';
}

function envExample(profile: UserProfile): string {
  const lines: string[] = [];
  lines.push(`# Local-router environment template`);
  if (profile.complianceFrameworks.length > 0) {
    lines.push(`# Active compliance frameworks: ${profile.complianceFrameworks.join(', ')}.`);
    lines.push(`# Secret values stay in the gitignored .env — never commit them.`);
  } else {
    lines.push(`# Copy to .env and fill in. NEVER commit .env to source control.`);
  }
  lines.push('');
  lines.push(`# Port the router listens on.`);
  lines.push(`ROUTER_PORT=8787`);
  lines.push('');
  lines.push(`# Ollama runtime — local-only by default.`);
  lines.push(`OLLAMA_HOST=http://localhost:11434`);
  lines.push(`OLLAMA_LOCAL_MODEL=${profile.defaultLocalModel ?? 'llama3.1:8b'}`);
  lines.push('');
  lines.push(`# LLM gateway (LiteLLM) base URL. This router holds NO provider`);
  lines.push(`# credentials: it classifies a request, checks eligibility, and forwards`);
  lines.push(`# the chosen destination here. The gateway holds the keys and enforces`);
  lines.push(`# the egress guardrail — see litellm/config.yaml.`);
  lines.push(`GATEWAY_BASE_URL=http://localhost:4000`);
  lines.push('');

  lines.push(`# Routing audit log. JSONL, append-only. Rotate via logrotate.`);
  lines.push(`ROUTER_AUDIT_LOG_PATH=./router-audit.jsonl`);
  lines.push('');
  lines.push(`# Per-deployment HMAC key for hashing prompts in the audit log.`);
  lines.push(`# Generate with: openssl rand -hex 32`);
  lines.push(`ROUTER_AUDIT_HASH_KEY=`);
  lines.push('');
  lines.push(`# Classifier thresholds — tune per workload.`);
  lines.push(`ROUTER_MAX_LOCAL_TOKENS=512`);

  if (profile.confidenceEscalation) {
    lines.push('');
    lines.push(`# Confidence-escalation threshold (0..1). Local answers scoring`);
    lines.push(`# below this are forwarded to the gateway for escalation.`);
    lines.push(`ROUTER_CONFIDENCE_THRESHOLD=0.55`);
  }

  return lines.join('\n') + '\n';
}

function readme(profile: UserProfile): string {
  const confidence = profile.confidenceEscalation === true;

  const lines: string[] = [];
  lines.push(`# Local Router`);
  lines.push('');
  lines.push(`Hybrid-dispatch service for the **${profile.businessDomain || 'project'}**. ` +
    `Routes inbound chat / completion requests between a local Ollama model and the ` +
    `LLM gateway, choosing the destination from a layered set of signals. This router ` +
    `makes the decision and forwards escalations to the gateway; it holds no provider ` +
    `credentials and never calls a provider directly.`);
  lines.push('');
  lines.push(`> **Read [ROUTER_RUNBOOK.md](../ROUTER_RUNBOOK.md) at the project root first.** ` +
    `It covers compliance obligations, the smoke test, and the production-hardening checklist.`);
  lines.push('');
  lines.push(`## Quick start`);
  lines.push('');
  lines.push('```bash');
  lines.push(`cp router/.env.example router/.env`);
  lines.push(`$EDITOR router/.env`);
  lines.push('');
  lines.push(`cd router && npm install`);
  lines.push(`npm run dev`);
  lines.push('');
  lines.push(`# In another terminal —`);
  lines.push(`curl -s http://localhost:8787/route -H 'content-type: application/json' \\`);
  lines.push(`     -d '{"prompt":"Summarize this README in one sentence."}'`);
  lines.push('```');
  lines.push('');
  lines.push(`## Files`);
  lines.push('');
  lines.push(`| File | Purpose |`);
  lines.push(`|---|---|`);
  lines.push(`| \`src/server.ts\` | Express entry point — exposes \`POST /route\` |`);
  lines.push(`| \`src/classifier.ts\` | Token / regex heuristics — local-vs-escalate decision |`);
  lines.push(`| \`src/local-client.ts\` | Ollama client |`);
  lines.push(`| \`src/dispatch.ts\` | Forwards escalations to the LLM gateway — holds NO provider credentials |`);
  lines.push(`| \`src/audit.ts\` | Per-request JSONL audit log (prompt hash, decision, latency) |`);
  lines.push(`| \`routing-policy.yaml\` | Serialized routing policy (eligibility + destinations) — diffable, drift-scanned |`);
  if (confidence) lines.push(`| \`src/confidence.ts\` | Self-evaluation — re-routes low-confidence answers |`);
  lines.push('');
  lines.push(`See \`ROUTER_RUNBOOK.md\` for what to harden before any sensitive ` +
    `traffic flows through this service.`);
  lines.push('');
  return lines.join('\n');
}

// ─── Server entrypoint ───────────────────────────────────────────────────

function serverTs(profile: UserProfile): string {
  const confidence = profile.confidenceEscalation === true;

  const imports = [
    `import express from 'express';`,
    `import { classify } from './classifier.js';`,
    `import { generateLocal } from './local-client.js';`,
    `import { forwardToGateway } from './dispatch.js';`,
    `import { logRouting } from './audit.js';`,
  ];
  if (confidence) imports.push(`import { scoreConfidence } from './confidence.js';`);

  const confidenceBlock = confidence
    ? `
      // Confidence self-evaluation — re-route when the local answer's self-score
      // falls below ROUTER_CONFIDENCE_THRESHOLD. The escalation goes to the
      // GATEWAY, which holds the credentials and enforces the egress guardrail —
      // this router never sees a provider key or the raw egress path.
      if (decision.destination === 'local') {
        const score = await scoreConfidence({ prompt, answer: response.text, model: response.model });
        const threshold = Number.parseFloat(process.env.ROUTER_CONFIDENCE_THRESHOLD ?? '0.55');
        if (score < threshold) {
          const escalated = await forwardToGateway({ prompt, model: req.body.model });
          logRouting({
            promptForAudit: prompt,
            destination: 'gateway',
            reason: 'confidence-escalation',
            confidence: score,
            latencyMs: Date.now() - started,
            model: escalated.model,
          });
          res.json({ text: escalated.text, route: 'gateway', confidence: score });
          return;
        }
      }
`
    : '';

  return `import 'dotenv/config';
${imports.join('\n')}

const app = express();
app.use(express.json({ limit: '1mb' }));

interface RouteRequestBody {
  prompt: string;
  model?: string;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/route', async (req, res) => {
  const started = Date.now();
  const { prompt, model }: RouteRequestBody = req.body ?? {};
  if (typeof prompt !== 'string' || prompt.length === 0) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  try {
    const decision = classify(prompt);

    if (decision.destination === 'local') {
      const response = await generateLocal({ prompt });
${confidenceBlock}      logRouting({
        promptForAudit: prompt,
        destination: 'local',
        reason: decision.reason,
        latencyMs: Date.now() - started,
        model: response.model,
      });
      res.json({ text: response.text, route: 'local' });
      return;
    }

    // Escalation path — forward to the gateway. This router holds no
    // credentials and makes no direct provider call; the gateway executes the
    // request and enforces the PHI/PII egress guardrail before any egress.
    const response = await forwardToGateway({ prompt, model });
    logRouting({
      promptForAudit: prompt,
      destination: 'gateway',
      reason: decision.reason,
      latencyMs: Date.now() - started,
      model: response.model,
    });
    res.json({ text: response.text, route: 'gateway' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logRouting({
      promptForAudit: prompt,
      destination: 'error',
      reason: 'exception',
      latencyMs: Date.now() - started,
      model: 'n/a',
      error: message,
    });
    res.status(500).json({ error: message });
  }
});

const port = Number.parseInt(process.env.ROUTER_PORT ?? '8787', 10);
app.listen(port, () => {
  console.log(\`[router] listening on http://localhost:\${port}\`);
});
`;
}

// ─── Gateway dispatch (holds no credentials) ─────────────────────────────

function dispatchTs(): string {
  return `/**
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
`;
}

// ─── Classifier ──────────────────────────────────────────────────────────

function classifierTs(): string {
  return `/**
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
    return { destination: 'escalate', reason: \`prompt over \${maxLocal} tokens\` };
  }

  for (const hint of ESCALATION_HINTS) {
    if (hint.test(prompt)) {
      return { destination: 'escalate', reason: \`escalation hint: \${hint}\` };
    }
  }

  return { destination: 'local', reason: 'short / simple — staying local' };
}
`;
}

// ─── Local client ─────────────────────────────────────────────────────────

function localClientTs(profile: UserProfile): string {
  const defaultModel = profile.defaultLocalModel ?? profile.ollamaModels?.[0] ?? 'llama3.1:8b';
  return `/**
 * Wraps the local Ollama HTTP API. Stays on-host by default
 * (OLLAMA_HOST defaults to http://localhost:11434).
 */

import { Ollama } from 'ollama';

const host = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
const defaultModel = process.env.OLLAMA_LOCAL_MODEL ?? '${defaultModel}';
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
`;
}

// ─── Audit logger ────────────────────────────────────────────────────────

function auditTs(profile: UserProfile): string {
  const hashNote = profile.complianceFrameworks.length > 0
    ? `// Compliance frameworks active: ${profile.complianceFrameworks.join(', ')}.\n` +
      `// The hash key MUST be set in production — never let the dev fallback ship.`
    : `// Hash prompts to keep traceability without exposing raw content.`;

  return `/**
 * Routing audit logger. Writes one JSONL entry per request with
 * { timestamp, promptHash, destination, reason, model, latencyMs }.
 *
 * Never writes raw prompt or model response — the prompt is hashed
 * with a per-deployment HMAC key (ROUTER_AUDIT_HASH_KEY) for
 * traceability without exposure.
${hashNote}
 */

import { appendFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const LOG_PATH = process.env.ROUTER_AUDIT_LOG_PATH ?? './router-audit.jsonl';
const HASH_KEY = process.env.ROUTER_AUDIT_HASH_KEY ?? '';

if (!HASH_KEY) {
  console.warn(
    '[router-audit] ROUTER_AUDIT_HASH_KEY is unset — using a static fallback. ' +
    'Set it before any sensitive traffic flows through this service.',
  );
}

export interface RoutingAuditEntry {
  promptForAudit: string;
  destination: 'local' | 'gateway' | 'error';
  reason: string;
  model: string;
  latencyMs: number;
  confidence?: number;
  error?: string;
}

export function logRouting(entry: RoutingAuditEntry): void {
  const promptHash = createHmac('sha256', HASH_KEY || 'dev-fallback-do-not-ship')
    .update(entry.promptForAudit)
    .digest('hex');

  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    promptHash,
    destination: entry.destination,
    reason: entry.reason,
    model: entry.model,
    latencyMs: entry.latencyMs,
    confidence: entry.confidence,
    error: entry.error,
  });

  try {
    appendFileSync(LOG_PATH, line + '\\n', 'utf-8');
  } catch (err) {
    console.error('[router-audit] write failed:', err);
  }
}
`;
}

// ─── Confidence self-evaluation ──────────────────────────────────────────

function confidenceTs(hipaa: boolean): string {
  const note = hipaa
    ? ` *\n * HIPAA: the self-evaluation prompt is built from the original input,\n` +
      ` * but never leaves the local Ollama instance. Only the *forwarded*\n` +
      ` * follow-up (in server.ts) goes to the gateway, which routes solely to\n` +
      ` * BAA-covered destinations and enforces the egress guardrail.`
    : ` *\n * The self-evaluation prompt stays on the local Ollama instance.`;

  return `/**
 * Self-evaluation step. Asks the local model to rate its own answer
 * on a 0..1 confidence scale. The score is parsed loosely — anything
 * that doesn't yield a clean number falls back to 0.5 (neither
 * confident nor non-confident).
${note}
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
  ].join('\\n');
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
  const match = raw.match(/(\\d+(?:\\.\\d+)?)/);
  if (!match) return 0.5;
  const score = Number.parseFloat(match[1]);
  if (!Number.isFinite(score)) return 0.5;
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
}
`;
}

// ─── Runbook ─────────────────────────────────────────────────────────────

function runbook(profile: UserProfile): string {
  const hipaa = profile.complianceFrameworks.includes('hipaa');
  const confidence = profile.confidenceEscalation === true;

  const lines: string[] = [];
  lines.push(`# Local Router Runbook`);
  lines.push('');
  lines.push(`EmbedIQ generated a hybrid-dispatch router for ` +
    `**${profile.businessDomain || 'this project'}**. This runbook covers ` +
    `setup, the smoke test, the routing policy, and the production-hardening checklist.`);
  lines.push('');
  lines.push(`The service exposes a single HTTP endpoint — \`POST /route\` — and ` +
    `decides per request whether to answer locally (Ollama) or escalate to the gateway.`);
  lines.push('');
  lines.push(`## Prerequisites`);
  lines.push('');
  lines.push(`- **Ollama** installed and running locally. See \`OLLAMA_SETUP.md\` for ` +
    `the install runbook generated alongside this router.`);
  lines.push(`- A model pulled locally: \`ollama pull ${profile.defaultLocalModel ?? 'llama3.1:8b'}\`.`);
  lines.push(`- The **LLM gateway** (LiteLLM) reachable at \`GATEWAY_BASE_URL\`. The router ` +
    `forwards escalations there; the gateway holds the provider credentials and enforces ` +
    `the egress guardrail. See \`litellm/config.yaml\`.`);
  lines.push(`- A generated HMAC secret for prompt-hash audit: \`openssl rand -hex 32\`.`);
  lines.push('');
  lines.push(`## Setup`);
  lines.push('');
  lines.push('```bash');
  lines.push(`cp router/.env.example router/.env`);
  lines.push(`$EDITOR router/.env`);
  lines.push(`# Set at least:`);
  lines.push(`#   ROUTER_AUDIT_HASH_KEY (REQUIRED — openssl rand -hex 32)`);
  lines.push(`#   GATEWAY_BASE_URL     (REQUIRED — where escalations are forwarded)`);
  lines.push('');
  lines.push(`cd router && npm install`);
  lines.push(`npm run dev`);
  lines.push('```');
  lines.push('');
  lines.push(`## Smoke test`);
  lines.push('');
  lines.push('```bash');
  lines.push(`# Health check`);
  lines.push(`curl -s http://localhost:8787/health`);
  lines.push('');
  lines.push(`# Short prompt — expect route: "local"`);
  lines.push(`curl -s http://localhost:8787/route \\`);
  lines.push(`     -H 'content-type: application/json' \\`);
  lines.push(`     -d '{"prompt":"Write a regex for a US phone number."}'`);
  lines.push('');
  lines.push(`# Long prompt — expect route: "gateway" (over the token threshold, forwarded)`);
  lines.push(`curl -s http://localhost:8787/route \\`);
  lines.push(`     -H 'content-type: application/json' \\`);
  lines.push(`     -d "$(node -e 'process.stdout.write(JSON.stringify({prompt:"explain ".repeat(800)}))')"`);
  lines.push('');
  lines.push('```');
  lines.push('');
  lines.push(`## Routing policy`);
  lines.push('');
  lines.push(`The classifier inspects each request through three layered signals:`);
  lines.push('');
  lines.push(`1. **Token count.** Prompts under \`ROUTER_MAX_LOCAL_TOKENS\` (default 512) ` +
    `stay local. Longer prompts escalate.`);
  lines.push(`2. **Escalation hints.** Phrases that indicate multi-step reasoning ` +
    `("step by step", "draft a proposal/policy/RFC", "analyze pros and cons") force ` +
    `escalation regardless of length.`);
  if (confidence) {
    lines.push(`3. **Confidence self-evaluation.** Local answers are scored by the local model; ` +
      `anything below \`ROUTER_CONFIDENCE_THRESHOLD\` (default 0.55) is forwarded to the gateway.`);
  } else {
    lines.push(`3. **Confidence self-evaluation.** Not enabled for this profile. ` +
      `Set \`TECH_021\` in the wizard to enable.`);
  }
  lines.push('');
  if (hipaa) {
    lines.push(`### PHI egress enforcement (HIPAA)`);
    lines.push('');
    lines.push(`This router holds **no provider credentials** and makes no direct provider ` +
      `call — it forwards escalations to the gateway. PHI/PII egress is enforced at the ` +
      `**gateway**, not here: the gateway's \`model_list\` contains only BAA-covered ` +
      `destinations (an uncovered provider has no route at all), and its guardrail applies ` +
      `the compliance pack's DLP patterns before any outbound call. Because the router has ` +
      `no way to reach a provider, an escalation cannot bypass that enforcement.`);
    lines.push('');
    lines.push(`Gateway-side redaction is **minimum-necessary hygiene, not de-identification** ` +
      `per 45 CFR 164.514 (Safe Harbor / Expert Determination). The compliance control is ` +
      `the BAA-covered route, not the filter.`);
    lines.push('');
  }
  lines.push(`## Compliance obligations`);
  lines.push('');
  if (profile.complianceFrameworks.length === 0) {
    lines.push(`No regulated frameworks were declared in the wizard for this profile. ` +
      `The path-scoped rule \`.claude/rules/router-conventions.md\` covers generic ` +
      `routing hygiene (audit hashing, never log raw prompts, escalate-with-care).`);
  } else {
    lines.push(`Active frameworks for this profile: ` +
      `**${profile.complianceFrameworks.join(', ').toUpperCase()}**.`);
    if (hipaa) {
      lines.push('');
      lines.push(`- **HIPAA**: PHI egress is enforced at the gateway — only BAA-covered ` +
        `destinations are routable, and the gateway guardrail applies the DLP patterns.`);
      lines.push(`- **HIPAA**: audit log retains for the required six years.`);
      lines.push(`- **HIPAA**: BAA in place with any provider the gateway routes to.`);
    }
    if (profile.complianceFrameworks.includes('soc2')) {
      lines.push('');
      lines.push(`- **SOC 2**: centralize the routing audit log (SIEM / Splunk / Loki).`);
      lines.push(`- **SOC 2**: quarterly access review on the gateway credentials (this router ` +
        `holds none — the gateway owns them).`);
    }
    if (profile.complianceFrameworks.includes('pci')) {
      lines.push('');
      lines.push(`- **PCI-DSS**: never route prompts that contain full PANs through this service. ` +
        `Mask to last-four upstream.`);
    }
  }
  lines.push('');
  lines.push(`## Production hardening checklist`);
  lines.push('');
  lines.push(`Before any real traffic flows through the router:`);
  lines.push('');
  lines.push(`- [ ] \`ROUTER_AUDIT_HASH_KEY\` set to a 32-byte random value, stored in a ` +
    `secrets manager — **not** in an .env file checked into source.`);
  lines.push(`- [ ] \`GATEWAY_BASE_URL\` points at the hardened gateway; provider keys live ` +
    `in the **gateway's** secrets manager, never in this router.`);
  lines.push(`- [ ] Filesystem encryption verified on the host (LUKS / FileVault / BitLocker / EBS).`);
  lines.push(`- [ ] Network policy locked: Ollama bound to localhost; the router itself ` +
    `bound to an internal interface, never the public internet without a reverse proxy + auth.`);
  lines.push(`- [ ] Audit log rotation configured (logrotate / Loki / Splunk).`);
  lines.push(`- [ ] Rate-limit \`POST /route\` at the reverse proxy (e.g., 60 req/min per user).`);
  if (hipaa) {
    lines.push(`- [ ] **HIPAA**: gateway \`model_list\` reviewed — confirm every routable ` +
      `destination is BAA-covered and no uncovered provider has a route.`);
    lines.push(`- [ ] **HIPAA**: gateway guardrail smoke-tested with synthetic-PHI payloads ` +
      `— confirm it blocks the shapes your data contains. Run \`--mode router-eligibility\`.`);
    lines.push(`- [ ] **HIPAA**: BAA in place with any provider the gateway routes to.`);
  }
  lines.push('');
  lines.push(`## What this scaffold is *not*`);
  lines.push('');
  lines.push(`- **Not the egress guardrail.** PHI/PII filtering and BAA-scoped routing live ` +
    `at the gateway (\`litellm/config.yaml\`), not in this router. The router only decides ` +
    `local-vs-escalate and forwards; it cannot reach a provider.`);
  lines.push(`- **Not a multi-tenant router.** Single-tenant by design; add per-tenant ` +
    `scoping at the API boundary if you need it.`);
  lines.push(`- **Not opinionated about authentication.** No auth ships in the scaffold — ` +
    `terminate auth at a reverse proxy before exposing it.`);
  lines.push('');
  lines.push(`## See also`);
  lines.push('');
  lines.push(`- \`OLLAMA_SETUP.md\` — install + model-pull runbook`);
  lines.push(`- The path-scoped rule under \`.claude/rules/router-conventions.md\``);
  lines.push('');
  return lines.join('\n');
}

// ─── Path-scoped router rule ─────────────────────────────────────────────

function routerRule(profile: UserProfile): string {
  const hipaa = profile.complianceFrameworks.includes('hipaa');
  const lines: string[] = [];
  lines.push(`<!-- pathScope: router/**, src/router/** -->`);
  lines.push('');
  lines.push(`# Local Router Conventions`);
  lines.push('');
  lines.push(`This rule applies to code under \`router/\`. It complements the broader ` +
    `routing runbook at \`ROUTER_RUNBOOK.md\` — read both before editing the router.`);
  lines.push('');
  lines.push(`## Routing policy`);
  lines.push('');
  lines.push(`- **Default to local.** Only escalate when the classifier or the ` +
    `confidence step asks for it. Every escalation has a measurable cost; the local ` +
    `path is the one we audit, harden, and trust.`);
  lines.push(`- **Never bypass the classifier.** Adding a new "always escalate" code path ` +
    `is a load-bearing decision — add a classifier signal instead.`);
  lines.push(`- **Escalations forward to the gateway, never to a provider.** This router ` +
    `holds no credentials; \`dispatch.ts\` POSTs to \`GATEWAY_BASE_URL\`. The gateway owns ` +
    `keys and the egress guardrail — do not add a direct provider call here.`);
  lines.push('');
  lines.push(`## Audit`);
  lines.push('');
  lines.push(`- **Every request emits a JSONL audit entry** via \`logRouting()\`.`);
  lines.push(`- **Never log the raw prompt or model response.** The audit pipeline hashes ` +
    `the prompt with an HMAC secret; only the hash leaves memory.`);
  lines.push(`- **Never disable audit on the hot path.** If audit is failing, the route ` +
    `should still log the failure — not skip audit.`);
  lines.push('');
  if (hipaa) {
    lines.push(`## PHI handling`);
    lines.push('');
    lines.push(`- **PHI egress is enforced at the gateway, not here.** This router holds no ` +
      `credentials and cannot reach a provider — it only decides local-vs-escalate and ` +
      `forwards. The gateway routes only to BAA-covered destinations and applies the DLP ` +
      `guardrail. Do not add a direct provider call or a local filter that pretends to be one.`);
    lines.push(`- **The BAA-covered route is the control, not a filter.** Redaction at the ` +
      `gateway is minimum-necessary hygiene, never de-identification (45 CFR 164.514).`);
    lines.push(`- **Verify egress with the eligibility gate.** Run \`--mode router-eligibility\` ` +
      `against the corpus whenever the policy or the gateway config changes.`);
    lines.push('');
  }
  lines.push(`## Gateway dispatch`);
  lines.push('');
  lines.push(`- **This router holds no provider keys.** \`dispatch.ts\` forwards to ` +
    `\`GATEWAY_BASE_URL\`; credentials live in the gateway's secrets manager, never here.`);
  lines.push(`- **Timeouts and retries are caller-defined.** \`forwardToGateway()\` is a leaf ` +
    `function — the route handler owns budget and retry policy.`);
  lines.push(`- **Errors from the gateway surface verbatim.** Do not silently fall ` +
    `back to the local model when the gateway call fails — that hides a failure mode ` +
    `the operator needs to see.`);
  lines.push('');
  lines.push(`## Confidence self-evaluation`);
  lines.push('');
  lines.push(`- **Self-evaluation runs on the local model** by design — it does not leave ` +
    `the host. Do not re-implement it against the gateway unless you also re-derive the ` +
    `threshold against measured outcomes.`);
  lines.push(`- **Parse the score loosely.** Local models sometimes return prose. The ` +
    `loose-regex fallback to 0.5 is intentional.`);
  lines.push('');
  lines.push(`## What this rule does *not* substitute for`);
  lines.push('');
  lines.push(`- The full \`ROUTER_RUNBOOK.md\` — production hardening, smoke tests, ` +
    `compliance obligations.`);
  if (hipaa) {
    lines.push(`- A real HIPAA de-identification process (45 CFR 164.514).`);
    lines.push(`- A BAA with any provider the gateway routes to.`);
  }
  lines.push(`- The broader project compliance rules under \`.claude/rules/\`.`);
  lines.push('');
  return lines.join('\n');
}
