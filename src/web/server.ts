import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { QuestionBank } from '../bank/question-bank.js';
import { BranchEvaluator } from '../engine/branch-evaluator.js';
import { ProfileBuilder } from '../engine/profile-builder.js';
import { PriorityAnalyzer } from '../engine/priority-analyzer.js';
import { SynthesizerOrchestrator } from '../synthesizer/orchestrator.js';
import { FileOutputManager } from '../util/file-output.js';
import { analyzeDiffs } from '../synthesizer/diff-analyzer.js';
import { createAuthMiddleware, authenticateRequest, type AuthStrategy } from './middleware/auth.js';
import { requireRole } from './middleware/rbac.js';
import { BasicAuthStrategy } from './middleware/strategies/basic.js';
import { OidcAuthStrategy } from './middleware/strategies/oidc.js';
import { ProxyHeaderStrategy } from './middleware/strategies/header.js';
import { loadTemplates } from '../bank/profile-templates.js';
import { domainPackRegistry } from '../domain-packs/registry.js';
import { skillRegistry } from '../skills/skill-registry.js';
import { summarizeSkill } from '../skills/skill.js';
import {
  parseTargets,
  parseTargetsFromEnv,
  InvalidTargetError,
  type TargetFormat,
} from '../synthesizer/target-format.js';
import { createRequestContext, runWithContext, getRequestContext } from '../context/request-context.js';
import { initTelemetry, withSpan, getTracer } from '../observability/telemetry.js';
import { getEventBus, registerDefaultSubscribers } from '../events/index.js';
import {
  DumpWorker,
  NullBackend,
  createSessionRoutes,
  resolveTtlMs,
  selectSessionBackend,
  sessionMiddleware,
  type SessionBackend,
  type WizardSession,
} from './sessions/index.js';
import { DIMENSION_ORDER, type Answer, type SetupConfig } from '../types/index.js';
import {
  AutopilotScheduler,
  JsonAutopilotStore,
  runAutopilot,
  summarizeSchedule,
  CADENCE_VALUES,
  type Cadence,
  type AutopilotSchedule,
  type ScheduleCreateInput,
} from '../autopilot/index.js';
import {
  defaultComplianceRegistry,
  signingSecretEnvVar,
  type ComplianceAdapterRegistry,
  type ComplianceEvent,
} from '../integrations/compliance/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function selectAuthStrategy(): AuthStrategy | null {
  const strategyName = process.env.EMBEDIQ_AUTH_STRATEGY;

  // Backward compat: auto-detect basic when user/pass are set without explicit strategy
  if (!strategyName && process.env.EMBEDIQ_AUTH_USER && process.env.EMBEDIQ_AUTH_PASS) {
    return new BasicAuthStrategy(process.env.EMBEDIQ_AUTH_USER, process.env.EMBEDIQ_AUTH_PASS);
  }

  switch (strategyName) {
    case 'basic':
      return new BasicAuthStrategy(
        process.env.EMBEDIQ_AUTH_USER || '',
        process.env.EMBEDIQ_AUTH_PASS || '',
      );
    case 'oidc':
      return new OidcAuthStrategy({
        issuerUrl: process.env.EMBEDIQ_OIDC_ISSUER || '',
        clientId: process.env.EMBEDIQ_OIDC_CLIENT_ID || '',
        clientSecret: process.env.EMBEDIQ_OIDC_CLIENT_SECRET || '',
        rolesClaim: process.env.EMBEDIQ_OIDC_ROLES_CLAIM || 'roles',
      });
    case 'proxy':
      return new ProxyHeaderStrategy({
        userHeader: process.env.EMBEDIQ_PROXY_USER_HEADER || 'X-Forwarded-User',
        rolesHeader: process.env.EMBEDIQ_PROXY_ROLES_HEADER || 'X-EmbedIQ-Roles',
      });
    case 'none':
      return null;
    default:
      return null;
  }
}

