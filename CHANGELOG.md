<!-- audience: public -->

# Changelog

All notable changes to EmbedIQ are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — v3.3 RAG Scaffold (industry-agnostic)

Second phase of v3.3. Extends the wizard from "configure local AI" to
"configure local AI **and** generate a runnable retrieval pipeline"
when the user opts in. Industry-agnostic — the same generator emits a
FHIR-aware variant for healthcare and a plain-text variant for every
other industry, and emits one path-scoped compliance rule file per
active framework on the profile.

- **New `TargetFormat.RAG_SCAFFOLD`** (`rag-scaffold`). Auto-included
  whenever `profile.localAiEnabled === true` (alongside the four
  local-AI targets). Never emitted for BA/PM/exec roles.
- **New `RagScaffoldGenerator`** (`src/synthesizer/generators/rag-scaffold.ts`).
  Emits a small runnable RAG application under `rag/`:
  - `rag/README.md`, `rag/package.json` (or `rag/pyproject.toml` for
    Python-only stacks), `rag/.env.example`
  - `rag/src/chunker.ts` (or `.py`) — **FHIR-aware** for healthcare
    (preserves Patient / Observation / Encounter resource boundaries),
    **plain-text** for every other industry
  - `rag/src/embedder.ts` — local Ollama `nomic-embed-text` by default
  - `rag/src/store.ts` — SQLite-VSS with at-rest-encryption guidance
  - `rag/src/audit.ts` — HMAC-hashed query logging (never stores raw
    queries or chunk content)
  - `rag/src/cli.ts` — `index <dir>` + `query <text>` commands
  - `RAG_RUNBOOK.md` at project root — setup, smoke test,
    industry-aware compliance obligations, production-hardening
    checklist with per-framework items
- **Per-framework compliance rules.** One file under `.claude/rules/`
  per active framework on `profile.complianceFrameworks`:
  - `rag-hipaa-compliance.md` (HIPAA) — PHI handling, BAA, six-year
    audit retention per §164.316(b)(2), 45 CFR 164.514 de-identification
  - `rag-pci-compliance.md` (PCI-DSS) — never index full PANs, SAD
    prohibition, CDE network segmentation, one-year audit retention
  - `rag-soc2-compliance.md` (SOC 2) — Trust Services Criteria
    references (CC6.x, CC7.2, CC8.1, C1.x), change management, access
    reviews
  - `rag-ferpa-compliance.md` (FERPA) — education-record vs
    directory-information distinction, parental consent rules
  - `rag-conventions.md` (fallback) — generic best practices for
    profiles with no active frameworks
- **New `healthcare.rag` built-in skill** — trimmed companion to the
  generator. Carries vector-dump DLP patterns and RAG-runtime ignore
  patterns specific to healthcare. Registered for `/api/skills`
  discovery; not auto-composed (composition wiring is a follow-up).
- **New `healthcare-rag-developer` golden archetype** (30 files) —
  locks the FHIR-aware chunker + HIPAA rule + HIPAA runbook variant
  end-to-end.

### Changed

- The three pre-existing local-AI archetypes (`local-ai-developer`,
  `local-ai-enterprise`, `dotnet-developer`) now also emit the RAG
  scaffold — they all have `localAiEnabled: true`. Each gets the
  plain-text chunker variant + `rag-conventions.md`. File counts:
  `local-ai-developer` 14 → 24, `local-ai-enterprise` 15 → 25,
  `dotnet-developer` 13 → 23.

### Compatibility

- All non-local-AI archetypes (`minimal-developer`,
  `agents-md-developer`, `hipaa-developer-strict`,
  `consulting-engagement-default`, `healthcare-bpo-strict`) regenerate
  byte-identically — RAG only ships when `localAiEnabled === true`.
- TECH_001 / TECH_005 / wizard question set unchanged.
- No new mandatory wizard questions.

## [3.3.0] — Local AI Integration Layer (Phase 1)

First phase of v3.3 — extends EmbedIQ from "configures hosted-model
agents" to "configures hosted + local AI from one interview." Plus
closes a language-coverage gap that pre-dated v3.3 but ships here.

### Added — Local-Model Wizard Support

