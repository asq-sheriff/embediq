import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes, randomUUID } from 'node:crypto';
import { getRequestContext } from '../../context/request-context.js';
import { requireRole } from '../middleware/rbac.js';
import { QuestionBank } from '../../bank/question-bank.js';
import { ProfileBuilder } from '../../engine/profile-builder.js';
import { PriorityAnalyzer } from '../../engine/priority-analyzer.js';
import { domainPackRegistry } from '../../domain-packs/registry.js';
import { DIMENSION_ORDER, type Answer } from '../../types/index.js';
import { InMemoryEventBus } from '../../events/bus.js';
import {
  OWNER_COOKIE_NAME,
  getCookieSecrets,
  signOwnerToken,
} from './cookie.js';
import type { SessionBackend } from './session-backend.js';
import type { DumpWorker } from './dump-worker.js';
import type {
  SerializedAnswer,
  SessionListFilter,
  WizardSession,
} from './types.js';
import { summarize } from './types.js';

export interface SessionRoutesOptions {
  /** TTL applied to newly minted sessions and reflected in the owner cookie. */
  ttlMs: number;
  /** Optional dump worker; when omitted, the dump endpoints return 503. */
  dumpWorker?: DumpWorker;
}

interface CreateSessionBody {
  templateId?: string;
  domainPackId?: string;
}

interface PatchSessionBody {
  answers?: Record<string, SerializedAnswer>;
  currentDimension?: string;
  templateId?: string;
  domainPackId?: string;
  phase?: WizardSession['phase'];
}

