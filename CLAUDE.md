# EmbedIQ — Claude Code Setup Wizard

A Praglogic product. An adaptive Q&A wizard that interviews users about their project, team, and goals, then generates a complete, production-ready Claude Code configuration (15-40 files). Serves both CLI and web interfaces from a single shared core.

## Tech Stack

- **Language**: TypeScript (strict mode, ES2022 target, ESNext modules)
- **Runtime**: Node.js 18+ with `tsx` for dev execution
- **Web server**: Express 5 (stateless REST API + vanilla JS frontend)
- **CLI prompts**: `@inquirer/prompts` v7 + `chalk` for terminal styling
- **Config output**: `yaml` for YAML serialization
- **Build**: `tsc` → `dist/`

## Commands

```bash
make help                # Show all available targets
make check               # Type-check + run tests (CI equivalent)
make build               # Type-check + test + compile to dist/
make start               # Run CLI wizard
make start-web           # Run web server (port 3000)
make dev                 # Watch mode for CLI
make dev-web             # Watch mode for web server
make otel-dev            # Web server with OpenTelemetry enabled
make test                # Run test suite (vitest)
make test-coverage       # Run tests with coverage report
make docker              # Build Docker image
make docker-up           # Start with docker-compose
make clean               # Remove build artifacts
```

Or use npm scripts directly:

```bash
npm install              # Install dependencies
npm run build            # Compile TypeScript to dist/
npm start                # Run CLI wizard
npm run start:web        # Run web server (port 3000, override with PORT=, auth with EMBEDIQ_AUTH_USER/EMBEDIQ_AUTH_PASS)
npm run dev              # Watch mode for CLI
npm run dev:web          # Watch mode for web server
npm test                 # Run test suite (vitest)
npm run test:watch       # Watch mode for tests
npm run test:coverage    # Run tests with coverage report
npx tsc --noEmit         # Type-check without emitting
```

## Architecture — Three Layers

### Layer 1: Universal Question Bank (`src/bank/`)
- 71 questions across 7 dimensions, 40 with conditional branching
- `question-registry.ts` — Static question definitions with compile-time type safety
- `question-bank.ts` — Query/filter interface, delegates condition evaluation to BranchEvaluator
- `profile-templates.ts` — Loads organizational baseline templates from YAML files
- Dimensions (in order): Strategic Intent, Problem Definition, Operational Reality, Technology Requirements, Regulatory Compliance, Financial Constraints, Innovation & Future-Proofing

### Layer 2: Adaptive Logic Engine (`src/engine/`)
- `adaptive-engine.ts` — Main Q&A loop orchestrator, re-evaluates visibility after each answer
- `branch-evaluator.ts` — Stateless predicate evaluator with 10 operators (EQUALS, CONTAINS, ANY_OF, GT, etc.)
- `profile-builder.ts` — Transforms `Map<string, Answer>` into structured `UserProfile`
- `priority-analyzer.ts` — Tag-weight scoring across 8 priority categories (Security, Cost, Quality, Productivity, Team, CI/CD, Monitoring, Documentation)
- `dimension-tracker.ts` — Progress tracking per dimension

### Layer 3: Synthesizer (`src/synthesizer/`)
- `orchestrator.ts` — Runs 12 generators in parallel via `Promise.all()`, role-aware (skips technical generators for BA/PM/Executive). Both `generate()` and `generateWithValidation()` are async. `generateWithValidation()` adds output validation and version stamping.
- `generator.ts` — `ConfigGenerator` interface
- `generators/` — 12 generators producing: CLAUDE.md, settings.json, settings.local.json, rules, commands, agents, skills, hooks (Python), ignore files, MCP config template, association map, document state
- `output-validator.ts` — Post-generation compliance checks (HIPAA, PCI-DSS, SOC2, GDPR, universal)
- `generation-header.ts` — Version metadata stamps per file type
- `diff-analyzer.ts` — Pre-write conflict detection (new/modified/unchanged/conflict)

### Interfaces (`src/types/`)
- All shared types: `Question`, `Answer`, `Condition`, `UserProfile`, `DevOpsProfile`, `Priority`, `SetupConfig`, `GeneratedFile`, `ValidationResult`, `GenerationResult`
- Enums: `Dimension` (7 values), `QuestionType` (5 values), `ConditionOperator` (10 values)
- Type aliases: `UserRole` (8 roles), `TeamSize`, `BudgetTier`, `TechnicalProficiency`

### Dual Interfaces
- **CLI** (`src/index.ts`) — 4-phase sequential flow: Discovery → Playback → Edit/Correct → Generate (with validation display)
- **Web** (`src/web/server.ts`) — Express API with 8 routes + health/ready endpoints, pluggable auth middleware, rate limiting, TLS support
- **Web frontend** (`src/web/public/`) — Vanilla HTML/CSS/JS SPA, no build step, client manages state, encrypted session persistence

### Request Context (`src/context/`)
- `request-context.ts` — `AsyncLocalStorage`-based per-request context. Each web request carries `requestId`, authenticated user info, and timing data. Call `getRequestContext()` from anywhere in the request chain without parameter threading. Returns `undefined` in CLI mode.

