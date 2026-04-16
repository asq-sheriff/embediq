# EmbedIQ — Product Roadmap

**Version**: 2.1
**Last updated**: April 2026
**Maintained by**: Praglogic

---

## Overview

EmbedIQ is an adaptive Q&A wizard that generates production-ready Claude Code configurations. It features a three-layer architecture (Question Bank, Adaptive Engine, Synthesizer), 71 questions across 7 dimensions, 12 generators, dual CLI/web interfaces, and an extensible domain pack plugin system.

This roadmap tracks what has been delivered and what comes next.

---

## Completed: v2.0 — Enterprise Foundation

All items below have been implemented and are in the current codebase.

### Phase 1 — Foundation ✅

#### 1A. Test Infrastructure ✅
- Vitest config with v8 coverage provider, 80% threshold on generators
- 15 test files (12 unit, 3 integration), ~2,064 lines of test code
- Test helpers with preset answer builders (`MINIMAL_DEVELOPER_ANSWERS`, `HEALTHCARE_DEVELOPER_ANSWERS`, `PM_ANSWERS`)
- GitHub Actions CI workflow with multi-version Node testing (18, 20, 22)

**Key files**: `vitest.config.ts`, `tests/`, `.github/workflows/ci.yml`

#### 1B. Output Validation ✅
- `OutputValidator` with 8 check categories: universal, HIPAA, PCI-DSS, SOC2, GDPR, security, domain pack custom
- `generateWithValidation()` on orchestrator returns files + full validation results
- Backward-compatible — original `generate()` unchanged

**Key files**: `src/synthesizer/output-validator.ts`, `src/synthesizer/orchestrator.ts`

#### 1C. Configuration Versioning and Drift Detection ✅
- Version stamping per file type (MD, JSON, PY, YAML) with schema version and timestamp
- Diff analyzer categorizes files as new/modified/unchanged/conflict
- Conflict detection distinguishes EmbedIQ-managed files from user files

**Key files**: `src/synthesizer/generation-header.ts`, `src/synthesizer/diff-analyzer.ts`

---

### Phase 2 — Enterprise Infrastructure ✅

#### 2A. Wizard Audit Trail ✅
- JSONL audit logging with 7 event types (`session_start`, `profile_built`, `validation_result`, `generation_started`, `file_written`, `session_complete`, `session_error`)
- Environment-driven: noop when `EMBEDIQ_AUDIT_LOG` not set
- Rich metadata capture: userId, profileSummary, filePath, fileSize, diffStatus

**Key files**: `src/util/wizard-audit.ts`

#### 2B. Authentication and RBAC ✅
- `AuthStrategy` interface with `createAuthMiddleware()` factory
- Three strategies: Basic (username/password), OIDC (JWT Bearer), Proxy Header (`X-Forwarded-User`)
- `requireRole()` middleware with `wizard-user` and `wizard-admin` roles
- Backward-compatible: auto-detects `basic` when `EMBEDIQ_AUTH_USER/PASS` set

**Key files**: `src/web/middleware/auth.ts`, `src/web/middleware/rbac.ts`, `src/web/middleware/strategies/`

#### 2C. Rate Limiting and TLS ✅
- `express-rate-limit` on `/api/generate` (10 req/min, 60s window)
- HTTPS support via `EMBEDIQ_TLS_CERT` + `EMBEDIQ_TLS_KEY` env vars

**Key files**: `src/web/server.ts`

#### 2D. Session Persistence ✅
- Client-side `SecureSessionManager` using Web Crypto API (AES-256-GCM)
- Encrypted checkpoints in `sessionStorage` — survives refresh, dies on tab close
- Key held only in JS memory (not extractable, never persisted)

**Key files**: `src/web/public/session-persistence.js`

#### 2E. Configuration Templates ✅
- `ProfileTemplate` interface with `prefilledAnswers`, `lockedQuestions`, `forcedQuestions`, `domainPackId`
- Three shipped templates: `hipaa-healthcare.yaml`, `pci-finance.yaml`, `soc2-saas.yaml`
- Template directory configurable via `EMBEDIQ_TEMPLATES_DIR`

**Key files**: `src/bank/profile-templates.ts`, `templates/`

#### 2F. Deployment ✅
- Multi-stage Dockerfile (Node 22-alpine, non-root user)
- `docker-compose.yml` with audit log volume, env var passthrough
- Kubernetes manifests: deployment (liveness/readiness probes), service, configmap, ingress
- `/health` and `/ready` endpoints

**Key files**: `Dockerfile`, `docker-compose.yml`, `k8s/`

---

### Phase 3 — Domain Pack Plugin Architecture ✅

#### 3A. Core Interface ✅
- `DomainPack` interface with questions, compliance frameworks, priority categories, DLP patterns, rule templates, ignore patterns, validation checks
- Supporting types: `ComplianceFrameworkDef`, `DlpPatternDef`, `RuleTemplateDef`, `DomainValidationCheck`

**Key files**: `src/domain-packs/index.ts`

#### 3B. Registry ✅
- `DomainPackRegistry` with `register()`, `loadExternalPlugins()`, `getForIndustry()`
- External plugin loading via `await import()` from `EMBEDIQ_PLUGINS_DIR` (default `./plugins/`)
- Industry-to-pack mapping (healthcare, finance, education + variants like fintech, edtech, pharma)