// ─── App Factory (exported for testing) ───

export interface CreateAppOptions {
  /** Session persistence backend. Defaults to a NullBackend (stateless). */
  backend?: SessionBackend;
  /** Dump worker for admin session exports. Omitted when backend is NullBackend. */
  dumpWorker?: DumpWorker;
  /**
   * Autopilot store + scheduler. Inject for tests; in production these are
   * created from EMBEDIQ_AUTOPILOT_ENABLED / EMBEDIQ_AUTOPILOT_DIR.
   */
  autopilotStore?: import('../autopilot/index.js').JsonAutopilotStore;
  autopilotScheduler?: import('../autopilot/index.js').AutopilotScheduler;
  /**
   * Adapter registry for inbound compliance webhooks. Defaults to the
   * module-level registry populated with Drata / Vanta / generic adapters.
   */
  complianceRegistry?: import('../integrations/compliance/index.js').ComplianceAdapterRegistry;
}

export function createApp(opts: CreateAppOptions = {}) {
  const backend = opts.backend ?? new NullBackend();
  const dumpWorker =
    opts.dumpWorker ??
    (backend.name === 'none'
      ? undefined
      : new DumpWorker(backend, {
          dir: process.env.EMBEDIQ_DUMP_DIR?.trim() || './.embediq/dumps',
        }));
  const app = express();
  // `verify` callback stashes the raw request body on `req.rawBody` so
  // downstream routes that need byte-exact payloads (HMAC signature
  // verification on compliance webhooks) can reach it. JSON-parsing
  // reorders keys and strips whitespace, both of which break HMACs.
  app.use(express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }));

  // ─── Authentication ───
  const authStrategy = selectAuthStrategy();
  if (authStrategy) {
    app.use(createAuthMiddleware(authStrategy));
  }

  // ─── Request Context ───
  // Wraps each request in an AsyncLocalStorage context carrying requestId,
  // authenticated user info, and timing data. Downstream code can call
  // getRequestContext() without explicit parameter threading.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const ctx = createRequestContext({
      userId: req.embediqUser?.userId,
      displayName: req.embediqUser?.displayName,
      roles: req.embediqUser?.roles,
    });
    runWithContext(ctx, () => {
      // Start a trace span for this request (noop when OTel not enabled)
      const tracer = getTracer();
      const span = tracer.startSpan(`${req.method} ${req.path}`, {
        attributes: {
          'http.method': req.method,
          'http.url': req.originalUrl,
          'embediq.request_id': ctx.requestId,
          ...(ctx.userId ? { 'embediq.user_id': ctx.userId } : {}),
        },
      });
      res.on('finish', () => {
        span.setAttribute('http.status_code', res.statusCode);
        span.end();
      });
      next();
    });
  });

  // ─── Session Persistence ───
  // No-op when backend is NullBackend; otherwise loads any sessionId from
  // header/body/query into the request context and persists dirty state
  // on response finish.
  app.use(sessionMiddleware(backend));

  app.use(
    '/api/sessions',
    createSessionRoutes(backend, { ttlMs: resolveTtlMs(), dumpWorker }),
  );

  // ─── Autopilot ───
  // Opt-in via EMBEDIQ_AUTOPILOT_ENABLED. When disabled, the routes return
  // 503 so callers can detect feature availability without a feature flag
  // round-trip. Tests inject autopilotStore directly.
  const autopilotStore = opts.autopilotStore
    ?? (process.env.EMBEDIQ_AUTOPILOT_ENABLED === 'true'
      ? new JsonAutopilotStore()
      : undefined);
  if (autopilotStore) {
    const complianceRegistry = opts.complianceRegistry ?? defaultComplianceRegistry;
    mountAutopilotRoutes(app, autopilotStore, complianceRegistry);
    const scheduler = opts.autopilotScheduler ?? new AutopilotScheduler({ store: autopilotStore });
    if (!opts.autopilotScheduler) scheduler.start();
  }

  app.use(express.static(join(__dirname, 'public')));

  const bank = new QuestionBank();
  const evaluator = new BranchEvaluator();
  const profileBuilder = new ProfileBuilder();
  const priorityAnalyzer = new PriorityAnalyzer();

  // ─── Health & Readiness ───

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: process.env.npm_package_version || '2.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', (_req, res) => {
    const questions = bank.getAll();
    if (questions.length > 0) {
      res.json({ ready: true, questionCount: questions.length });
    } else {
      res.status(503).json({ ready: false, reason: 'Question bank not loaded' });
    }
  });

  // ─── Rate Limiting ───
  const generateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Too many generation requests. Please wait before retrying.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/generate', generateLimiter);

  // ─── API Routes ───

  // Get available configuration templates
  app.get('/api/templates', (_req, res) => {
    const templates = loadTemplates();
    res.json(templates);
  });

  // Get available domain packs
  app.get('/api/domain-packs', (_req, res) => {
    const packs = domainPackRegistry.getAll();
    res.json(packs.map(p => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      questionCount: p.questions.length,
      complianceFrameworks: p.complianceFrameworks.map(f => f.key),
    })));
  });

  // Get all dimensions
  app.get('/api/dimensions', (_req, res) => {
    res.json(DIMENSION_ORDER.map((d, i) => ({ id: i, name: d })));
  });

  // List all available skills (built-in + external)
  app.get('/api/skills', (_req, res) => {
    res.json(skillRegistry.list().map(summarizeSkill));
  });

  // Get a specific skill by id
  app.get('/api/skills/:id', (req, res) => {
    const skill = skillRegistry.getById(req.params.id);
    if (!skill) {
      res.status(404).json({ error: `Unknown skill id: ${req.params.id}` });
      return;
    }
    res.json(summarizeSkill(skill));
  });

  // Get visible questions for a dimension, given current answers
  app.post('/api/questions', (req, res) => {
    const { dimension, answers: rawAnswers } = req.body as {
      dimension: string;
      answers: Record<string, { value: unknown; timestamp: string }>;
    };

    const answers = hydrateAnswers(rawAnswers);
    const dim = DIMENSION_ORDER.find(d => d === dimension);
    if (!dim) {
      res.status(400).json({ error: 'Invalid dimension' });
      return;
    }

    const questions = bank.getVisibleQuestions(dim, answers);
    res.json(questions);
  });

  // Build profile from answers
  app.post('/api/profile', (req, res) => {
    const { answers: rawAnswers } = req.body as {
      answers: Record<string, { value: unknown; timestamp: string }>;
    };

    const answers = hydrateAnswers(rawAnswers);
    const profile = profileBuilder.build(answers);
    profile.priorities = priorityAnalyzer.analyze(answers, bank.getAll());

    // Convert Map to plain object for JSON serialization
    const serializable = {
      ...profile,
      answers: Object.fromEntries(profile.answers),
    };

    res.json(serializable);
  });

  // Generate configuration files
  app.post('/api/generate', requireRole('wizard-admin'), async (req, res) => {
    const { answers: rawAnswers, targetDir, sessionId: clientSessionId, targets: rawTargets } = req.body as {
      answers: Record<string, { value: unknown; timestamp: string }>;
      targetDir: string;
      sessionId?: string;
      targets?: string | string[];
    };

    if (!targetDir) {
      res.status(400).json({ error: 'targetDir is required' });
      return;
    }

    let targets: TargetFormat[];
    try {
      targets = rawTargets !== undefined ? parseTargets(rawTargets) : parseTargetsFromEnv();
    } catch (err) {
      if (err instanceof InvalidTargetError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }

    // Stamp the wizard session ID onto the request context so every event
    // emitted during this handler carries it automatically (for WS filtering).
    // Client may supply a sessionId to match its prior WebSocket subscription;
    // otherwise we mint a fresh one.
    const sessionId = typeof clientSessionId === 'string' && clientSessionId
      ? clientSessionId
      : randomUUID();
    const ctx = getRequestContext();
    if (ctx) ctx.sessionId = sessionId;

    const bus = getEventBus();

    bus.emit('session:started', { sessionId });

    // When a server-side session is loaded, merge its persisted answers with
    // the request body. Body answers win on overlap (newest user input);
    // session answers fill in anything the body omitted (resume scenarios).
    const loadedSession = ctx?.sessionStore?.current();
    const answers = mergeSessionAnswers(loadedSession, rawAnswers);

    // ProfileBuilder.build() emits profile:built via the bus — no direct emit needed here.
    const profile = profileBuilder.build(answers);
    profile.priorities = priorityAnalyzer.analyze(answers, bank.getAll());

    const domainPack = resolveDomainPack(answers);
    const config: SetupConfig = { profile, targetDir, domainPack, targets };
    const synthesizer = new SynthesizerOrchestrator();
    // Orchestrator emits generation:started, file:generated (per file),
    // and validation:completed internally.
    const { files, validation } = await synthesizer.generateWithValidation(config);

    const outputManager = new FileOutputManager(targetDir);
    outputManager.ensureTargetDir();
    const { written, errors } = outputManager.writeAll(files);

    if (loadedSession && ctx?.sessionStore) {
      ctx.sessionStore.mutate((s) => {
        for (const [id, answer] of answers) {
          s.answers[id] = {
            questionId: answer.questionId,
            value: answer.value,
            timestamp: answer.timestamp.toISOString(),
          };
        }
        s.phase = 'complete';
        s.generationHistory.push({
          runId: randomUUID(),
          timestamp: new Date().toISOString(),
          fileCount: written.length,
          validationPassed: validation.passed,
          targetDir,
        });
        s.updatedAt = new Date().toISOString();
      });
    }

    bus.emit('session:completed', { sessionId, fileCount: written.length });

    res.json({
      files: files.map(f => ({
        path: f.relativePath,
        description: f.description,
        written: written.includes(f.relativePath),
      })),
      errors,
      totalWritten: written.length,
      validation,
    });
  });

  // Preview generated files (without writing)
  app.post('/api/preview', async (req, res) => {
    const { answers: rawAnswers, targets: rawTargets } = req.body as {
      answers: Record<string, { value: unknown; timestamp: string }>;
      targets?: string | string[];
    };

    let targets: TargetFormat[];
    try {
      targets = rawTargets !== undefined ? parseTargets(rawTargets) : parseTargetsFromEnv();
    } catch (err) {
      if (err instanceof InvalidTargetError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }

    const answers = hydrateAnswers(rawAnswers);
    const profile = profileBuilder.build(answers);
    profile.priorities = priorityAnalyzer.analyze(answers, bank.getAll());

    const domainPack = resolveDomainPack(answers);
    const config: SetupConfig = { profile, targetDir: '/preview', domainPack, targets };
    const synthesizer = new SynthesizerOrchestrator();
    const { files, validation } = await synthesizer.generateWithValidation(config);

    res.json({
      files: files.map(f => ({
        path: f.relativePath,
        description: f.description,
        content: f.content,
      })),
      validation,
    });
  });

  // Analyze diffs between generated files and existing files at target
  app.post('/api/diff', async (req, res) => {
    const { answers: rawAnswers, targetDir, targets: rawTargets } = req.body as {
      answers: Record<string, { value: unknown; timestamp: string }>;
      targetDir: string;
      targets?: string | string[];
    };

    if (!targetDir) {
      res.status(400).json({ error: 'targetDir is required' });
      return;
    }

    let targets: TargetFormat[];
    try {
      targets = rawTargets !== undefined ? parseTargets(rawTargets) : parseTargetsFromEnv();
    } catch (err) {
      if (err instanceof InvalidTargetError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }

    const answers = hydrateAnswers(rawAnswers);
    const profile = profileBuilder.build(answers);
    profile.priorities = priorityAnalyzer.analyze(answers, bank.getAll());

    const config: SetupConfig = { profile, targetDir, targets };
    const synthesizer = new SynthesizerOrchestrator();
    const { files } = await synthesizer.generateWithValidation(config);

    const diff = analyzeDiffs(files, targetDir);

    res.json({
      results: diff.results.map(r => ({
        path: r.file.relativePath,
        status: r.status,
      })),
      newFiles: diff.newFiles,
      modifiedFiles: diff.modifiedFiles,
      unchangedFiles: diff.unchangedFiles,
      conflictFiles: diff.conflictFiles,
    });
  });

  return app;
}

// ─── Helpers ───

function resolveDomainPack(answers: Map<string, Answer>) {
  const industryAnswer = answers.get('STRAT_002');
  if (!industryAnswer) return undefined;
  return domainPackRegistry.getForIndustry(String(industryAnswer.value));
}

// ─── Autopilot routes ───
//
// Schedule CRUD lives under /api/autopilot/schedules. Webhook endpoint at
// /api/autopilot/webhook/:scheduleId triggers a one-off run on demand —
// guarded by an optional shared secret (EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET)
// so external systems (Drata, Vanta, CI pipelines, etc.) can fire it
// without authenticating to the wizard's main auth strategy.
function mountAutopilotRoutes(
  app: express.Express,
  store: JsonAutopilotStore,
  complianceRegistry: ComplianceAdapterRegistry,
): void {
  app.get('/api/autopilot/schedules', async (_req, res) => {
    const all = await store.listSchedules();
    res.json(all.map(summarizeSchedule));
  });

  app.get('/api/autopilot/schedules/:id', async (req, res) => {
    const schedule = await store.getSchedule(req.params.id);
    if (!schedule) {
      res.status(404).json({ error: `Unknown schedule id: ${req.params.id}` });
      return;
    }
    res.json(summarizeSchedule(schedule));
  });

  app.post('/api/autopilot/schedules', async (req, res) => {
    const body = (req.body ?? {}) as Partial<ScheduleCreateInput>;
    const validation = validateScheduleInput(body);
    if (!validation.value) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const created = await store.addSchedule(validation.value);
    res.status(201).json(summarizeSchedule(created));
  });

  app.delete('/api/autopilot/schedules/:id', async (req, res) => {
    const deleted = await store.deleteSchedule(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: `Unknown schedule id: ${req.params.id}` });
      return;
    }
    res.json({ deleted: true });
  });

  app.get('/api/autopilot/runs', async (req, res) => {
    const scheduleId = typeof req.query.scheduleId === 'string' ? req.query.scheduleId : undefined;
    const limitRaw = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
    const limit = Number.isFinite(limitRaw) && limitRaw! > 0 ? limitRaw : undefined;
    const runs = await store.listRuns({ scheduleId, limit });
    res.json(runs);
  });

  app.post('/api/autopilot/webhook/:scheduleId', async (req, res) => {
    const expectedSecret = process.env.EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET;
    if (expectedSecret) {
      const presented = req.header('x-embediq-autopilot-secret');
      if (presented !== expectedSecret) {
        res.status(401).json({ error: 'Invalid autopilot webhook secret' });
        return;
      }
    }
    const schedule = await store.getSchedule(req.params.scheduleId);
    if (!schedule) {
      res.status(404).json({ error: `Unknown schedule id: ${req.params.scheduleId}` });
      return;
    }
    const run = await runAutopilot(schedule, store, { trigger: 'webhook' });
    res.status(202).json(run);
  });

  // ─── Inbound compliance webhooks (6J) ──────────────────────────────
  //
  // Routes: POST /api/autopilot/compliance/:adapterId
  //   adapterId ∈ { drata, vanta, generic, …any registered }
  //
  // Shared secret guard reuses EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET — compliance
  // platforms authenticate with the same header as the direct schedule
  // webhooks. Future adapters may add platform-specific signature checks
  // on top (e.g. HMAC verification) without changing this route.
  //
  // Matching: the adapter produces a canonical `ComplianceEvent` with a
  // `framework` identifier. We fire an autopilot run for every enabled
  // schedule whose `complianceFrameworks` list includes that framework.
  // A payload that matches no schedule returns 200 + skipped so the
  // compliance platform doesn't retry.
  app.post('/api/autopilot/compliance/:adapterId', async (req, res) => {
    const expectedSecret = process.env.EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET;
    if (expectedSecret) {
      const presented = req.header('x-embediq-autopilot-secret');
      if (presented !== expectedSecret) {
        res.status(401).json({ error: 'Invalid autopilot webhook secret' });
        return;
      }
    }

    const adapter = complianceRegistry.get(req.params.adapterId);
    if (!adapter) {
      res.status(404).json({ error: `Unknown compliance adapter: ${req.params.adapterId}` });
      return;
    }

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers[k.toLowerCase()] = v;
      else if (Array.isArray(v) && v.length > 0) headers[k.toLowerCase()] = v[0];
    }

    // Per-adapter HMAC signature verification. Opt-in by setting the
    // adapter's signing-secret env var. Unset → skip (backwards-
    // compatible with the shared-secret-header-only guard above). Set
    // but adapter doesn't implement verifySignature → accept (custom
    // adapter without HMAC support).
    const hmacSecret = process.env[signingSecretEnvVar(adapter.id)];
    if (hmacSecret && adapter.verifySignature) {
      const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;
      if (!rawBody) {
        res.status(400).json({ error: 'Raw body unavailable for signature verification' });
        return;
      }
      const ok = adapter.verifySignature({ rawBody, headers, secret: hmacSecret });
      if (!ok) {
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }
    }

    let event: ComplianceEvent | null;
    try {
      event = adapter.translate({ body: req.body, headers });
    } catch (err) {
      res.status(400).json({
        error: `Adapter "${adapter.id}" failed to parse payload`,
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (!event) {
      res.status(200).json({ skipped: true, reason: 'Adapter ignored the payload' });
      return;
    }

    // Match event.framework against each schedule's complianceFrameworks.
    const schedules = await store.listSchedules();
    const eligible = schedules.filter((s) =>
      s.enabled
      && Array.isArray(s.complianceFrameworks)
      && s.complianceFrameworks.includes(event!.framework),
    );

    if (eligible.length === 0) {
      res.status(200).json({
        skipped: true,
        reason: `No schedules configured for framework "${event.framework}"`,
        event,
      });
      return;
    }

    const runs = [];
    for (const schedule of eligible) {
      runs.push(await runAutopilot(schedule, store, { trigger: 'webhook' }));
    }
    res.status(202).json({ event, runs });
  });
}

function validateScheduleInput(body: Partial<ScheduleCreateInput>):
  | { error: string; value?: undefined }
  | { error?: undefined; value: ScheduleCreateInput } {
  if (!body.name || typeof body.name !== 'string') {
    return { error: '`name` is required and must be a string' };
  }
  if (!body.cadence || !(CADENCE_VALUES as readonly string[]).includes(body.cadence)) {
    return { error: `\`cadence\` must be one of ${CADENCE_VALUES.join(', ')}` };
  }
  if (!body.answerSourcePath || typeof body.answerSourcePath !== 'string') {
    return { error: '`answerSourcePath` is required and must be a string' };
  }
  if (!body.targetDir || typeof body.targetDir !== 'string') {
    return { error: '`targetDir` is required and must be a string' };
  }
  return {
    value: {
      name: body.name,
      cadence: body.cadence as Cadence,
      answerSourcePath: body.answerSourcePath,
      targetDir: body.targetDir,
      targets: body.targets,
      driftAlertThreshold: body.driftAlertThreshold,
      complianceFrameworks: Array.isArray(body.complianceFrameworks)
        ? body.complianceFrameworks.filter((f) => typeof f === 'string')
        : undefined,
      enabled: body.enabled,
    },
  };
}

function mergeSessionAnswers(
  session: WizardSession | null | undefined,
  rawBodyAnswers: Record<string, { value: unknown; timestamp: string }> | undefined,
): Map<string, Answer> {
  const merged = new Map<string, Answer>();
  if (session) {
    for (const [id, entry] of Object.entries(session.answers)) {
      merged.set(id, {
        questionId: entry.questionId,
        value: entry.value,
        timestamp: new Date(entry.timestamp),
      });
    }
  }
  if (rawBodyAnswers) {
    for (const [id, data] of Object.entries(rawBodyAnswers)) {
      merged.set(id, {
        questionId: id,
        value: data.value as string | string[] | number | boolean,
        timestamp: new Date(data.timestamp),
      });
    }
  }
  return merged;
}

function hydrateAnswers(raw: Record<string, { value: unknown; timestamp: string }>): Map<string, Answer> {
  const map = new Map<string, Answer>();
  if (!raw) return map;

  for (const [id, data] of Object.entries(raw)) {
    map.set(id, {
      questionId: id,
      value: data.value as string | string[] | number | boolean,
      timestamp: new Date(data.timestamp),
    });
  }
  return map;
}

// ─── Start (only when run directly, not when imported for tests) ───

const isDirectRun = process.argv[1] && (
  process.argv[1].includes('server.ts') ||
  process.argv[1].includes('server.js')
);

if (isDirectRun) {
  await initTelemetry();

  const sessionBackend = await selectSessionBackend();
  const wss = new WebSocketServer({ noServer: true });
  registerDefaultSubscribers(getEventBus(), {
    enableAudit: true,
    enableMetrics: true,
    enableStatus: true,
    enableOtel: process.env.EMBEDIQ_OTEL_ENABLED === 'true',
    wsServer: wss,
    sessionBackend,
  });

  const app = createApp({ backend: sessionBackend });
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const tlsCert = process.env.EMBEDIQ_TLS_CERT;
  const tlsKey = process.env.EMBEDIQ_TLS_KEY;

  const protocol = tlsCert && tlsKey ? 'https' : 'http';
  const authStrategy = selectAuthStrategy();
  const authStatus = authStrategy ? `Auth: ${authStrategy.name}` : 'Auth: off (local mode)';

  const handleUpgrade = async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url !== '/ws/events') {
      socket.destroy();
      return;
    }
    // Under an active auth strategy, verify credentials before the handshake.
    // In no-auth local mode, accept all upgrades.
    if (authStrategy) {
      const result = await authenticateRequest(req as unknown as Request, authStrategy);
      if (!result) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      if (!result.roles.includes('wizard-user') && !result.roles.includes('wizard-admin')) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      (req as unknown as { embediqUser?: typeof result }).embediqUser = result;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  };

  const onListening = () => {
    console.log('');
    console.log('  ┌─────────────────────────────────────────┐');
    console.log('  │                                         │');
    console.log('  │   EmbedIQ by Praglogic                  │');
    console.log('  │   Claude Code Setup Wizard              │');
    console.log('  │                                         │');
    console.log(`  │   ${protocol}://localhost:${PORT}${' '.repeat(Math.max(0, 19 - protocol.length - String(PORT).length))}│`);
    console.log(`  │   ${authStatus.padEnd(37)}│`);
    console.log('  │                                         │');
    console.log('  └─────────────────────────────────────────┘');
    console.log('');
  };

  let server: http.Server | https.Server;
  if (tlsCert && tlsKey) {
    const httpsOptions = {
      cert: readFileSync(tlsCert),
      key: readFileSync(tlsKey),
    };
    server = https.createServer(httpsOptions, app);
  } else {
    server = http.createServer(app);
  }
  server.on('upgrade', handleUpgrade);
  server.listen(PORT, onListening);
}