The wizard now configures Continue.dev, Aider, Zed AI, and Ollama
when the user opts into local AI (`TECH_013` yes) and picks their
IDE integrations.

- **Three new wizard questions** (`TECH_016`/`017`/`018`) — Ollama
  model picks, IDE integrations, default model for autocomplete.
  Gated on `TECH_013=true` plus a technical role; independent of
  team size and primary IDE. Total wizard questions: 71 → 74.
- **Four new generators**:
  - `continue-dev.ts` → `.continue/config.json` with selected models,
    default-as-tab-autocomplete, embeddings provider, telemetry off.
  - `aider.ts` → `.aider.conf.yml` + `.aiderignore`. Default model
    points at `ollama/<defaultLocalModel>`, test/lint commands
    inferred per language, auto-commits disabled. `.aiderignore`
    picks up HIPAA / PCI patterns when those frameworks are active.
  - `zed-ai.ts` → `.zed/settings.json` registering an Ollama provider.
  - `ollama-setup.ts` → root `OLLAMA_SETUP.md` runbook with install
    commands per OS, `ollama pull` commands for selected models,
    hardware-tier tuning notes, IDE wiring notes, end-to-end
    validation, and a HIPAA reminder when applicable.
- **Four new `TargetFormat` values**: `continue-dev`, `aider`,
  `zed-ai`, `ollama`. Auto-included by the orchestrator when
  `profile.localAiEnabled` is true (per-IDE gating via
  `profile.ideIntegrations`). Selectable explicitly via `--targets`
  / `EMBEDIQ_OUTPUT_TARGETS` too. Never emitted for BA/PM/exec roles.
- **Four new optional `UserProfile` fields**: `localAiEnabled`,
  `ollamaModels`, `ideIntegrations`, `defaultLocalModel`. All
  absent when `TECH_013` is false, preserving existing golden
  configs byte-for-byte.
- **Two new golden archetypes**: `local-ai-developer` (small team,
  multi-IDE TS sandbox) and `local-ai-enterprise` (medium team,
  TS+Python, GPU hardware). Both score 100% with zero validator
  failures.

### Added — Language coverage (C# / Swift / Ruby)

Closes a pre-existing gap: the wizard's `TECH_001` question
accepted all 8 languages (TypeScript, Python, Java/Kotlin, Go,
Rust, C#/.NET, Swift, Ruby), but the rule generator only emitted
language-specific files for 5 of them.

- **New rule files**: `.claude/rules/csharp.md`, `swift.md`,
  `ruby.md` — path-scoped, mirrors the existing pattern. C# rule
  covers net8/9 LTS, nullable reference types, async/await
  end-to-end, `IAsyncEnumerable` for streaming, `dotnet format`,
  `dotnet test`. Swift covers Swift Concurrency, value-types-by-
  default, `swift-format lint --strict`. Ruby covers
  `frozen_string_literal`, keyword args, `rubocop`, `bundle exec
  rake test`.
- **Extended Aider test/lint inference** for: C# (`dotnet test` /
  `dotnet format --verify-no-changes`), Swift (`swift test` /
  `swift-format lint --strict --recursive .`), Ruby
  (`bundle exec rake test` / `bundle exec rubocop`); plus Java
  lint (`mvn checkstyle:check`).
- **Three new `TECH_005` build-tool options**: `dotnet`, `swift_pm`,
  `bundler`.
- **New golden archetype**: `dotnet-developer` — C# developer on a
  small enterprise team running Continue.dev + Aider against local
  Ollama models. Locks in csharp.md emission and dotnet test/format
  wiring. Scores 100% with zero validator failures.

### Compatibility

- All eight pre-existing golden archetypes regenerate byte-identically.
- No `TECH_013` answer = no local-AI fields on the profile = no
  local-AI generators fire = output unchanged for non-local-AI users.
- `TECH_001` wizard options unchanged; `TECH_005` only adds new
  entries without renaming or removing existing ones.

### Tests

919/919 passing across 67 test files (was 871/65 before this release).

