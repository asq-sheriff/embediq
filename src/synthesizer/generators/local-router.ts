import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { SetupConfig, GeneratedFile, UserProfile } from '../../types/index.js';

/**
 * Local Router generator — emits a runnable Express dispatch service
 * under `router/` plus a root-level `ROUTER_RUNBOOK.md` and a
 * path-scoped rule file at `.claude/rules/router-conventions.md`.
 *
 * The service routes incoming chat / completion requests between a
 * local Ollama model and an optional hosted LLM (Anthropic or OpenAI),
 * choosing the destination via three layered signals:
 *
 *   1. A classifier (token count, language hints, simple regex
 *      heuristics) — short / simple requests stay local.
 *   2. Optional PHI redaction before any escalation when the active
 *      profile includes HIPAA. The redacted prompt is what gets sent
 *      to the hosted LLM, never the original.
 *   3. Optional confidence-based re-route — the local model
 *      self-scores its own answer; below a threshold the request is
 *      re-dispatched to the hosted LLM with redaction applied first.
 *
 * Gating: the orchestrator only includes the LOCAL_ROUTER target when
 * `profile.routerEnabled === true`. `externalApis` controls which
 * hosted-LLM clients are wired up; with neither set, the service runs
 * local-only and the escalation path returns 501.
 *
 * Files (TypeScript scaffold):
 *   router/package.json
 *   router/.env.example
 *   router/README.md
 *   router/src/server.ts          — Express entrypoint
 *   router/src/classifier.ts      — local-vs-hosted decision
 *   router/src/local-client.ts    — Ollama client
 *   router/src/hosted-client.ts   — Anthropic / OpenAI client
 *   router/src/audit.ts           — JSONL routing audit log
 *   router/src/redactor.ts        — PHI redactor (HIPAA only)
 *   router/src/confidence.ts      — self-evaluation module (opt-in)
 *   ROUTER_RUNBOOK.md             — operator runbook
 *   .claude/rules/router-conventions.md
 */
export class LocalRouterGenerator implements ConfigGenerator {
  name = 'local-router';
  target = TargetFormat.LOCAL_ROUTER;

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    if (!shouldEmitLocalRouter(profile)) return [];

    const hipaa = profile.complianceFrameworks.includes('hipaa');
    const confidence = profile.confidenceEscalation === true;
    const externalApis = profile.externalApis ?? [];

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
        relativePath: 'router/src/hosted-client.ts',
        content: hostedClientTs(externalApis),
        description: 'Local router — hosted LLM client (router/src/hosted-client.ts)',
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