export function createSessionRoutes(
  backend: SessionBackend,
  opts: SessionRoutesOptions,
): Router {
  const router = Router();

  const limiterBase = { windowMs: 60_000, standardHeaders: true, legacyHeaders: false, validate: false } as const;
  const createLimiter = rateLimit({ ...limiterBase, limit: 20 });
  const readLimiter = rateLimit({ ...limiterBase, limit: 120 });
  const updateLimiter = rateLimit({ ...limiterBase, limit: 120 });
  const deleteLimiter = rateLimit({ ...limiterBase, limit: 10 });
  const adminListLimiter = rateLimit({ ...limiterBase, limit: 30 });
  const dumpLimiter = rateLimit({
    ...limiterBase,
    limit: 3,
    keyGenerator: (req) =>
      getRequestContext()?.userId ?? req.ip ?? 'anonymous',
  });

  // Lightweight discovery endpoint — lets the vanilla-JS client decide
  // whether to mint a server-side session or fall back to the client-only
  // encrypted checkpoint. Unauthenticated so the welcome screen can call it.
  router.get('/config', readLimiter, (_req: Request, res: Response) => {
    res.json({
      enabled: backend.name !== 'none',
      backend: backend.name,
    });
  });

  router.post('/', createLimiter, async (req: Request, res: Response) => {
    if (backend.name === 'none') {
      res.status(503).json({ error: 'Session persistence is not enabled' });
      return;
    }

    const ctx = getRequestContext();
    const body = (req.body ?? {}) as CreateSessionBody;

    const sessionId = randomUUID();
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + opts.ttlMs).toISOString();

    let ownerToken: string | undefined;
    if (!ctx?.userId) {
      const secrets = getCookieSecrets();
      if (secrets.current) {
        ownerToken = randomBytes(24).toString('base64url');
        res.cookie(OWNER_COOKIE_NAME, signOwnerToken(ownerToken, secrets.current), {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: opts.ttlMs,
        });
      }
    }

    const session: WizardSession = {
      sessionId,
      userId: ctx?.userId,
      ownerToken,
      templateId: body.templateId,
      domainPackId: body.domainPackId,
      phase: 'discovery',
      answers: {},
      generationHistory: [],
      createdAt,
      updatedAt: createdAt,
      expiresAt,
      version: 0,
    };

    const stored = await backend.put(session);

    res.status(201).json({
      sessionId: stored.sessionId,
      resumeUrl: `/?session=${stored.sessionId}`,
      expiresAt: stored.expiresAt,
      version: stored.version,
    });
  });

  router.get('/', adminListLimiter, requireRole('wizard-admin'), async (req: Request, res: Response) => {
    const filter: SessionListFilter = {};
    if (typeof req.query.userId === 'string') filter.userId = req.query.userId;
    if (typeof req.query.updatedAfter === 'string') filter.updatedAfter = req.query.updatedAfter;
    if (typeof req.query.cursor === 'string') filter.cursor = req.query.cursor;
    if (typeof req.query.limit === 'string') {
      const parsed = Number.parseInt(req.query.limit, 10);
      if (Number.isFinite(parsed) && parsed > 0) filter.limit = parsed;
    }

    const result = await backend.list(filter);
    res.json({
      sessions: result.sessions.map(summarize),
      cursor: result.cursor,
    });
  });

  router.post(
    '/:id/dump',
    dumpLimiter,
    requireRole('wizard-admin'),
    (req: Request, res: Response) => {
      if (!opts.dumpWorker) {
        res.status(503).json({ error: 'Session dumps are not enabled' });
        return;
      }
      const ctx = getRequestContext();
      const loaded = ctx?.sessionStore?.current();
      if (!loaded || loaded.sessionId !== req.params.id) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      const job = opts.dumpWorker.enqueue(req.params.id);
      res.status(202).json({
        dumpId: job.dumpId,
        status: job.status,
        expiresAt: job.expiresAt,
      });
    },
  );

  router.get(
    '/dumps/:dumpId',
    readLimiter,
    requireRole('wizard-admin'),
    (req: Request, res: Response) => {
      if (!opts.dumpWorker) {
        res.status(503).json({ error: 'Session dumps are not enabled' });
        return;
      }
      const job = opts.dumpWorker.getJob(String(req.params.dumpId));
      if (!job) {
        res.status(404).json({ error: 'Dump not found' });
        return;
      }
      res.json({
        dumpId: job.dumpId,
        sessionId: job.sessionId,
        status: job.status,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        expiresAt: job.expiresAt,
        error: job.error,
        downloadUrl: job.status === 'ready' ? `/api/sessions/dumps/${job.dumpId}/download` : undefined,
      });
    },
  );

  router.get(
    '/dumps/:dumpId/download',
    readLimiter,
    requireRole('wizard-admin'),
    async (req: Request, res: Response) => {
      if (!opts.dumpWorker) {
        res.status(503).json({ error: 'Session dumps are not enabled' });
        return;
      }
      const streamed = await opts.dumpWorker.streamToResponse(
        String(req.params.dumpId),
        res,
      );
      if (!streamed) {
        res.status(404).json({ error: 'Dump not ready or not found' });
      }
    },
  );

  router.get('/:id', readLimiter, (req: Request, res: Response) => {
    const ctx = getRequestContext();
    const store = ctx?.sessionStore;
    const session = store?.current();
    if (!session || session.sessionId !== req.params.id) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  });

  // Resume coordinates — server-side computation of where the wizard
  // should land when a session is reopened from a shared URL or
  // bookmark. Returns the session, the dimension and question index to
  // jump to, the partial profile (so playback can preview the state
  // before completion), and a contributors map proving who answered what.
  router.get('/:id/resume', readLimiter, (req: Request, res: Response) => {
    const ctx = getRequestContext();
    const store = ctx?.sessionStore;
    const session = store?.current();
    if (!session || session.sessionId !== req.params.id) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(buildResumeView(session));
  });

  router.patch('/:id', updateLimiter, (req: Request, res: Response) => {
    const ctx = getRequestContext();
    const store = ctx?.sessionStore;
    const session = store?.current();
    if (!store || !session || session.sessionId !== req.params.id) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const body = (req.body ?? {}) as PatchSessionBody;
    // Stamp the contributor server-side from the request context. The
    // client cannot supply this — multi-stakeholder workflows depend on
    // attribution being authoritative, so any `contributedBy` in the body
    // is stripped and replaced with the request context's userId (or
    // dropped entirely when there is no authenticated user).
    const contributor = ctx?.userId;
    store.mutate((s) => {
      if (body.answers) {
        const stamped: Record<string, SerializedAnswer> = {};
        for (const [id, answer] of Object.entries(body.answers)) {
          const { contributedBy: _ignored, ...rest } = answer;
          stamped[id] = contributor
            ? { ...rest, contributedBy: contributor }
            : rest;
        }
        s.answers = { ...s.answers, ...stamped };
      }
      if (body.currentDimension !== undefined) s.currentDimension = body.currentDimension;
      if (body.templateId !== undefined) s.templateId = body.templateId;
      if (body.domainPackId !== undefined) s.domainPackId = body.domainPackId;
      if (body.phase !== undefined) s.phase = body.phase;
      s.updatedAt = new Date().toISOString();
    });

    res.json(session);
  });

  // (helper buildResumeView is defined at the bottom of this file)

  router.delete('/:id', deleteLimiter, async (req: Request, res: Response) => {
    const ctx = getRequestContext();
    const loaded = ctx?.sessionStore?.current();
    if (!loaded || loaded.sessionId !== req.params.id) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const deleted = await backend.delete(req.params.id);
    res.json({ deleted });
  });

  return router;
}