- 23 new unit tests for local-AI generators
- 22 new unit tests for language rule coverage (all 8 languages)
- 4 new Aider command-inference tests (C#/Swift/Ruby/Java-lint)
- 3 new archetypes hit the existing `evaluator.test.ts` end-to-end test

### Coming next in v3.3

- **Healthcare RAG Pipeline** — HIPAA-aware retrieval scaffold
  (chunker, embeddings, SQLite-VSS store) for healthcare + local-AI
  profiles.
- **Local Router with Confidence Escalation** — the PHI-safe
  routing headline differentiator. Local classifier routes simple
  tasks to the local model; escalates complex tasks to Claude/OpenAI
  only after PHI redaction.

## [3.2.2] — GTM Enablement

Three deliverables that turn the existing evaluation framework and
positioning work into client-presentable assets. The eval framework
gates internal quality today; this release makes the same data
presentable externally for sales conversations, procurement, and
client deliverables. Pure additions — no behavior changes to the
core wizard or generators.

### Added
- **Customer-facing HTML scorecards.** `--format scorecard` turns
  `npm run evaluate` or `npm run benchmark` into a standalone HTML
  scorecard suitable for a sales email, audit packet, or compliance
  reviewer. Two layouts (`full` with optional multi-archetype TOC;
  `email-safe` table-based for email clients), two themes (`light`,
  `dark`), white-label logo embed via `--scorecard-logo`,
  side-by-side benchmark comparison, deterministic output, audit-
  stamped provenance footer. Optional PDF output via `--format pdf`
  using puppeteer as an optional peer dependency.
- **Healthcare BPO deployment runbook
  ([`docs/HEALTHCARE-BPO-DEPLOYMENT.md`](docs/HEALTHCARE-BPO-DEPLOYMENT.md)).**
  Synthesis runbook for healthcare BPOs and regulated services
  firms — two deployment topologies (air-gapped single-node,
  controlled-outbound), seven-step setup walking through HIPAA pack
  resolution, encrypted SQLite sessions, OIDC + RBAC, autopilot +
  compliance feedback loop with HMAC verification, six-year audit
  retention, optional per-engagement scoping, and customer-facing
  scorecard for client deliverables. Includes a BAA-survivable
  evidence checklist mapping eight common auditor questions to the
  artifacts EmbedIQ produces.
- **Industry case-study fixtures.** Two new golden archetypes
  prospects can run end-to-end:
  - `healthcare-bpo-strict` — tech-lead persona at a healthcare BPO
    claims platform, full HIPAA + strict tier, TypeScript + Python.
    16 generated files.
  - `consulting-engagement-default` — developer persona at a systems
    integrator, SaaS + SOC 2 + audit logging, balanced security,
    multi-agent target set (Claude + AGENTS.md + Cursor). 16
    generated files.
- **Scorecard renderer module** (`src/evaluation/scorecard-renderer.ts`
  + `scorecard-template.ts`) — pure HTML+CSS templates, deterministic
  output, inline CSS only, no external assets, optional peer-dep
  puppeteer for PDF.
- **CLI flags** for the scorecard format: `--scorecard-title`,
  `--scorecard-subtitle`, `--scorecard-theme`, `--scorecard-layout`,
  `--scorecard-logo`, `--scorecard-include-failures`.

### Tests
- 40 new tests across the scorecard renderer (25 unit + 15 end-to-end
  integration) covering themes, layouts, logo embed, benchmark
  side-by-side, deterministic output, error paths.
- Both new archetypes hit the existing `evaluator.test.ts`
  end-to-end test and score 100% with zero validator failures.

### Compatibility
- All five pre-existing golden archetypes regenerate byte-identically.
- New optional peer dependency (`puppeteer`) only needed for
  `--format pdf`; HTML scorecard works with zero new dependencies.

## [3.2.1] — Operational Consolidation

Five v3.2.x follow-ups landing as a single patch release. All non-gated
and backward-compatible — no env-var migration, no golden-config
changes, no behavior shift unless you opt in.

### Added
- **GitLab adapter for git PR integration.** `EMBEDIQ_GIT_PROVIDER=gitlab`
  selects a `GitLabAdapter` that uses REST v4 with atomic
  multi-action commits via the `actions[]` payload, base-tree
  pre-walk, and delete-then-recreate branch idempotency. Project
  paths support nested groups (`group/subgroup/project`).
  Self-hosted GitLab via `EMBEDIQ_GIT_API_BASE_URL` (adapter appends
  `/api/v4`).
- **Bitbucket Cloud adapter for git PR integration.**
  `EMBEDIQ_GIT_PROVIDER=bitbucket` selects a `BitbucketAdapter` that
  uses REST 2.0 with multipart `/src` commits and Bearer-token auth
  via Repository / Workspace Access Tokens (app-password Basic auth
  is not supported). All three platforms (GitHub, GitLab, Bitbucket)
  now share the same `GitPlatform` interface and PR-template flow.
- **HMAC signature verification on inbound compliance webhooks.**
  Per-adapter opt-in via `EMBEDIQ_COMPLIANCE_SECRET_<ADAPTER>` env
  vars. Drata's `X-Drata-Signature`, Vanta's `X-Vanta-Signature`,
  and the generic adapter's `X-EmbedIQ-Signature` (`<hex>` or
  `sha256=<hex>`) are verified against `HMAC-SHA256(secret,
  raw-body)`. Unset → verification skipped (preserves existing
  shared-secret gateway as the only trust layer). Adds a second
  defense layer for high-assurance deployments.