    if (hipaa) {
      files.push({
        relativePath: 'router/src/redactor.ts',
        content: redactorTs(),
        description: 'Local router — PHI redactor (router/src/redactor.ts)',
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

  const apis = profile.externalApis ?? [];
  if (apis.includes('anthropic')) {
    lines.push(`# Anthropic — required when escalation is enabled and the request`);
    lines.push(`# selects the anthropic backend. Provision a key with the minimum`);
    lines.push(`# capability and rotate quarterly.`);
    lines.push(`ANTHROPIC_API_KEY=`);
    lines.push(`ANTHROPIC_MODEL=claude-sonnet-4-6`);
    lines.push('');
  }
  if (apis.includes('openai')) {
    lines.push(`# OpenAI — required when escalation is enabled and the request`);
    lines.push(`# selects the openai backend.`);
    lines.push(`OPENAI_API_KEY=`);
    lines.push(`OPENAI_MODEL=gpt-4o`);
    lines.push('');
  }

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
    lines.push(`# below this get redacted (if HIPAA) and re-dispatched to a hosted LLM.`);
    lines.push(`ROUTER_CONFIDENCE_THRESHOLD=0.55`);
  }

  return lines.join('\n') + '\n';
}

function readme(profile: UserProfile): string {
  const hipaa = profile.complianceFrameworks.includes('hipaa');
  const apis = profile.externalApis ?? [];
  const confidence = profile.confidenceEscalation === true;

  const lines: string[] = [];
  lines.push(`# Local Router`);
  lines.push('');
  lines.push(`Hybrid-dispatch service for the **${profile.businessDomain || 'project'}**. ` +
    `Routes inbound chat / completion requests between a local Ollama model and an ` +
    `optional hosted LLM, choosing the destination from a layered set of signals.`);
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
  lines.push(`| \`src/classifier.ts\` | Token / regex heuristics — local-vs-hosted decision |`);
  lines.push(`| \`src/local-client.ts\` | Ollama client |`);
  lines.push(`| \`src/hosted-client.ts\` | ${apis.length === 0 ? 'Hosted-LLM stub (returns 501 — wire one up via .env)' : apis.map((a) => a === 'anthropic' ? 'Anthropic' : 'OpenAI').join(' / ') + ' client'} |`);
  lines.push(`| \`src/audit.ts\` | Per-request JSONL audit log (prompt hash, decision, latency) |`);
  if (hipaa) lines.push(`| \`src/redactor.ts\` | PHI redactor — runs before any escalation |`);
  if (confidence) lines.push(`| \`src/confidence.ts\` | Self-evaluation — re-routes low-confidence answers |`);
  lines.push('');
  lines.push(`See \`ROUTER_RUNBOOK.md\` for what to harden before any sensitive ` +
    `traffic flows through this service.`);
  lines.push('');
  return lines.join('\n');
}

// ─── Server entrypoint ───────────────────────────────────────────────────

function serverTs(profile: UserProfile): string {
  const hipaa = profile.complianceFrameworks.includes('hipaa');
  const confidence = profile.confidenceEscalation === true;

  const imports = [
    `import express from 'express';`,
    `import { classify } from './classifier.js';`,
    `import { generateLocal } from './local-client.js';`,
    `import { generateHosted } from './hosted-client.js';`,
    `import { logRouting } from './audit.js';`,
  ];
  if (hipaa) imports.push(`import { redactPhi } from './redactor.js';`);
  if (confidence) imports.push(`import { scoreConfidence } from './confidence.js';`);

  const redactCall = hipaa
    ? `      const redacted = redactPhi(prompt);`
    : `      const redacted = prompt;`;

  const confidenceBlock = confidence
    ? `
      // Confidence self-evaluation — re-route when the local answer's
      // self-score falls below ROUTER_CONFIDENCE_THRESHOLD.
      if (decision.destination === 'local') {
        const score = await scoreConfidence({
          prompt,
          answer: response.text,
          model: response.model,
        });
        const threshold = Number.parseFloat(process.env.ROUTER_CONFIDENCE_THRESHOLD ?? '0.55');
        if (score < threshold) {
${hipaa ? '          const escalatePrompt = redactPhi(prompt);' : '          const escalatePrompt = prompt;'}
          const escalated = await generateHosted({ prompt: escalatePrompt, backend: req.body.backend });
          logRouting({
            promptForAudit: prompt,
            destination: 'hosted',
            reason: 'confidence-escalation',
            confidence: score,
            latencyMs: Date.now() - started,
            model: escalated.model,
          });
          res.json({ text: escalated.text, route: 'hosted', confidence: score });
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
  backend?: 'anthropic' | 'openai';
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/route', async (req, res) => {
  const started = Date.now();
  const { prompt, backend }: RouteRequestBody = req.body ?? {};
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

    // Hosted path — redact before any escalation.
${redactCall}
    const response = await generateHosted({ prompt: redacted, backend });
    logRouting({
      promptForAudit: prompt,
      destination: 'hosted',
      reason: decision.reason,
      latencyMs: Date.now() - started,
      model: response.model,
    });
    res.json({ text: response.text, route: 'hosted' });
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

// ─── Classifier ──────────────────────────────────────────────────────────

function classifierTs(): string {
  return `/**
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
    return { destination: 'hosted', reason: \`prompt over \${maxLocal} tokens\` };
  }

  for (const hint of ESCALATION_HINTS) {
    if (hint.test(prompt)) {
      return { destination: 'hosted', reason: \`escalation hint: \${hint}\` };
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

// ─── Hosted client ───────────────────────────────────────────────────────

function hostedClientTs(externalApis: string[]): string {
  const hasAnthropic = externalApis.includes('anthropic');
  const hasOpenai = externalApis.includes('openai');

  if (!hasAnthropic && !hasOpenai) {
    return `/**
 * No external LLM APIs were declared in the wizard. The router is
 * configured local-only — any request the classifier escalates returns
 * 501 (Not Implemented) until you wire up a hosted backend.
 *
 * To enable: set ANTHROPIC_API_KEY or OPENAI_API_KEY in router/.env,
 * then replace this stub with a real client.
 */

export interface HostedGenerateInput {
  prompt: string;
  backend?: 'anthropic' | 'openai';
}

export interface HostedGenerateOutput {
  text: string;
  model: string;
}

export async function generateHosted(_input: HostedGenerateInput): Promise<HostedGenerateOutput> {
  throw Object.assign(
    new Error('Hosted LLM not configured for this router. Set ANTHROPIC_API_KEY or OPENAI_API_KEY and replace src/hosted-client.ts.'),
    { statusCode: 501 },
  );
}
`;
  }

  const defaultBackend = hasAnthropic ? 'anthropic' : 'openai';
  const branches: string[] = [];
  if (hasAnthropic) branches.push(anthropicBranch());
  if (hasOpenai) branches.push(openaiBranch());

  return `/**
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

const DEFAULT_BACKEND: 'anthropic' | 'openai' = '${defaultBackend}';

export async function generateHosted(input: HostedGenerateInput): Promise<HostedGenerateOutput> {
  const backend = input.backend ?? DEFAULT_BACKEND;
${branches.join('\n')}
  throw Object.assign(
    new Error(\`Unknown backend: \${backend}\`),
    { statusCode: 400 },
  );
}
${hasAnthropic ? anthropicHelper() : ''}${hasOpenai ? openaiHelper() : ''}`;
}

function anthropicBranch(): string {
  return `  if (backend === 'anthropic') {
    return callAnthropic(input.prompt);
  }`;
}

function openaiBranch(): string {
  return `  if (backend === 'openai') {
    return callOpenai(input.prompt);
  }`;
}

function anthropicHelper(): string {
  return `
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
    throw new Error(\`anthropic error \${res.status}: \${body}\`);
  }
  const payload = await res.json() as { content?: Array<{ text?: string }> };
  const text = (payload.content ?? []).map((c) => c.text ?? '').join('');
  return { text, model };
}
`;
}

function openaiHelper(): string {
  return `
async function callOpenai(prompt: string): Promise<HostedGenerateOutput> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw Object.assign(
      new Error('OPENAI_API_KEY is unset — cannot escalate to OpenAI.'),
      { statusCode: 501 },
    );
  }
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: \`Bearer \${key}\`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(\`openai error \${res.status}: \${body}\`);
  }
  const payload = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = payload.choices?.[0]?.message?.content ?? '';
  return { text, model };
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
  destination: 'local' | 'hosted' | 'error';
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

// ─── PHI redactor (HIPAA only) ───────────────────────────────────────────

function redactorTs(): string {
  return `/**
 * PHI redactor — runs before any prompt is escalated to a hosted LLM.
 *
 * This is a defense-in-depth filter, not a replacement for a real
 * de-identification pipeline (45 CFR 164.514 Safe Harbor / Expert
 * Determination). It catches the most common PHI shapes — SSN,
 * MRN-style identifiers, US phone numbers, email addresses, dates of
 * birth, and 5+-digit ZIPs — and replaces them with type-tagged
 * placeholders so the hosted LLM can still reason about the prompt's
 * structure.
 *
 * IMPORTANT: review and harden this list against your data corpus
 * before any real PHI flows through the router.
 */

interface RedactionPattern {
  label: string;
  pattern: RegExp;
}

const PATTERNS: RedactionPattern[] = [
  { label: 'SSN', pattern: /\\b\\d{3}-\\d{2}-\\d{4}\\b/g },
  { label: 'PHONE', pattern: /\\b(?:\\+?1[-. ]?)?\\(?\\d{3}\\)?[-. ]?\\d{3}[-. ]?\\d{4}\\b/g },
  { label: 'EMAIL', pattern: /\\b[\\w.+-]+@[\\w-]+\\.[\\w.-]+\\b/g },
  { label: 'MRN', pattern: /\\bMRN[#: ]*\\d{4,}\\b/gi },
  { label: 'DOB', pattern: /\\b(?:0?[1-9]|1[0-2])[\\/-](?:0?[1-9]|[12]\\d|3[01])[\\/-](?:19|20)\\d{2}\\b/g },
  { label: 'ZIP5', pattern: /\\b\\d{5}(?:-\\d{4})?\\b/g },
];

export function redactPhi(input: string): string {
  let out = input;
  for (const { label, pattern } of PATTERNS) {
    out = out.replace(pattern, \`[REDACTED:\${label}]\`);
  }
  return out;
}

/** Exposed for tests — returns the set of redaction labels triggered. */
export function detectPhiLabels(input: string): string[] {
  const hits = new Set<string>();
  for (const { label, pattern } of PATTERNS) {
    if (pattern.test(input)) hits.add(label);
    pattern.lastIndex = 0;
  }
  return Array.from(hits).sort();
}
`;
}

// ─── Confidence self-evaluation ──────────────────────────────────────────

function confidenceTs(hipaa: boolean): string {
  const note = hipaa
    ? ` *\n * HIPAA: the self-evaluation prompt is built from the original input,\n` +
      ` * but never leaves the local Ollama instance. Only the *re-dispatched*\n` +
      ` * follow-up (in server.ts) goes to a hosted LLM, and only after PHI\n` +
      ` * redaction.`
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
  const apis = profile.externalApis ?? [];

  const lines: string[] = [];
  lines.push(`# Local Router Runbook`);
  lines.push('');
  lines.push(`EmbedIQ generated a hybrid-dispatch router for ` +
    `**${profile.businessDomain || 'this project'}**. This runbook covers ` +
    `setup, the smoke test, the routing policy, and the production-hardening checklist.`);
  lines.push('');
  lines.push(`The service exposes a single HTTP endpoint — \`POST /route\` — and ` +
    `decides per request whether to answer locally (Ollama) or escalate to a hosted LLM.`);
  lines.push('');
  lines.push(`## Prerequisites`);
  lines.push('');
  lines.push(`- **Ollama** installed and running locally. See \`OLLAMA_SETUP.md\` for ` +
    `the install runbook generated alongside this router.`);
  lines.push(`- A model pulled locally: \`ollama pull ${profile.defaultLocalModel ?? 'llama3.1:8b'}\`.`);
  if (apis.includes('anthropic')) {
    lines.push(`- An Anthropic API key with the minimum capability required for your workload.`);
  }
  if (apis.includes('openai')) {
    lines.push(`- An OpenAI API key with the minimum capability required for your workload.`);
  }
  lines.push(`- A generated HMAC secret for prompt-hash audit: \`openssl rand -hex 32\`.`);
  lines.push('');
  lines.push(`## Setup`);
  lines.push('');
  lines.push('```bash');
  lines.push(`cp router/.env.example router/.env`);
  lines.push(`$EDITOR router/.env`);
  lines.push(`# Set at least:`);
  lines.push(`#   ROUTER_AUDIT_HASH_KEY (REQUIRED — openssl rand -hex 32)`);
  if (apis.length > 0) lines.push(`#   ${apis.map((a) => (a === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY')).join(' / ')}`);
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
  if (apis.length > 0) {
    lines.push(`# Long prompt — expect route: "hosted" (over the token threshold)`);
    lines.push(`curl -s http://localhost:8787/route \\`);
    lines.push(`     -H 'content-type: application/json' \\`);
    lines.push(`     -d "$(node -e 'process.stdout.write(JSON.stringify({prompt:"explain ".repeat(800)}))')"`);
    lines.push('');
  }
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
      `anything below \`ROUTER_CONFIDENCE_THRESHOLD\` (default 0.55) is re-dispatched to the hosted LLM.`);
  } else {
    lines.push(`3. **Confidence self-evaluation.** Not enabled for this profile. ` +
      `Set \`TECH_021\` in the wizard to enable.`);
  }
  lines.push('');
  if (hipaa) {
    lines.push(`### PHI redaction (HIPAA)`);
    lines.push('');
    lines.push(`Every escalated prompt passes through \`redactor.ts\` before it leaves ` +
      `the host. The redactor catches SSN, MRN-style identifiers, US phone, email, ` +
      `date-of-birth, and 5+-digit ZIP codes by default — review the pattern list against ` +
      `your data before any real PHI flows through.`);
    lines.push('');
    lines.push(`This redactor is **defense in depth**, not a replacement for a real ` +
      `de-identification process per 45 CFR 164.514 (Safe Harbor / Expert ` +
      `Determination).`);
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
      lines.push(`- **HIPAA**: every escalation passes through \`redactor.ts\` before leaving the host.`);
      lines.push(`- **HIPAA**: audit log retains for the required six years.`);
      lines.push(`- **HIPAA**: BAA in place with any hosted LLM you route to.`);
    }
    if (profile.complianceFrameworks.includes('soc2')) {
      lines.push('');
      lines.push(`- **SOC 2**: centralize the routing audit log (SIEM / Splunk / Loki).`);
      lines.push(`- **SOC 2**: quarterly access review on the API keys configured in \`router/.env\`.`);
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
  if (apis.includes('anthropic')) {
    lines.push(`- [ ] \`ANTHROPIC_API_KEY\` stored in a secrets manager with quarterly rotation.`);
  }
  if (apis.includes('openai')) {
    lines.push(`- [ ] \`OPENAI_API_KEY\` stored in a secrets manager with quarterly rotation.`);
  }
  lines.push(`- [ ] Filesystem encryption verified on the host (LUKS / FileVault / BitLocker / EBS).`);
  lines.push(`- [ ] Network policy locked: Ollama bound to localhost; the router itself ` +
    `bound to an internal interface, never the public internet without a reverse proxy + auth.`);
  lines.push(`- [ ] Audit log rotation configured (logrotate / Loki / Splunk).`);
  lines.push(`- [ ] Rate-limit \`POST /route\` at the reverse proxy (e.g., 60 req/min per user).`);
  if (hipaa) {
    lines.push(`- [ ] **HIPAA**: redactor pattern list reviewed against the data corpus.`);
    lines.push(`- [ ] **HIPAA**: smoke-tested with synthetic-PHI payloads ` +
      `— confirm \`redactor.ts\` catches every shape your data contains.`);
    lines.push(`- [ ] **HIPAA**: BAA in place with any hosted LLM provider used here.`);
  }
  lines.push('');
  lines.push(`## What this scaffold is *not*`);
  lines.push('');
  lines.push(`- **Not a production-grade redactor.** The PHI redactor is defense in depth ` +
    `over a real de-identification process.`);
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
  lines.push(`- **Never escalate raw input.** The hosted-client call site assumes its ` +
    `\`prompt\` has already been redacted (where redaction applies).`);
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
    lines.push(`- **All escalations pass through \`redactor.ts\`.** A new escalation path ` +
      `that skips redaction is a HIPAA violation by construction.`);
    lines.push(`- **Treat the redactor as defense in depth.** Real de-identification is ` +
      `the responsibility of the upstream pipeline (45 CFR 164.514).`);
    lines.push(`- **Test the redactor with synthetic PHI fixtures** every time the pattern ` +
      `list changes — golden fixtures in \`tests/fixtures/synthetic-phi/\`.`);
    lines.push('');
  }
  lines.push(`## Hosted-LLM clients`);
  lines.push('');
  lines.push(`- **API keys never live in source.** They live in \`.env\` (gitignored) in ` +
    `dev, and in a real secrets manager in production.`);
  lines.push(`- **Timeouts and retries are caller-defined.** \`generateHosted()\` is a leaf ` +
    `function — the route handler owns budget and retry policy.`);
  lines.push(`- **Errors from the hosted client surface verbatim.** Do not silently fall ` +
    `back to the local model when the hosted call fails — that hides a failure mode ` +
    `the operator needs to see.`);
  lines.push('');
  lines.push(`## Confidence self-evaluation`);
  lines.push('');
  lines.push(`- **Self-evaluation runs on the local model** by design — it does not leave ` +
    `the host. Do not re-implement it against the hosted LLM unless you also re-derive the ` +
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
    lines.push(`- A BAA with any hosted LLM provider used by this router.`);
  }
  lines.push(`- The broader project compliance rules under \`.claude/rules/\`.`);
  lines.push('');
  return lines.join('\n');
}