**Key files**: `src/domain-packs/registry.ts`

#### 3C. Three-Layer Integration ✅
- Layer 1 (Questions): Domain pack questions merged into QuestionBank, sorted by dimension
- Layer 2 (Priorities): `PriorityAnalyzer` accepts `additionalCategories` from domain packs
- Layer 3 (Generators): DLP patterns → hooks, rule templates → rules, ignore patterns → .claudeignore, validation checks → output validator
- Deduplication: rules by `relativePath`, ignore patterns via `Set<string>`

**Key files**: `src/bank/question-bank.ts`, `src/engine/priority-analyzer.ts`, `src/synthesizer/generators/hooks.ts`, `src/synthesizer/generators/rules.ts`, `src/synthesizer/generators/ignore.ts`, `src/synthesizer/output-validator.ts`

---

### Phase 4 — Domain Pack Implementations ✅

#### 4A. Healthcare Pack ✅
- 6 questions (HC_001–HC_006): PHI identifiers, PHI categories, BAA, HITECH breach notification, HL7 FHIR/interoperability, FDA SaMD
- 3 compliance frameworks: HIPAA, HITECH, 42 CFR Part 2
- 6 DLP patterns: MRN, Health Plan Beneficiary Number, ICD-10 with patient context, DEA Number, NPI Number, FHIR Patient Resource ID
- 3 rule templates, 7 ignore patterns, 5 validation checks

**Key files**: `src/domain-packs/built-in/healthcare.ts`

#### 4B. Finance Pack ✅
- 5 questions (FIN_D001–FIN_D005): Cardholder data, financial data types, SOX, GLBA, cryptocurrency
- 4 compliance frameworks: PCI-DSS, SOX, GLBA, AML/BSA
- 6 DLP patterns: PAN, ABA routing, SWIFT/BIC, IBAN, EIN, CVV
- 3 rule templates, 6 ignore patterns, 3 validation checks

**Key files**: `src/domain-packs/built-in/finance.ts`

#### 4C. Education Pack ✅
- 6 questions (EDU_001–EDU_006): FERPA records, student data categories, COPPA, school official roles, inter-institution sharing, state privacy laws
- 3 compliance frameworks: FERPA, COPPA, State Student Privacy Laws
- 6 DLP patterns: Student ID, GPA, FAFSA/Financial Aid ID, Course Section with student, IEP/504, Minor DOB
- 2 rule templates, 7 ignore patterns, 5 validation checks

**Key files**: `src/domain-packs/built-in/education.ts`

---

## Completed: v2.1 — Performance and Observability

### 5A. Parallel Generator Execution ✅

The 12 generators in `SynthesizerOrchestrator.generate()` now run in parallel via `Promise.all()`. Both `generate()` and `generateWithValidation()` are async. Each generator's `generate()` method is pure — reads `SetupConfig`, returns `GeneratedFile[]` — making parallel execution safe. All callers (CLI, web server generate/preview/diff routes) updated to await.

**Key files**: `src/synthesizer/orchestrator.ts`, `src/index.ts`, `src/web/server.ts`

### 5B. Request Context Isolation ✅

Each Express request is now wrapped in an `AsyncLocalStorage` context carrying `requestId` (UUID), authenticated user info, and request timing. Downstream code calls `getRequestContext()` without parameter threading. Audit logging auto-enriches entries with `userId` and `requestId` from context — the `/api/generate` route no longer manually passes `userId` into every `auditLog()` call.

**Key files**: `src/context/request-context.ts`, `src/web/server.ts` (middleware), `src/util/wizard-audit.ts` (auto-enrichment)

### 5C. OpenTelemetry Instrumentation ✅

Optional OpenTelemetry integration behind `EMBEDIQ_OTEL_ENABLED=true` env var. Uses `@opentelemetry/api` for instrumentation (noop by default — zero overhead when disabled). SDK packages are optional dependencies loaded via dynamic import.

Traces: per-request HTTP spans (method, path, status, requestId), `synthesizer.generate` span with per-generator child spans, `synthesizer.generateWithValidation` span with validation results. Metrics: `embediq.files_generated`, `embediq.generation_runs`, `embediq.validations` (pass/fail). Exports via OTLP HTTP — compatible with any collector (Jaeger, Grafana, Datadog).

**Key files**: `src/observability/telemetry.ts`, `src/synthesizer/orchestrator.ts`, `src/web/server.ts`

---

## What's Next

### v3.0 — Enterprise Runtime
- Event bus with real-time WebSocket progress for the web UI
- Server-side session backends (JSON, Redis) for multi-server deployments
- Interrupt and resume for long wizard flows across devices
- Evaluation framework for measuring adaptive logic quality
- Scheduled regeneration and drift detection
- Composable skills system — granular, reusable configuration units that evolve beyond monolithic domain packs

### v4.0 — AI-Augmented Generation
- Provider abstraction layer (Claude, OpenAI, Ollama) with token usage tracking
- Optional AI-assisted config enhancement for complex edge cases
- AI planning for multi-compliance, multi-team enterprise scenarios

All future features are opt-in and backward-compatible. EmbedIQ will always work as a fully deterministic, zero-LLM wizard.

---

## Migration Notes

- **v2.0 → v2.1**: No breaking changes. All additions are optional and behind env vars. Parallel generators are an internal optimization with no API change.