- **docs-lint script.** `scripts/docs-lint.ts` (and `make docs-lint`)
  enforces the `<!-- audience: public | private -->` directive on
  every markdown file, scans public-tagged files for leak markers
  (private repo URLs, internal-only framework references), and
  validates cross-link targets exist. Runs in CI via the
  `tests/integration/docs-lint.test.ts` suite. Backbone for the
  dual-repo sanitize-and-publish flow.
- **Per-engagement state scoping.** `EMBEDIQ_ENGAGEMENT_ID` env var
  nests default session, autopilot, and audit-log paths under
  `.embediq/engagements/<id>/`, enabling consulting firms and
  systems integrators to run one process per client engagement
  out of the same checkout without state leakage. Strict ID
  sanitization rejects path traversal. Explicit
  `EMBEDIQ_SESSION_DIR` / `EMBEDIQ_SESSION_DB_URL` /
  `EMBEDIQ_AUTOPILOT_DIR` always win over engagement scoping —
  operator-set paths are never modified. Audit-log entries
  auto-tagged with `engagementId` via request context with direct
  env fallback for CLI mode. New
  [`docs/CONSULTING-FIRM-DEPLOYMENT.md`](docs/CONSULTING-FIRM-DEPLOYMENT.md)
  runbook covers the full deployment pattern.

### Changed
- `WizardAuditEntry` gained an optional `engagementId` field, auto-
  enriched from request context or directly from
  `EMBEDIQ_ENGAGEMENT_ID`. Absent on entries written before this
  release; explicit values on the entry override context.
- `RequestContext` gained an `engagementId?: string` field populated
  by `createRequestContext()` from `resolveEngagementId()`.

### Fixed
- `docs/user-guide/11-compliance-webhooks.md` security section
  incorrectly claimed HMAC verification was a future roadmap item;
  it's been shipped since the HMAC commit and is now documented
  accurately.

## [3.2.0] — Enterprise Operations & Integration

Closes v3.2. Five priorities shipped: interrupt-and-resume wizards, autopilot
scheduled regeneration, GitHub PR integration, outbound notification webhooks,
and compliance platform inbound webhooks.

### Added
- **Interrupt & resume wizard flows.** `?session=<id>` resume URLs;
  server-side computation of next dimension/question from partial answers;
  welcome-back banner with progress totals; partial profile reconstruction;
  `contributors` map showing who answered what (multi-stakeholder audit
  attribution). `AdaptiveEngine.serialize()` / `restore()` for headless
  replay.
- **Drift detection CLI.** `npm run drift -- --target <dir>
  (--answers <yaml> | --archetype <id>)` with six classifications:
  match / missing / modified-by-user / modified-stale-stamp /
  version-mismatch / extra. Stamp-aware — distinguishes post-generation
  user edits from entirely hand-authored files. Exit codes 0 / 1 / 2 for
  CI gating.
