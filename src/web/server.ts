import express from 'express';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import * as https from 'node:https';
import { QuestionBank } from '../bank/question-bank.js';
import { BranchEvaluator } from '../engine/branch-evaluator.js';
import { ProfileBuilder } from '../engine/profile-builder.js';
import { PriorityAnalyzer } from '../engine/priority-analyzer.js';
import { SynthesizerOrchestrator } from '../synthesizer/orchestrator.js';
import { FileOutputManager } from '../util/file-output.js';
import { analyzeDiffs } from '../synthesizer/diff-analyzer.js';
import { auditLog } from '../util/wizard-audit.js';
import { createAuthMiddleware, type AuthStrategy } from './middleware/auth.js';
import { requireRole } from './middleware/rbac.js';
import { BasicAuthStrategy } from './middleware/strategies/basic.js';
import { OidcAuthStrategy } from './middleware/strategies/oidc.js';
import { ProxyHeaderStrategy } from './middleware/strategies/header.js';
import { loadTemplates } from '../bank/profile-templates.js';
import { domainPackRegistry } from '../domain-packs/registry.js';
import { DIMENSION_ORDER, type Answer, type SetupConfig } from '../types/index.js';

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

export function createApp() {
  const app = express();
  app.use(express.json());

  // ─── Authentication ───
  const authStrategy = selectAuthStrategy();
  if (authStrategy) {
    app.use(createAuthMiddleware(authStrategy));
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
  app.post('/api/generate', requireRole('wizard-admin'), (req, res) => {
    const { answers: rawAnswers, targetDir } = req.body as {
      answers: Record<string, { value: unknown; timestamp: string }>;
      targetDir: string;
    };

    if (!targetDir) {
      res.status(400).json({ error: 'targetDir is required' });
      return;
    }

    const userId = req.embediqUser?.userId;

    auditLog({
      timestamp: new Date().toISOString(),
      eventType: 'session_start',
      userId,
    });

    const answers = hydrateAnswers(rawAnswers);
    const profile = profileBuilder.build(answers);
    profile.priorities = priorityAnalyzer.analyze(answers, bank.getAll());

    auditLog({
      timestamp: new Date().toISOString(),
      eventType: 'profile_built',
      userId,
      profileSummary: {
        role: profile.role,
        industry: profile.industry,
        teamSize: profile.teamSize,
        complianceFrameworks: profile.complianceFrameworks,
        securityLevel: profile.securityConcerns.includes('strict_permissions') ? 'strict' : 'standard',
        fileCount: 0,
      },
    });

    const domainPack = resolveDomainPack(answers);
    const config: SetupConfig = { profile, targetDir, domainPack };
    const synthesizer = new SynthesizerOrchestrator();
    const { files, validation } = synthesizer.generateWithValidation(config);

    auditLog({
      timestamp: new Date().toISOString(),
      eventType: 'validation_result',
      userId,
      validationPassed: validation.passed,
      validationErrorCount: validation.checks.filter(c => c.severity === 'error' && !c.passed).length,
    });

    const outputManager = new FileOutputManager(targetDir);
    outputManager.ensureTargetDir();
    const { written, errors } = outputManager.writeAll(files);

    for (const path of written) {
      const file = files.find(f => f.relativePath === path);
      auditLog({
        timestamp: new Date().toISOString(),
        eventType: 'file_written',
        userId,
        filePath: path,
        fileSize: file?.content.length,
      });
    }

    auditLog({
      timestamp: new Date().toISOString(),
      eventType: 'session_complete',
      userId,
      profileSummary: {
        role: profile.role,
        industry: profile.industry,
        teamSize: profile.teamSize,
        complianceFrameworks: profile.complianceFrameworks,
        securityLevel: profile.securityConcerns.includes('strict_permissions') ? 'strict' : 'standard',
        fileCount: written.length,
      },
    });

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
  app.post('/api/preview', (req, res) => {
    const { answers: rawAnswers } = req.body as {
      answers: Record<string, { value: unknown; timestamp: string }>;
    };

    const answers = hydrateAnswers(rawAnswers);
    const profile = profileBuilder.build(answers);
    profile.priorities = priorityAnalyzer.analyze(answers, bank.getAll());

    const domainPack = resolveDomainPack(answers);
    const config: SetupConfig = { profile, targetDir: '/preview', domainPack };
    const synthesizer = new SynthesizerOrchestrator();
    const { files, validation } = synthesizer.generateWithValidation(config);

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
  app.post('/api/diff', (req, res) => {
    const { answers: rawAnswers, targetDir } = req.body as {
      answers: Record<string, { value: unknown; timestamp: string }>;
      targetDir: string;
    };

    if (!targetDir) {
      res.status(400).json({ error: 'targetDir is required' });
      return;
    }

    const answers = hydrateAnswers(rawAnswers);
    const profile = profileBuilder.build(answers);
    profile.priorities = priorityAnalyzer.analyze(answers, bank.getAll());

    const config: SetupConfig = { profile, targetDir };
    const synthesizer = new SynthesizerOrchestrator();
    const { files } = synthesizer.generateWithValidation(config);

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
  const app = createApp();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const tlsCert = process.env.EMBEDIQ_TLS_CERT;
  const tlsKey = process.env.EMBEDIQ_TLS_KEY;

  const protocol = tlsCert && tlsKey ? 'https' : 'http';
  const authStrategy = selectAuthStrategy();
  const authStatus = authStrategy ? `Auth: ${authStrategy.name}` : 'Auth: off (local mode)';

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

  if (tlsCert && tlsKey) {
    const httpsOptions = {
      cert: readFileSync(tlsCert),
      key: readFileSync(tlsKey),
    };
    https.createServer(httpsOptions, app).listen(PORT, onListening);
  } else {
    app.listen(PORT, onListening);
  }
}
