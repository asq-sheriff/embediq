<!-- audience: public -->

# Changelog

All notable changes to EmbedIQ are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_No unreleased changes yet._

## [3.2.0] — Enterprise Operations & Integration

Closes v3.2. Five priorities shipped: interrupt-and-resume wizards, autopilot
scheduled regeneration, GitHub PR integration, outbound notification webhooks,
and compliance platform inbound webhooks.

### Added
- **Interrupt & resume wizard flows (6C).** `?session=<id>` resume URLs;
  server-side computation of next dimension/question from partial answers;
  welcome-back banner with progress totals; partial profile reconstruction;
  `contributors` map showing who answered what (multi-stakeholder audit
  attribution). `AdaptiveEngine.serialize()` / `restore()` for headless
  replay.
- **Drift detection CLI (6E-1).** `npm run drift -- --target <dir>
  (--answers <yaml> | --archetype <id>)` with six classifications:
  match / missing / modified-by-user / modified-stale-stamp /
  version-mismatch / extra. Stamp-aware — distinguishes post-generation
  user edits from entirely hand-authored files. Exit codes 0 / 1 / 2 for
  CI gating.
- **Autopilot scheduled regeneration (6E-2).** In-process scheduler with
  `@hourly` / `@daily` / `@weekly` / `@monthly` cadence presets (UTC);
  JSON-file store at `EMBEDIQ_AUTOPILOT_DIR`; REST CRUD under
  `/api/autopilot/schedules`; manual trigger webhook at
  `/api/autopilot/webhook/:scheduleId`; per-run records with four status
  classifications; optional `EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET` shared
  secret. Opt-in via `EMBEDIQ_AUTOPILOT_ENABLED=true`.
- **GitHub PR integration (6H).** `--git-pr` CLI flag uses the GitHub
  REST v3 Git Data API for atomic multi-file commits (no local working
  tree). PR template includes profile summary, per-generator file list,
  validation results, contributor attribution, and drift context. Env
  vars: `EMBEDIQ_GIT_PROVIDER` / `EMBEDIQ_GIT_REPO` / `EMBEDIQ_GIT_TOKEN`
  / `EMBEDIQ_GIT_BASE_BRANCH` / `EMBEDIQ_GIT_API_BASE_URL`. GitHub
  Enterprise supported via the base URL override.
- **Outbound notification webhooks (6I).** Event-bus subscriber auto-
  detects Slack (Block Kit), Microsoft Teams (MessageCard), and generic
  JSON formats from the target host. Per-URL event filter via repeated
  `?events=…&events=…` query params. Per-target failure isolation with
  a 3-second timeout so a slow endpoint never blocks the wizard.
  `EMBEDIQ_WEBHOOK_URLS` to enable, `EMBEDIQ_WEBHOOK_FORMAT` to override.
- **Compliance platform inbound webhooks (6J).** Adapters for Drata,
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
- **Evaluation framework (6D).** Golden-config replay harness under
  `src/evaluation/` with three shipped archetypes
  (`minimal-developer`, `hipaa-developer-strict`,
  `agents-md-developer`). `npm run evaluate` scores generated output
  against goldens via a stamp-aware diff scorer (markdown headings +
  Jaccard, JSON/YAML structural walk with unordered permission-array
  sets, text Jaccard, binary hash). Per-file, per-dimension,
  per-generator scores. `npm run benchmark` scores externally-produced
  configuration files against the same goldens. CLI: text/JSON output,
  baseline regression detection, CI-friendly exit codes.
- **Multi-agent output targeting (6G).** `TargetFormat` enum
  (`claude`, `agents-md`, `cursor`, `copilot`, `gemini`, `windsurf`)
  and five new generators producing cross-agent `AGENTS.md`,
  `.cursor/rules/*.mdc` with MDC frontmatter, `.github/copilot-
  instructions.md` + glob-scoped `.github/instructions/*.instructions.md`,
  `GEMINI.md`, and `.windsurfrules`. Target selection via
  `EMBEDIQ_OUTPUT_TARGETS` env var or `--targets` CLI flag. Default
  remains `claude` for backward compatibility.
- **Composable skills system (6F).** `Skill` interface as the new
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
- **Event bus architecture (6A).** Typed in-memory event bus with
  nine events across engine, synthesizer, and web layers. Five
  subscribers: `AuditSubscriber`, `MetricsCollector`,
  `StatusReconciler`, `OtelSubscriber`, `WebSocketHub`. Frontend live
  progress streaming within a 20 KB JS budget.
- **Multi-backend server-side sessions (6B).** `SessionBackend`
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