- **Autopilot scheduled regeneration.** In-process scheduler with
  `@hourly` / `@daily` / `@weekly` / `@monthly` cadence presets (UTC);
  JSON-file store at `EMBEDIQ_AUTOPILOT_DIR`; REST CRUD under
  `/api/autopilot/schedules`; manual trigger webhook at
  `/api/autopilot/webhook/:scheduleId`; per-run records with four status
  classifications; optional `EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET` shared
  secret. Opt-in via `EMBEDIQ_AUTOPILOT_ENABLED=true`.
- **GitHub PR integration.** `--git-pr` CLI flag uses the GitHub
  REST v3 Git Data API for atomic multi-file commits (no local working
  tree). PR template includes profile summary, per-generator file list,
  validation results, contributor attribution, and drift context. Env
  vars: `EMBEDIQ_GIT_PROVIDER` / `EMBEDIQ_GIT_REPO` / `EMBEDIQ_GIT_TOKEN`
  / `EMBEDIQ_GIT_BASE_BRANCH` / `EMBEDIQ_GIT_API_BASE_URL`. GitHub
  Enterprise supported via the base URL override.
- **Outbound notification webhooks.** Event-bus subscriber auto-
  detects Slack (Block Kit), Microsoft Teams (MessageCard), and generic
  JSON formats from the target host. Per-URL event filter via repeated
  `?events=…&events=…` query params. Per-target failure isolation with
  a 3-second timeout so a slow endpoint never blocks the wizard.
  `EMBEDIQ_WEBHOOK_URLS` to enable, `EMBEDIQ_WEBHOOK_FORMAT` to override.
- **Compliance platform inbound webhooks.** Adapters for Drata,
  Vanta, and a generic format translate external findings into autopilot
  run triggers. `POST /api/autopilot/compliance/:adapterId` fires a run
  for every enabled schedule whose `complianceFrameworks` list matches
  the event's framework. Framework normalization (`soc_2` → `soc2`,
  `pci-dss` → `pci`, etc.) ensures platform identifiers match.

### Changed
- `AutopilotSchedule` gained an optional `complianceFrameworks: string[]`
  field used by the inbound compliance webhook route to match events to
  schedules.
- `SerializedAnswer` gained an optional `contributedBy` field, stamped
  server-side from the request context on every `/api/sessions/:id` PATCH.
  The client cannot forge attribution.

### Fixed
- `WebhookSubscriber.flush()` now drains the microtask queue before
  awaiting in-flight POSTs, so tests that emit and immediately flush
  see every delivery complete.

## [3.1.0] — Strategic Differentiation

Three priorities shipped: evaluation framework, multi-agent output
targeting, and the composable skills system.

### Added
- **Evaluation framework.** Golden-config replay harness under
  `src/evaluation/` with three shipped archetypes
  (`minimal-developer`, `hipaa-developer-strict`,
  `agents-md-developer`). `npm run evaluate` scores generated output
  against goldens via a stamp-aware diff scorer (markdown headings +
  Jaccard, JSON/YAML structural walk with unordered permission-array
  sets, text Jaccard, binary hash). Per-file, per-dimension,
  per-generator scores. `npm run benchmark` scores externally-produced
  configuration files against the same goldens. CLI: text/JSON output,
  baseline regression detection, CI-friendly exit codes.
- **Multi-agent output targeting.** `TargetFormat` enum
  (`claude`, `agents-md`, `cursor`, `copilot`, `gemini`, `windsurf`)
  and five new generators producing cross-agent `AGENTS.md`,
  `.cursor/rules/*.mdc` with MDC frontmatter, `.github/copilot-
  instructions.md` + glob-scoped `.github/instructions/*.instructions.md`,
  `GEMINI.md`, and `.windsurfrules`. Target selection via
  `EMBEDIQ_OUTPUT_TARGETS` env var or `--targets` CLI flag. Default
  remains `claude` for backward compatibility.
- **Composable skills system.** `Skill` interface as the new
  lower-level primitive (id, name, version, tags, source, requires,
  conflicts, payload fields). `SkillComposer` merges N skills into a
  `ComposedSkillPayload` with first-wins conflict resolution.
  `SkillRegistry` singleton with built-in registration plus async
  external loading from `EMBEDIQ_SKILLS_DIR` (each subdirectory with a
  `SKILL.md` becomes one skill). Web API: `GET /api/skills` and
  `GET /api/skills/:id`.