### Observability (`src/observability/`)
- `telemetry.ts` — OpenTelemetry integration. `initTelemetry()` activates SDK when `EMBEDIQ_OTEL_ENABLED=true` (noop otherwise). `getTracer()` / `getMeter()` return noop instruments when disabled. `withSpan()` helper for async span lifecycle with automatic error recording. SDK packages are optional dependencies loaded via dynamic import.

### Utilities (`src/util/`)
- `markdown-builder.ts` — Fluent markdown construction
- `file-output.ts` — File system writer with error handling
- `yaml-writer.ts` — YAML serialization
- `wizard-audit.ts` — Optional JSONL audit logging (noop when `EMBEDIQ_AUDIT_LOG` not set). Auto-enriches entries with `userId` and `requestId` from request context in web mode.

### Authentication (`src/web/middleware/`)
- `auth.ts` — `AuthStrategy` interface and `createAuthMiddleware()` factory
- `rbac.ts` — `requireRole()` middleware (wizard-user, wizard-admin)
- `strategies/` — basic.ts (HTTP Basic), oidc.ts (JWT/OIDC), header.ts (reverse proxy headers)

### Configuration Templates (`templates/`)
- YAML templates with `prefilledAnswers`, `lockedQuestions`, `domainPackId`
- 3 shipped: hipaa-healthcare, pci-finance, soc2-saas

### Domain Packs (`src/domain-packs/`)
- `index.ts` — `DomainPack` interface with supporting types (`ComplianceFrameworkDef`, `DlpPatternDef`, `RuleTemplateDef`, `DomainValidationCheck`)
- `registry.ts` — `DomainPackRegistry` singleton, registers built-in packs at startup, async external plugin loading via `import()`
- `built-in/healthcare.ts` — 6 questions, HIPAA/HITECH compliance, 6 DLP patterns, 3 rule templates, 5 validation checks
- `built-in/finance.ts` — 5 questions, PCI-DSS/SOX/GLBA compliance, 6 DLP patterns, 3 rule templates, 3 validation checks
- `built-in/education.ts` — 6 questions, FERPA/COPPA compliance, 6 DLP patterns, 2 rule templates, 5 validation checks
- Domain packs auto-resolve from industry answer (STRAT_002) — no manual selection needed
- External packs: place `.js`/`.mjs` files in `plugins/` directory (or `EMBEDIQ_PLUGINS_DIR`)

### Terminal UI (`src/ui/`)
- `console.ts` — Terminal I/O primitives
- `playback.ts` — Profile summary renderer
- `edit-correct.ts` — Correction/approval loop

## Key Design Decisions

- **Stateless web API**: Client sends full answer map with every request. No sessions, no database.
- **Role-adaptive output**: Non-technical roles (BA/PM/Executive) get a "coworker" CLAUDE.md instead of developer setup, skip hooks and association maps.
- **Branching conditions are AND-joined**: All conditions in a question's `showConditions` must be true for it to appear.
- **Hook exit codes**: 0 = pass, 1 = warn (tool executes), 2 = block (tool prevented).
- **Security tiers**: Permissive → Balanced → Strict → Lockdown, controlling allow/deny rules in settings.local.json.
- **No UI framework**: Web frontend is vanilla JS to stay dependency-free and under 20KB.
- **Zero-persistence**: No database, no sessions, no cookies, no telemetry. Answers exist only in volatile memory.
- **Pluggable auth**: Three auth strategies (Basic, OIDC, Proxy Header) via `EMBEDIQ_AUTH_STRATEGY` env var. RBAC with wizard-user/wizard-admin roles. No auth by default (local mode).
- **Domain pack plugin system**: Industry-specific packs extend all three layers without modifying core code. Auto-resolved from industry answer.

## Conventions

- Name things by their actual purpose — never use generic phase/version labels or roadmap identifiers in code
- Frontend design plugin is enabled — use it for UI work
- Keep the three layers independent: questions, branching logic, and output generation are separate concerns
- Questions use dimension-prefixed IDs (e.g., `STRAT_001`, `TECH_005`, `REG_012`)

## Extension Points

- **Add questions**: New `Question` object in `question-registry.ts` with unique dimension-prefixed ID
- **Add generators**: New file in `synthesizer/generators/`, implement `ConfigGenerator`, register in orchestrator
- **Add priority categories**: Pass additional categories to `PriorityAnalyzer` constructor, or add via domain pack `priorityCategories`
- **Add condition operators**: New value in `ConditionOperator` enum, implement in `BranchEvaluator.evaluate()`
- **Add domain packs**: New file in `domain-packs/built-in/` implementing `DomainPack` interface, register in `registry.ts`. Or place external `.js`/`.mjs` files in `plugins/` directory.
- **Add templates**: New YAML file in `templates/` with `prefilledAnswers`, `lockedQuestions`, optional `domainPackId`
- **Add auth strategies**: New file in `web/middleware/strategies/` implementing `AuthStrategy` interface, register in `selectAuthStrategy()`