// ─── Resume computation ───────────────────────────────────────────────────

interface ResumeView {
  session: WizardSession;
  /** Index into DIMENSION_ORDER where the next unanswered visible question lives. */
  nextDimensionIndex: number;
  /** Index within the visible questions of that dimension. */
  nextQuestionIndex: number;
  /** True when every visible question across every dimension is answered. */
  complete: boolean;
  /** Partial profile reconstructed from the session's answers. */
  profile: ReturnType<ProfileBuilder['build']> | null;
  /** Map from contributing userId to the count of answers they supplied. */
  contributors: Record<string, number>;
  /** Aggregate visibility totals — useful for "X of Y answered" headers. */
  totals: {
    answered: number;
    visible: number;
  };
}

/**
 * Walk the question bank with the session's persisted answers in hand
 * and compute where the wizard should resume. Pure function — no I/O,
 * no state mutation. Designed to be called from the resume route and
 * also reused by tests.
 */
export function buildResumeView(session: WizardSession): ResumeView {
  const answers = hydrateSerializedAnswers(session.answers);
  const domainPack = resolveDomainPackForAnswers(answers);
  const bank = new QuestionBank(domainPack);

  let nextDimensionIndex = -1;
  let nextQuestionIndex = -1;
  let totalVisible = 0;
  let totalAnswered = 0;

  for (let i = 0; i < DIMENSION_ORDER.length; i++) {
    const dim = DIMENSION_ORDER[i];
    const visible = bank.getVisibleQuestions(dim, answers);
    totalVisible += visible.length;
    for (let j = 0; j < visible.length; j++) {
      const answered = answers.has(visible[j].id);
      if (answered) {
        totalAnswered++;
      } else if (nextDimensionIndex === -1) {
        nextDimensionIndex = i;
        nextQuestionIndex = j;
      }
    }
  }

  const complete = nextDimensionIndex === -1;
  if (complete) {
    // No unanswered questions — point the cursor at the last dimension's
    // last question so the client can land on Playback rather than Q&A.
    nextDimensionIndex = DIMENSION_ORDER.length - 1;
    nextQuestionIndex = Math.max(
      0,
      bank.getVisibleQuestions(DIMENSION_ORDER[nextDimensionIndex], answers).length - 1,
    );
  }

  // Partial profile — useful for resume banner ("Industry: Healthcare,
  // Role: Developer") even before the wizard finishes.
  let profile: ReturnType<ProfileBuilder['build']> | null = null;
  if (answers.size > 0) {
    const builder = new ProfileBuilder(new InMemoryEventBus());
    profile = builder.build(answers);
    profile.priorities = new PriorityAnalyzer().analyze(answers, bank.getAll());
  }

  const contributors: Record<string, number> = {};
  for (const answer of Object.values(session.answers)) {
    if (!answer.contributedBy) continue;
    contributors[answer.contributedBy] = (contributors[answer.contributedBy] ?? 0) + 1;
  }

  return {
    session,
    nextDimensionIndex,
    nextQuestionIndex,
    complete,
    profile,
    contributors,
    totals: { answered: totalAnswered, visible: totalVisible },
  };
}

function hydrateSerializedAnswers(
  serialized: Record<string, SerializedAnswer>,
): Map<string, Answer> {
  const out = new Map<string, Answer>();
  for (const [id, entry] of Object.entries(serialized)) {
    out.set(id, {
      questionId: entry.questionId,
      value: entry.value,
      timestamp: new Date(entry.timestamp),
    });
  }
  return out;
}

function resolveDomainPackForAnswers(answers: Map<string, Answer>) {
  const industryAnswer = answers.get('STRAT_002');
  if (!industryAnswer) return undefined;
  return domainPackRegistry.getForIndustry(String(industryAnswer.value));
}