### Changed
- `SetupConfig` gained an optional `targets?: TargetFormat[]` field.
  Omitted means Claude-only (preserves v2.x default).
- `ConfigGenerator` interface gained a `target: TargetFormat` field
  for target-aware orchestrator filtering.

## [3.0.0] — Enterprise Runtime Foundation

### Added
- **Event bus architecture.** Typed in-memory event bus with
  nine events across engine, synthesizer, and web layers. Five
  subscribers: `AuditSubscriber`, `MetricsCollector`,
  `StatusReconciler`, `OtelSubscriber`, `WebSocketHub`. Frontend live
  progress streaming within a 20 KB JS budget.
- **Multi-backend server-side sessions.** `SessionBackend`
  interface with `NullBackend` (zero-persistence default),
  `JsonFileBackend` (dev), and `DatabaseBackend` + `SqliteDialect`
  (production). TTL-governed, monotonic versioning, AES-256-GCM
  optional payload encryption, owner-gated HTTP surface, async dump
  export. Session-aware `/api/generate` merges body answers over
  session answers.

## [2.1.0] — Performance & Observability

### Added
- **Parallel generator execution (5A).** 12 generators run concurrently
  via `Promise.all()`; safe because `generate()` is pure.
- **Request context isolation (5B).** `AsyncLocalStorage` context per
  Express request carrying `requestId`, authenticated user, and
  timing. Downstream code calls `getRequestContext()` without
  parameter threading.
- **OpenTelemetry instrumentation (5C).** Optional instrumentation
  behind `EMBEDIQ_OTEL_ENABLED=true`. Per-request HTTP spans, per-
  generator child spans, three metrics (`embediq.files_generated`,
  `embediq.generation_runs`, `embediq.validations`). OTLP HTTP export.

## [2.0.0] — Enterprise Foundation

### Added
- **Test infrastructure (1A).** Vitest with v8 coverage.
- **Output validation (1B).** `OutputValidator` with eight check
  categories across universal and domain-specific rules.
- **Configuration versioning & drift detection (1C).** Diff analysis
  with conflict detection between EmbedIQ-managed and user-modified
  files.
- **Wizard audit trail (2A).** JSONL audit logging with seven event
  types, auto-enriched with request context.
- **Authentication & RBAC (2B).** Pluggable auth strategies (Basic,
  OIDC, Proxy Header). Roles: `wizard-user`, `wizard-admin`.
- **Rate limiting & TLS (2C).** Per-route rate limits; TLS via
  `EMBEDIQ_TLS_CERT` / `EMBEDIQ_TLS_KEY`.
- **Session persistence (2D).** Client-side AES-256-GCM encrypted
  checkpoints.
- **Configuration templates (2E).** Three shipped profile templates:
  `hipaa-healthcare`, `pci-finance`, `soc2-saas`.
- **Deployment (2F).** Production deployment via Docker, docker-
  compose, and Kubernetes with health/readiness probes.
- **Domain pack plugin architecture (3A–3C).** `DomainPack` typed
  interface, external plugin loading from a configurable directory,
  full three-layer integration (questions → QuestionBank, priorities
  → PriorityAnalyzer, DLP patterns and rule templates → hooks / rules
  / ignore / validation generators with deduplication).
- **Domain pack implementations (4A–4C).** Three built-in packs:
  healthcare (HIPAA / HITECH / 42 CFR Part 2), finance (PCI-DSS /
  SOX / GLBA / AML-BSA), education (FERPA / COPPA). Collectively:
  17 questions, 10 compliance frameworks, 18 DLP patterns, 8 rule
  templates, 20 ignore patterns, 13 validation checks.

[Unreleased]: https://github.com/asq-sheriff/embediq/compare/v3.2.0...HEAD
[3.2.0]: https://github.com/asq-sheriff/embediq/releases/tag/v3.2.0
[3.1.0]: https://github.com/asq-sheriff/embediq/releases/tag/v3.1.0
[3.0.0]: https://github.com/asq-sheriff/embediq/releases/tag/v3.0.0
[2.1.0]: https://github.com/asq-sheriff/embediq/releases/tag/v2.1.0
[2.0.0]: https://github.com/asq-sheriff/embediq/releases/tag/v2.0.0
