<!-- audience: public -->

# EmbedIQ — Architecture (legacy single-file reference)

> **Looking for the modular chapter view?** See
> [`architecture/overview.md`](architecture/overview.md) and the
> chapter links below. This single-file reference is preserved for
> deep historical detail; new readers should start with the
> modular chapters.

## Architecture chapters (modular)

| Layer / concern | Chapter |
|---|---|
| Three-layer overview + design tenets | [architecture/overview.md](architecture/overview.md) |
| Layer 1 — Question bank | [architecture/question-bank.md](architecture/question-bank.md) |
| Layer 2 — Adaptive engine | [architecture/adaptive-engine.md](architecture/adaptive-engine.md) |
| Layer 3 — Synthesizer | [architecture/synthesizer.md](architecture/synthesizer.md) |
| Domain packs + skills | [architecture/domain-packs-and-skills.md](architecture/domain-packs-and-skills.md) |
| Server-side sessions | [architecture/sessions.md](architecture/sessions.md) |
| Evaluation + drift | [architecture/evaluation.md](architecture/evaluation.md) |
| Autopilot | [architecture/autopilot.md](architecture/autopilot.md) |
| Integrations (git, webhooks, compliance) | [architecture/integrations.md](architecture/integrations.md) |
| Event bus | [architecture/event-bus.md](architecture/event-bus.md) |

---

## Overview

EmbedIQ, by Praglogic, is a three-layer adaptive system that transforms an interactive conversation into a complete Claude Code configuration. The architecture follows Praglogic's adaptive specifications methodology — a layered question-and-answer system that adapts its branching, profile-building, and synthesis to the user's role, industry, and compliance posture.

The system serves two interfaces (CLI and web) from a single shared core, adapts its behavior based on user role and technical proficiency, and generates 15–40 configuration files tailored to the user's specific domain, stack, compliance requirements, and team structure.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Interfaces                             │
│                                                                     │
│   ┌──────────────┐              ┌──────────────────────────────┐   │
│   │  CLI (index)  │              │  Web (Express + Static HTML) │   │
│   │  @inquirer    │              │  REST API + Vanilla JS       │   │
│   └──────┬───────┘              └──────────────┬───────────────┘   │
│          │                                      │                   │
│          └──────────────┬───────────────────────┘                   │
│                         ▼                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Layer 1: Universal Question Bank               │   │
│  │                                                             │   │
│  │  71 questions · 7 dimensions · 40 with branching conditions │   │
│  │  question-registry.ts → QuestionBank                        │   │
│  └─────────────────────────┬───────────────────────────────────┘   │
│                             ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Layer 2: Adaptive Logic Engine                  │   │
│  │                                                             │   │
│  │  AdaptiveEngine → BranchEvaluator → ProfileBuilder          │   │
│  │  DimensionTracker → PriorityAnalyzer                        │   │
│  └─────────────────────────┬───────────────────────────────────┘   │
│                             ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │         Layer 3: Unified Specification Synthesizer           │   │
│  │                                                             │   │
│  │  SynthesizerOrchestrator → 12 ConfigGenerators              │   │
│  │  → FileOutputManager → 15-40 config files                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
embediq/
├── package.json                  # Project config, scripts, dependencies
├── tsconfig.json                 # TypeScript compiler configuration
├── docs/
│   ├── USER_GUIDE.md             # End-user documentation
│   └── ARCHITECTURE.md           # This document
├── templates/                    # Organizational profile templates (YAML)
│   ├── hipaa-healthcare.yaml     # HIPAA healthcare baseline
│   ├── pci-finance.yaml          # PCI-DSS finance baseline
│   └── soc2-saas.yaml            # SOC2 SaaS baseline
├── vitest.config.ts              # Test configuration
├── tests/                        # Test suite (unit, integration, e2e)
├── Dockerfile                    # Multi-stage production build
├── docker-compose.yml            # Local development with optional TLS
├── k8s/                          # Kubernetes manifests
└── src/
    ├── index.ts                  # CLI entry point (4-phase orchestrator)
    ├── types/
    │   └── index.ts              # All interfaces, enums, type aliases
    ├── bank/
    │   ├── question-registry.ts  # 71 question definitions (1,115 lines)
    │   ├── question-bank.ts      # Query/filter interface
    │   └── profile-templates.ts  # Organizational template loader
    ├── engine/
    │   ├── adaptive-engine.ts    # Main Q&A loop orchestrator
    │   ├── branch-evaluator.ts   # Conditional branching evaluator
    │   ├── profile-builder.ts    # Answer → UserProfile transformer
    │   ├── priority-analyzer.ts  # Tag-weight priority derivation
    │   └── dimension-tracker.ts  # Progress tracking per dimension
    ├── synthesizer/
    │   ├── orchestrator.ts       # Coordinates 12 generators + validation
    │   ├── generator.ts          # ConfigGenerator interface
    │   ├── output-validator.ts   # Post-generation compliance verification
    │   ├── generation-header.ts  # Version stamps for generated files
    │   ├── diff-analyzer.ts      # Pre-write conflict detection
    │   └── generators/
    │       ├── claude-md.ts      # → CLAUDE.md
    │       ├── settings-json.ts  # → .claude/settings.json
    │       ├── settings-local.ts # → .claude/settings.local.json
    │       ├── rules.ts          # → .claude/rules/*.md
    │       ├── commands.ts       # → .claude/commands/*.md
    │       ├── agents.ts         # → .claude/agents/*.md
    │       ├── skills.ts         # → .claude/skills/*.md
    │       ├── hooks.ts          # → .claude/hooks/*.py
    │       ├── ignore.ts         # → .claudeignore, .claude/.claude_ignore
    │       ├── mcp-json.ts       # → .mcp.json.template
    │       ├── association-map.ts# → association_map.yaml
    │       └── document-state.ts # → docs/document_state.yaml
    ├── ui/
    │   ├── console.ts            # Terminal I/O primitives
    │   ├── playback.ts           # Profile summary renderer
    │   └── edit-correct.ts       # Correction/approval loop
    ├── context/
    │   └── request-context.ts    # AsyncLocalStorage-based request context
    ├── observability/
    │   └── telemetry.ts          # OpenTelemetry tracing + metrics (noop when disabled)
    ├── util/
    │   ├── markdown-builder.ts   # Fluent markdown construction
    │   ├── file-output.ts        # File system writer
    │   ├── yaml-writer.ts        # YAML serialization
    │   └── wizard-audit.ts       # JSONL audit logging (auto-enriched from request context)
    └── web/
        ├── server.ts             # Express HTTP server (generation, preview, diff, sessions, skills, autopilot, compliance webhooks, health — see reference/rest-api.md for the full surface)
        ├── middleware/
        │   ├── auth.ts           # AuthStrategy interface + factory
        │   ├── rbac.ts           # Role-based access control
        │   └── strategies/       # basic.ts, oidc.ts, header.ts
        └── public/
            ├── index.html        # Single-page web application
            ├── session-persistence.js # Encrypted sessionStorage checkpoint
            ├── style.css         # Apple-minimalist design system
            └── app.js            # Client-side application logic
```

**File count**: 29 TypeScript source files + 3 web frontend files
**Total code**: ~4,300 lines TypeScript + ~750 lines HTML/CSS/JS

---

## Layer 1: Universal Question Bank

### Purpose

The question bank is the repository of all potential inquiries. It is not a static list but a structured catalog where each question carries metadata that controls when it appears, what input it accepts, and how its answer contributes to priority analysis.

### Design

Questions are defined as a static array of `Question` objects in `question-registry.ts`. This is deliberate — defining questions in code provides compile-time type safety, IDE autocompletion, and refactorability that external data files cannot match.

```typescript
interface Question {
  id: string;               // Unique ID with dimension prefix (e.g., "STRAT_001")
  dimension: Dimension;      // Which of 7 dimensions this belongs to
  text: string;             // The question shown to the user
  helpText?: string;        // Optional clarification text
  type: QuestionType;       // FREE_TEXT | SINGLE_CHOICE | MULTI_CHOICE | SCALE | YES_NO
  options?: AnswerOption[];  // Predefined choices (for choice/scale types)
  required: boolean;        // Must be answered to proceed
  order: number;            // Sort order within dimension
  showConditions: Condition[]; // AND-joined predicates — all must be true to show
  tags: string[];           // Semantic tags for priority analysis
}
```

### Seven Dimensions

The taxonomy is derived from Praglogic's Adaptive Architecture Specifications' core question dimensions, adapted for the Claude Code configuration domain:

| # | Dimension | Questions | Purpose |
|---|---|---|---|
| 1 | Strategic Intent | 9 | Role, industry, goals, project stage, criticality |
| 2 | Problem Definition | 7 | Pain points, quality gates, TDD, audience |
| 3 | Operational Reality | 7 | Team size, branching, parallel work, code review |
| 4 | Technology Requirements | 15 | Languages, frameworks, IDEs, build, test, CI/CD, databases, MCP |
| 5 | Regulatory Compliance | 21 | PHI/PII, DLP, audit, permissions, ZDR, egress |
| 6 | Financial Constraints | 5 | Budget, model routing, cost optimization |
| 7 | Innovation & Future | 7 | Plugins, doc tracking, memory, agents, commands |

**Total**: 71 questions. **With branching**: 40 (56%) have conditional show logic.

### Conditional Branching Model

Each question has a `showConditions: Condition[]` array. Conditions are AND-joined — all must evaluate to true for the question to be visible.

```typescript
interface Condition {
  questionId: string;           // References another question's answer
  operator: ConditionOperator;  // One of 10 operators
  value?: string | string[] | number | boolean;
}
```

The ten operators:

| Operator | Behavior |
|---|---|
| `EQUALS` | Answer exactly matches value |
| `NOT_EQUALS` | Answer does not match |
| `CONTAINS` | Answer string contains value, or answer array includes value |
| `NOT_CONTAINS` | Inverse of CONTAINS |
| `ANY_OF` | Answer matches any item in value array |
| `NONE_OF` | Answer matches no item in value array |
| `ANSWERED` | Question has been answered (any value) |
| `NOT_ANSWERED` | Question has not been answered |
| `GT` | Numeric answer is greater than value |
| `LT` | Numeric answer is less than value |

### Key Branching Paths

```
STRAT_000 (role)
├── developer/devops/lead/qa/data → Full technical question set
└── ba/pm/executive → Skip: TECH_001-003, TECH_005-006, TECH_011-014,
                             OPS_002-007, PROB_006-007

STRAT_002 (industry)
├── healthcare → REG_003 (PHI handling) unlocked
└── finance → PCI-DSS questions surfaced

OPS_001 (team size)
├── solo → Skip: OPS_002-005 (branching, parallel work, reviews, agent teams)
└── medium/large → OPS_005 (agent teams) unlocked

REG_001 (sensitive data?)
├── yes → REG_002-006, REG_011-018 (full compliance cascade)
│   ├── REG_002 contains 'hipaa' → REG_003 (PHI)
│   ├── REG_012 = yes → REG_012a (DLP patterns) → REG_012b (custom regex)
│   └── REG_014 = yes → REG_014a (audit storage)
└── no → All compliance questions skipped

TECH_013 (local models?)
├── yes → TECH_014 (hardware specs)
└── no → TECH_014 skipped

FIN_002 (model routing?)
├── yes → FIN_003-004 (routing strategy, subagent model)
└── no → Skipped
```

### QuestionBank Class

`QuestionBank` wraps the static registry and provides query methods:

- `getAll()` — All 71 questions
- `getById(id)` — Lookup by question ID
- `getByDimension(dim)` — All questions in a dimension, sorted by order
- `getVisibleQuestions(dim, answers)` — Questions whose conditions are satisfied
- `getDimensions()` — Ordered dimension list

It delegates condition evaluation to `BranchEvaluator`.

---

## Layer 2: Adaptive Logic Engine

### Purpose

The engine is the central nervous system. It takes the user's inputs and dynamically navigates the question bank, performing conditional branching and iterative refinement. After collection, it transforms raw answers into a structured profile and derives priorities.

### Components

#### AdaptiveEngine

The main orchestrator. Its algorithm:

```
for each dimension (in order):
  1. Get visible questions (filtered by BranchEvaluator)
  2. Update DimensionTracker with question count
  3. For each visible question:
     a. Present to user (via ConsoleUI or web API)
     b. Record answer in Map<string, Answer>
     c. Increment tracker
  4. Show progress across all dimensions

After all dimensions:
  5. ProfileBuilder.build(answers) → UserProfile
  6. PriorityAnalyzer.analyze(answers, questions) → Priority[]
  7. Attach priorities to profile
  8. Return completed profile
```

The engine re-evaluates question visibility within a dimension after each answer, so an answer to question N can unlock question N+2 in the same dimension.

#### BranchEvaluator

Stateless predicate evaluator. Given a `Condition[]` and the current answer map, returns boolean.

```typescript
shouldShow(conditions: Condition[], answers: Map<string, Answer>): boolean
```

All conditions are AND-joined. An empty conditions array always returns true.

String comparisons are case-insensitive and trimmed. Array values support both `CONTAINS` (is element in array?) and `ANY_OF` (does any element match?).

#### ProfileBuilder

Transforms the raw `Map<string, Answer>` into a structured `UserProfile` by reading specific question IDs and normalizing values:

- `STRAT_000` → `role` (UserRole type alias)
- `STRAT_000a` → `technicalProficiency`
- `STRAT_001` → `businessDomain`
- `STRAT_002` + `STRAT_003` → `industry` (with "other" fallback)
- `OPS_001` → `teamSize` (normalized to `'solo' | 'small' | 'medium' | 'large'`)
- `TECH_001` + `TECH_002` + `TECH_003` → `languages` + `techStack`
- `TECH_004` through `TECH_010` → `devOps` (DevOpsProfile)
- `REG_001` through `REG_018` → `complianceFrameworks` + `securityConcerns`
- `FIN_001` → `budgetTier`

#### PriorityAnalyzer

Uses a tag-weight scoring system to derive priorities. Each question carries semantic tags (e.g., `['security', 'compliance', 'phi']`). When a user's answer indicates concern, the associated tags accumulate weight.

**Weight computation**:

| Answer Type | Weight Logic |
|---|---|
| Boolean `true` | 3 points |
| Boolean `false` | 0 points |
| Number (scale 1-5) | Direct value (1-5 points) |
| Array (multi-choice) | `min(length × 1.5, 5)` points |
| Non-empty string | 2 points |

**Eight priority categories** with their trigger tags (from `PRIORITY_CATEGORIES` in `priority-analyzer.ts`):

| Category | Tags |
|---|---|
| Security & Compliance | security, compliance, phi, pii, hipaa, audit, secrets, sensitive_data, protected_files, deny_rules, scanning, data_classification, dlp, context_sanitization, session_audit_trail, output_review |
| Cost Optimization | cost, budget, cost_optimization, local_models, model_routing, thinking_tokens, ollama |
| Code Quality | quality, testing, tdd, linting, formatting, quality_gates, enforcement, consistency |
| Developer Productivity | velocity, workflow, commands, agents, automation, devtools, editor |
| Team Coordination | collaboration, team_size, parallel_work, worktrees, code_review, agent_teams, branching |
| CI/CD & Automation | cicd, automation, cicd_integration, deployment, devops, containers |
| Monitoring & Observability | monitoring, observability, logging, audit_logging |
| Documentation & Knowledge | documentation, memory, context_persistence, association_map, lifecycle |

Confidence = `totalWeight / (relevantTagCount × 5)`, clamped to [0, 1]. Priorities with confidence below 0.1 are filtered out. Results are sorted descending by confidence.

#### DimensionTracker

Simple bookkeeping: tracks `{total, answered, skipped}` per dimension for progress display.

---

## Layer 3: Unified Specification Synthesizer

### Purpose

The synthesizer transforms the approved `UserProfile` into 15–40 real, usable Claude Code configuration files. It operates as a meta-framework — no single output template is prescribed. Instead, 12 independent generators each decide what to produce based on the profile.

### SynthesizerOrchestrator

Runs all applicable generators in parallel via `Promise.all()`, then assembles the results:

```typescript
class SynthesizerOrchestrator {
  async generate(config: SetupConfig): Promise<GeneratedFile[]>
  async generateWithValidation(config: SetupConfig): Promise<GenerationResult>
}
```

Generators are pure functions — each reads `SetupConfig` and returns `GeneratedFile[]` with no cross-dependencies. This makes parallel execution safe and improves throughput as domain packs add more generators.

**Role-aware adaptation**: For non-technical users (BA, PM, Executive), the orchestrator:

1. Filters out exactly 2 technical-only generators before parallel execution: `hooks` and `association-map`
2. All other generators still run (rules, commands, agents, skills, settings, ignore, MCP) — they produce role-appropriate output
3. After all generators complete, the orchestrator replaces the standard `CLAUDE.md` with a coworker-focused version via `generateCoworkerClaudeMd()`

The coworker CLAUDE.md is structurally different from the technical version:

| Section | Technical CLAUDE.md | Coworker CLAUDE.md |
|---|---|---|
| Title | `{domain}` | `{domain} — {Role} Workspace` |
| Primary section | Tech Stack, Build & Test, Code Conventions | "How Claude Helps You" (role-specific capabilities) |
| BA capabilities | — | Requirements analysis, user stories, process mapping, data flows |
| PM capabilities | — | Market research, PRDs, feature prioritization (RICE/MoSCoW), roadmaps |
| Executive capabilities | — | Report summarization, strategic analysis, board documentation |
| Security | OWASP, PHI/PII, DLP rules | — |
| Compliance | Framework-specific mandates | Compliance context (which frameworks apply) |
| Guidelines | Code conventions, progressive disclosure | "Use clear, non-technical language", cite sources, flag assumptions |

### ConfigGenerator Interface

```typescript
interface ConfigGenerator {
  name: string;
  generate(config: SetupConfig): GeneratedFile[];
}
```

Each generator returns zero or more files. A generator returning an empty array means "not applicable for this profile."

### GeneratedFile Structure

```typescript
interface GeneratedFile {
  relativePath: string;  // Path relative to target directory
  content: string;       // Complete file content
  description: string;   // Human-readable description
}
```

### Generator Details

#### ClaudeMdGenerator (claude-md.ts)

The most complex generator. Produces a `CLAUDE.md` following the progressive disclosure pattern from the Claude Code Setup Guide.

For technical users, sections include:
- Tech Stack (languages, frameworks, build tools, testing, CI/CD)
- Build & Test (stack-specific commands: `npm test`, `pytest`, `mvn test`, etc.)
- Code Conventions (language-specific: PEP 8, strict mode, effective Go, etc.)
- Security Requirements (conditional: PHI, PII, DLP, OWASP)
- Compliance (conditional: framework-specific mandates)
- Workflow (progressive disclosure pointers to rules and hooks)
- Additional Context (references to rules and hook directories)

For non-technical users, the orchestrator replaces this entirely with a coworker CLAUDE.md (see SynthesizerOrchestrator section above for structural comparison).

#### SettingsJsonGenerator (settings-json.ts)

Produces `.claude/settings.json` with:

- **PreToolUse hooks**: DLP scanner (on Edit/Write/Bash), command guard (on Bash), egress guard (on Bash)
- **PostToolUse hooks**: Auto-formatting (language-specific: Prettier, ruff, gofmt, rustfmt), audit logging
- **SessionStart hooks**: Session timestamp and branch logging
- **Stop hooks**: TDD enforcement (when enabled, prompt-type hook checks for missing tests)
- **deniedMcpServers**: Blocks MCP servers not relevant to the user's workflow

#### SettingsLocalGenerator (settings-local.ts)

Produces `.claude/settings.local.json` with permission rules scaled to security level:

| Security Level | Allow Rules | Deny Rules |
|---|---|---|
| Permissive | git, npm, npx, docker, make, pytest, curl, ls, cat, grep, find | rm -rf, force push, sudo, chmod 777, credential files |
| Balanced | git status/diff/log/branch, npm test/run, npx, ls | Above + credential paths |
| Strict | git status, git diff, git log, ls | Above + most commands |
| Lockdown | git status, ls | Above + curl, wget, ssh, scp |

PHI/PII paths are always denied for regulated environments.

#### RulesGenerator (rules.ts)

Produces `.claude/rules/*.md` with YAML frontmatter. Two categories:

**Always-on rules** (no `paths:` frontmatter):
- `testing.md` — Testing standards, TDD enforcement

**Path-scoped rules** (with `paths:` frontmatter — only load when editing matching files):
- `security.md` — Security invariants
- `hipaa-compliance.md` — HIPAA rules (paths: `src/**`, `tests/**`)
- `pci-compliance.md` — PCI-DSS rules
- `typescript.md` — TypeScript conventions (paths: `**/*.ts`, `**/*.tsx`)
- `python.md`, `go.md`, `java.md`, `rust.md` — Language conventions

#### CommandsGenerator (commands.ts)

Produces `.claude/commands/*.md` with model and effort frontmatter:

```yaml
---
model: sonnet
effort: high
description: Review staged changes
---
```

Commands are selected based on problem areas and routing preferences. Each command specifies its model tier.

#### AgentsGenerator (agents.ts)

Produces `.claude/agents/*.md` with full frontmatter. **All agents require `INNOV_007` = true** (the "enable agents" question). If the user answers "no" to that question, zero agents are generated regardless of other profile conditions.

When agents are enabled, each is conditionally generated:

| Agent | Model | Allowed Tools | Isolation | Generation Condition |
|---|---|---|---|---|
| `security-reviewer.md` | Opus | Read, Grep, Glob, Bash | None | `profile.securityConcerns.length > 0` |
| `compliance-checker.md` | Opus | Read, Grep, Glob | None | `profile.complianceFrameworks.length > 0` |
| `code-reviewer.md` | Sonnet | Read, Grep, Glob | None | `profile.teamSize !== 'solo'` |
| `test-writer.md` | Sonnet | Read, Grep, Glob, Write, Edit | Worktree | `profile.problemAreas.includes('test_gaps')` |

The security-reviewer includes PHI/PII-specific checks when those concerns are in the profile. The compliance-checker adapts its checklist to the specific frameworks selected (HIPAA, SOC2, PCI-DSS, GDPR). The test-writer uses worktree isolation so it can create and test files without affecting the user's working tree.

#### HooksGenerator (hooks.ts)

Produces Python scripts in `.claude/hooks/`:

- `dlp-scanner.py` — Regex-based DLP with configurable patterns (including user-supplied custom regex from question REG_012b). Exit code 2 blocks on CRITICAL, exit code 1 warns on HIGH.
- `command-guard.py` — Blocks destructive patterns (rm -rf /, force push, sudo, chmod 777, curl|bash, fork bombs, disk writes)
- `audit-logger.py` — Logs to `.claude/logs/` as JSONL. Summarizes tool inputs without including sensitive content.
- `egress-guard.py` — Allows only approved domains (github.com, npmjs.org, pypi.org). Blocks all other network commands.

#### SkillsGenerator (skills.ts)

Produces `.claude/skills/*.md` — user-invocable workflows that combine multiple steps. Each skill specifies a model and effort level in frontmatter.

| Skill | Model | Trigger Condition | Purpose |
|---|---|---|---|
| `sync-memory.md` | Haiku | `INNOV_004` = true (memory management enabled) | Reads `.claude/memory/` files, compares with current codebase, updates stale entries |
| `impact-analysis.md` | Sonnet | `INNOV_003` = true (association map enabled) | Runs `git diff`, cross-references `association_map.yaml`, lists affected tests/docs/infra |

Skills differ from commands in that they define multi-step procedures rather than single prompts, and from agents in that they run within the main conversation context (no isolation).

#### IgnoreGenerator (ignore.ts)

Produces two exclusion files:

- **`.claudeignore`** — Root-level context exclusions (node_modules, dist, .env, build artifacts). When PHI/PII concerns are present, adds sensitive data directories.
- **`.claude/.claude_ignore`** — Detailed exclusions (lock files, media, generated code, binary formats).

#### McpJsonGenerator (mcp-json.ts)

Produces `.mcp.json.template` with server configurations based on question `TECH_015` (MCP server selection). Uses `${VARIABLE}` syntax for credential placeholders.

Available MCP servers:

| Server | Package | Condition | Credentials |
|---|---|---|---|
| Context7 | `@context7/mcp` | Selected or "unsure" | None |
| Sequential Thinking | `@anthropic/sequential-thinking-mcp` | Selected or "unsure" | None |
| GitHub | `@anthropic/github-mcp` | Selected | `GITHUB_TOKEN` |
| Filesystem | `@anthropic/filesystem-mcp` | Selected | None |
| Playwright | `@anthropic/playwright-mcp` | Selected | None |
| Database | `@anthropic/database-mcp` | Selected | `DATABASE_URL` |
| Ollama | `@anthropic/ollama-claude` | `TECH_013` = true (local models) | `OLLAMA_HOST` |
| Gemini Grounding | `@anthropic/gemini-grounding-mcp` | Non-technical role (BA/PM/Executive/Data) | `GOOGLE_API_KEY` |

#### AssociationMapGenerator (association-map.ts)

Produces `association_map.yaml` — a bidirectional map linking code, tests, docs, and infrastructure patterns. Only generated when `INNOV_003` = true. Skipped for non-technical users (technical-only generator).

The generator adapts file patterns to the user's tech stack:

- **Code patterns**: Language-specific (`src/**/*.ts`, `app/**/*.py`, `**/*.go`, etc.)
- **Test patterns**: Framework-specific (`**/*.test.ts` for Jest, `tests/**/*.py` for pytest, `**/*_test.go` for Go, etc.)
- **Doc patterns**: Always includes `docs/**/*.md`, `CLAUDE.md`, `.claude/rules/*.md`, `README.md`
- **Infra patterns**: Build-tool-specific (`package.json`, `pom.xml`, `Cargo.toml`, etc.) plus CI configs

Includes a starter `associations` array with an example entry for users to customize.

#### DocumentStateGenerator (document-state.ts)

Produces `docs/document_state.yaml` — a lifecycle registry for documentation files. Only generated when `INNOV_002` = true (document state tracking enabled).

Four lifecycle states:

| State | Meaning |
|---|---|
| `CURRENT` | Reflects deployed reality. Must be kept in sync with code. |
| `FUTURE` | Planned/roadmap. Not yet implemented. |
| `REFERENCE` | Timeless reference material. Rarely needs updates. |
| `ARCHIVED` | Superseded. Kept for historical context only. |

Seeds the registry with `CLAUDE.md` and `README.md` as CURRENT documents. Users extend the `documents` array as their project grows.

### Generator Activation Summary

Complete reference for when each generator produces output:

| Generator | Files Produced | Condition | Skipped for Non-Technical |
|---|---|---|---|
| ClaudeMdGenerator | `CLAUDE.md` | Always (replaced with coworker version for BA/PM/Exec) | No (adapted) |
| SettingsJsonGenerator | `.claude/settings.json` | Always | No |
| SettingsLocalGenerator | `.claude/settings.local.json` | Always | No |
| RulesGenerator | `.claude/rules/*.md` | Always produces `testing.md`; others conditional on languages/compliance | No |
| CommandsGenerator | `.claude/commands/*.md` | Conditional on pain points, routing, compliance | No |
| AgentsGenerator | `.claude/agents/*.md` | `INNOV_007` = true AND specific profile conditions (see Agents section) | No |
| SkillsGenerator | `.claude/skills/*.md` | `INNOV_003` or `INNOV_004` = true | No |
| HooksGenerator | `.claude/hooks/*.py` | `command-guard.py` always; others conditional on security concerns | **Yes** |
| IgnoreGenerator | `.claudeignore`, `.claude/.claude_ignore` | Always | No |
| McpJsonGenerator | `.mcp.json.template` | Always (contents vary by selection) | No |
| AssociationMapGenerator | `association_map.yaml` | `INNOV_003` = true | **Yes** |
| DocumentStateGenerator | `docs/document_state.yaml` | `INNOV_002` = true | No |

---

## Dual Interface Architecture

### Shared Core

Both interfaces share the same core modules:

```
CLI (index.ts)  ─┐
                  ├── bank/question-bank.ts
Web (server.ts) ─┤   engine/adaptive-engine.ts
                  │   engine/branch-evaluator.ts
                  │   engine/profile-builder.ts
                  │   engine/priority-analyzer.ts
                  │   synthesizer/orchestrator.ts
                  └── util/file-output.ts
```

### CLI Interface

- Entry: `src/index.ts`
- UI: `@inquirer/prompts` for interactive terminal prompts, `chalk` for styling
- Flow: Sequential — walks all 4 phases in a single process
- Orchestration: `AdaptiveEngine` drives the Q&A loop directly

#### Edit-Correct Flow (Phase 3)

The `EditCorrectFlow` class (`src/ui/edit-correct.ts`) implements the approval loop. After playback, the user cycles through four actions until they approve:

| Action | What It Does |
|---|---|
| **Approve** | Exits the loop, proceeds to generation |
| **Correct** | Select a field to change — one of: business domain, industry, team size, languages, budget tier, CI/CD platform |
| **Adjust priorities** | Displays numbered priority list, moves a selected priority to position #1 and boosts its confidence by 0.1 (capped at 1.0) |
| **Add missing** | Adds an item to one of: problem areas, languages, compliance frameworks, security concerns |

Corrections modify the `UserProfile` directly. Since the profile is built from the answer map in Phase 1, corrections in Phase 3 override derived values — meaning the user's manual correction takes precedence over what the engine inferred.

### Web Interface

- Entry: `src/web/server.ts`
- Server: Express.js serving static files + REST API
- Frontend: Vanilla HTML/CSS/JS (no build step, no framework)
- Flow: Stateless API — client manages state, sends full answer map with each request

#### API Routes

| Route | Method | Purpose |
|---|---|---|
| `GET /api/dimensions` | GET | Returns ordered dimension list for sidebar navigation |
| `POST /api/questions` | POST | Accepts `{dimension, answers}`, returns visible questions after branch evaluation |
| `POST /api/profile` | POST | Accepts `{answers}`, returns built profile with priorities |
| `POST /api/generate` | POST | Accepts `{answers, targetDir}`, generates and writes files, returns results |
| `POST /api/preview` | POST | Accepts `{answers}`, returns generated file contents without writing to disk (used by the Generate screen's file preview) |

#### Answer Serialization (`hydrateAnswers`)

The browser stores answers as a plain JavaScript object `Record<string, {value, timestamp}>`. Every API request sends this complete object. The server-side `hydrateAnswers()` function converts it back to `Map<string, Answer>`:

```typescript
function hydrateAnswers(raw: Record<string, { value: unknown; timestamp: string }>): Map<string, Answer>
```

This round-trip is necessary because `Map` is not JSON-serializable. The function reconstructs `Date` objects from ISO timestamp strings and casts values back to their union type (`string | string[] | number | boolean`).

#### Stateless Design

The web API is stateless — the client (browser) holds the complete answer map and sends it with every request. This means:

- No server-side sessions
- No database required
- Multiple users can use the same server simultaneously
- **Browser refresh loses all progress** — there is no persistence layer. The wizard is designed to be completed in one sitting (5–15 minutes). This is a deliberate trade-off: no server state, no database, no cookies — but the cost is that a refresh starts over

#### Frontend Architecture

The frontend is a single-page application with four screens managed by `showPhase()`. State is held in a JavaScript object:

```javascript
state = {
  dimensions: [],           // Loaded from /api/dimensions
  currentDimIndex: 0,       // Which dimension we're on
  currentQuestions: [],      // Visible questions for current dimension
  currentQuestionIndex: 0,  // Which question we're on
  answers: {},              // Complete answer map (sent to API)
  profile: null,            // Built profile (from /api/profile)
  currentValue: null,       // Current input value being collected
}
```

---

## Type System

### Enumerations

```typescript
enum Dimension          // 7 values: STRATEGIC_INTENT through INNOVATION_FUTURE
enum QuestionType       // 5 values: FREE_TEXT, SINGLE_CHOICE, MULTI_CHOICE, SCALE, YES_NO
enum ConditionOperator  // 10 values: EQUALS through LT
```

### Type Aliases

```typescript
type TeamSize = 'solo' | 'small' | 'medium' | 'large'
type BudgetTier = 'minimal' | 'moderate' | 'enterprise'
type UserRole = 'developer' | 'devops' | 'lead' | 'ba' | 'pm' | 'executive' | 'qa' | 'data'
type TechnicalProficiency = 'beginner' | 'intermediate' | 'advanced' | 'non_technical'
```

### Core Interfaces

| Interface | Fields | Used By |
|---|---|---|
| `Question` | id, dimension, text, helpText, type, options, required, order, showConditions, tags | QuestionBank, AdaptiveEngine |
| `Answer` | questionId, value, timestamp | Engine, ProfileBuilder, PriorityAnalyzer |
| `Condition` | questionId, operator, value | BranchEvaluator |
| `AnswerOption` | key, label, description | Question options |
| `UserProfile` | role, proficiency, domain, industry, problems, stack, languages, teamSize, devOps, compliance, budget, security, hardware, priorities | All generators |
| `DevOpsProfile` | ide, buildTools, testFrameworks, cicd, monitoring, containerization | ClaudeMdGenerator, RulesGenerator |
| `Priority` | name, confidence, derivedFrom | PlaybackRenderer, PriorityAnalyzer |
| `SetupConfig` | profile, targetDir | All generators |
| `GeneratedFile` | relativePath, content, description | Synthesizer, FileOutputManager |
| `DimensionProgress` | dimension, total, answered, skipped | DimensionTracker, ConsoleUI |

### Constants

```typescript
const DIMENSION_ORDER: Dimension[]  // Canonical ordering of dimensions
```

### Factory Functions

```typescript
function createEmptyProfile(): UserProfile  // Returns default profile with empty collections
```

---

## Data Flow

### End-to-End Flow

```
User Input
    │
    ▼
┌───────────────┐    ┌──────────────────┐
│ QuestionBank  │───▶│ BranchEvaluator  │
│ (71 questions)│    │ (10 operators)   │
└───────┬───────┘    └────────┬─────────┘
        │                     │
        ▼                     ▼
┌───────────────────────────────────┐
│        AdaptiveEngine             │
│  Iterates dimensions × questions  │
│  Collects Map<string, Answer>     │
└───────────────┬───────────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
┌──────────────┐ ┌──────────────────┐
│ProfileBuilder│ │PriorityAnalyzer  │
│answers→profile│ │tags→8 categories │
└──────┬───────┘ └────────┬─────────┘
       │                  │
       └──────┬───────────┘
              ▼
    ┌───────────────────┐
    │    UserProfile     │
    │ (with priorities)  │
    └─────────┬─────────┘
              │
              ▼
    ┌───────────────────┐
    │ Playback + Edit   │
    │ (user approval)   │
    └─────────┬─────────┘
              │
              ▼
    ┌───────────────────────────────────────────┐
    │       SynthesizerOrchestrator              │
    │                                           │
    │  ┌─────────┐ ┌─────────┐ ┌─────────┐    │
    │  │ClaudeMd │ │Settings │ │ Rules   │ …  │
    │  │Generator│ │Generator│ │Generator│    │
    │  └────┬────┘ └────┬────┘ └────┬────┘    │
    │       │           │           │          │
    │       └─────┬─────┴─────┬─────┘          │
    │             ▼           ▼                │
    │        GeneratedFile[]                    │
    └─────────────────┬─────────────────────────┘
                      │
                      ▼
            ┌───────────────────┐
            │ FileOutputManager │
            │ (write to disk)   │
            └───────────────────┘
```

### Answer Storage

Answers are stored as `Map<string, Answer>` where the key is the question ID. This provides O(1) lookup for branch evaluation and profile building.

For the web API, answers are serialized as a plain object `Record<string, {value, timestamp}>` and hydrated back to a Map on the server side via `hydrateAnswers()`.

---

## Security Architecture

### Defense in Depth

The generated Claude Code setup implements three protection layers:

```
Layer 1: Context Exclusion
├── .claudeignore (root: node_modules, .env, PHI dirs)
└── .claude/.claude_ignore (detailed: lock files, media, binaries)

Layer 2: Real-Time Scanning (PreToolUse hooks)
├── dlp-scanner.py (PHI/PII/secret patterns on Edit/Write/Bash)
├── command-guard.py (destructive command patterns on Bash)
└── egress-guard.py (network access control on Bash)

Layer 3: Permission Enforcement
└── settings.local.json (allow/deny rules for tools + paths)
```

### DLP Pattern Architecture

The DLP scanner is generated with patterns specific to the user's compliance requirements:

| Compliance | Patterns Added |
|---|---|
| Always | API keys, AWS keys, private keys |
| PHI or PII | SSN, credit cards |
| PHI | Medical record numbers, patient data fields |
| Custom | User-supplied regex from REG_012b |

Exit codes follow the Claude Code hook convention:
- `0` = Pass (no match)
- `1` = Warn (HIGH severity — tool executes, warning shown)
- `2` = Block (CRITICAL severity — tool execution prevented)

### Audit Trail

When enabled, the audit logger produces daily JSONL files:

```json
{
  "timestamp": "2026-04-10T14:30:00Z",
  "user": "developer",
  "tool": "Edit",
  "tool_input_summary": {"file_path": "src/auth.ts", "old_string": "[string, 45 chars]"},
  "session_id": "abc123"
}
```

Tool inputs are summarized (not logged verbatim) to prevent the audit log itself from containing sensitive data.

### Data Privacy Architecture

EmbedIQ uses a **zero-persistence, zero-telemetry** design. No user data is stored, transmitted, or logged at any point during the wizard lifecycle.

#### Data Residency by Interface

| Interface | Where Answers Live | Lifetime | Persistence |
|---|---|---|---|
| CLI | Node.js process heap (`Map<string, Answer>`) | Until process exits | None |
| Web (browser) | JavaScript `state.answers` object in browser memory | Until tab close/refresh | None |
| Web (server) | Function-scoped variable within request handler | Single HTTP request (~ms) | None |

The web API is fully stateless — `hydrateAnswers()` constructs a `Map` from the request body, processes it, and the `Map` is garbage-collected when the response is sent. No session store, no database, no cookies, no `localStorage`.

#### Sensitive Metadata Classification

In regulated domains, wizard answers constitute sensitive metadata — they reveal what types of protected data an organization handles and how it protects them:

| Answer Category | Classification | Rationale |
|---|---|---|
| PHI/PII handling preferences | **Sensitive** | Reveals that the organization processes protected health/personal information |
| Custom DLP regex patterns | **Sensitive** | Reveals the shape and format of protected data fields |
| Security posture (tiers, egress, deny rules) | **Sensitive** | Reveals defensive architecture |
| Compliance framework selection | **Moderate** | Reveals regulatory obligations |
| Technology stack details | **Moderate** | Could inform attack surface analysis |
| Role, industry, team size | **Low** | General organizational context |

None of this metadata is persisted. It flows through memory, produces config files on local disk, and is discarded.

#### LLM Boundary

EmbedIQ itself **never calls an LLM**. All question routing, profile building, priority analysis, and file generation is deterministic code. The generated config files are later consumed by Claude Code (which uses an LLM), but the config files contain instructions and conventions — not the raw answers. Specifically:

- Custom DLP regex patterns are embedded in local Python hook scripts, not in CLAUDE.md
- Compliance requirements appear as behavioral rules ("Never include PHI"), not as descriptions of what PHI the organization handles
- Permission deny lists reference paths and commands, not sensitive data content

#### Web Server Authentication

The web server supports optional HTTP Basic Authentication, controlled by environment variables:

```
EMBEDIQ_AUTH_USER=admin EMBEDIQ_AUTH_PASS=<secret> npm run start:web
```

When both variables are set, all routes (static files and API) require authentication. When not set, the server runs without auth. The middleware sits before all route handlers:

```typescript
app.use((req, res, next) => {
  // Decode Basic auth header, compare against env vars
  // 401 with WWW-Authenticate header on failure
});
```

No passwords are stored — credentials come from environment variables and exist only in process memory. For enterprise deployments, place the server behind a reverse proxy with SSO/SAML.

---

## Dependencies

| Package | Version | Role | Why This Package |
|---|---|---|---|
| `@inquirer/prompts` | ^7.0.0 | CLI prompts | Official Inquirer.js v7 — modular, tree-shakeable, TypeScript-native |
| `chalk` | ^5.3.0 | Terminal styling | De facto standard for Node.js terminal colors |
| `express` | ^5.2.1 | HTTP server | Minimal, battle-tested, no-framework overhead |
| `yaml` | ^2.6.0 | YAML serialization | Full YAML 1.2 spec support, used for config file generation |
| `typescript` | ^5.7.0 | Type checking | Strict mode, ES2022 target |
| `tsx` | ^4.19.0 | TypeScript execution | Zero-config TypeScript runner, faster than ts-node |
| `@types/node` | ^22.0.0 | Node.js types | Latest Node.js API type definitions |
| `@types/express` | ^5.0.6 | Express types | Type definitions for Express v5 |

**Design choice**: No UI framework (React, Vue) in the web frontend. Vanilla JS keeps the frontend dependency-free, eliminates build steps, and keeps the total bundle under 20KB.

---

## Extension Points

### Adding Questions

Add a new `Question` object to the `questions` array in `question-registry.ts`. Assign it a unique ID with the appropriate dimension prefix, set its `order` for positioning, and add `showConditions` for conditional branching. Add semantic `tags` to integrate with priority analysis.

### Adding Generators

1. Create a new file in `synthesizer/generators/`
2. Implement the `ConfigGenerator` interface
3. Register the generator in `SynthesizerOrchestrator`'s constructor
4. If the generator is technical-only, add its name to `isTechnicalOnlyGenerator()`

### Adding Priority Categories

Add a new entry to the `PRIORITY_CATEGORIES` map in `priority-analyzer.ts` with a category name and its trigger tags. Add the corresponding tags to relevant questions.

### Adding Condition Operators

Add a new value to the `ConditionOperator` enum and implement its evaluation logic in `BranchEvaluator.evaluate()`.

---

## Build & Run

```bash
# Install
npm install

# Type check
npx tsc --noEmit

# Build (compile to dist/)
npm run build

# Run CLI
npm start

# Run web server
npm run start:web

# Development (watch mode)
npm run dev        # CLI
npm run dev:web    # Web
```

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Web server port |
| `EMBEDIQ_AUTH_STRATEGY` | `none` | Auth strategy: `none`, `basic`, `oidc`, `proxy` |
| `EMBEDIQ_AUTH_USER` | *(not set)* | Basic auth username (auto-detects `basic` strategy when set) |
| `EMBEDIQ_AUTH_PASS` | *(not set)* | Basic auth password |
| `EMBEDIQ_OIDC_ISSUER` | *(not set)* | OIDC issuer URL (e.g., `https://your-org.okta.com`) |
| `EMBEDIQ_OIDC_CLIENT_ID` | *(not set)* | OIDC client ID |
| `EMBEDIQ_OIDC_CLIENT_SECRET` | *(not set)* | OIDC client secret |
| `EMBEDIQ_OIDC_ROLES_CLAIM` | `roles` | JWT claim containing role array |
| `EMBEDIQ_PROXY_USER_HEADER` | `X-Forwarded-User` | Header for proxy-authenticated username |
| `EMBEDIQ_PROXY_ROLES_HEADER` | `X-EmbedIQ-Roles` | Header for proxy-provided roles (comma-separated) |
| `EMBEDIQ_AUDIT_LOG` | *(not set)* | Path for wizard execution audit log (JSONL) |
| `EMBEDIQ_OTEL_ENABLED` | *(not set)* | Set to `true` to enable OpenTelemetry tracing and metrics |
| `EMBEDIQ_TLS_CERT` | *(not set)* | TLS certificate file path (enables HTTPS) |
| `EMBEDIQ_TLS_KEY` | *(not set)* | TLS private key file path |
| `EMBEDIQ_TEMPLATES_DIR` | `./templates` | Custom template directory |

---

## Enterprise Infrastructure (v2.0)

### Output Validation
The `SynthesizerOrchestrator.generateWithValidation()` method runs compliance checks after generation. Checks include: CLAUDE.md/settings.json presence, HIPAA (DLP patterns, audit logging, compliance rules), PCI-DSS, SOC2, GDPR, and security tier requirements. Returns a `ValidationResult` with pass/fail status and individual check details.

### Configuration Versioning
Generated files are stamped with EmbedIQ version headers (HTML comments for `.md`, `_embediq` metadata key for `.json`, `#` comments for `.py`/`.yaml`). The `diff-analyzer.ts` module compares generated files against existing files to detect new, modified, unchanged, or conflict status before writing.

### Authentication and RBAC
Three pluggable auth strategies via `EMBEDIQ_AUTH_STRATEGY`:
- **basic**: Username/password (backward compatible with existing env vars)
- **oidc**: JWT validation from OIDC providers (Okta, Azure AD, Auth0)
- **proxy**: Trusts reverse proxy headers (X-Forwarded-User, X-EmbedIQ-Roles)

Two RBAC roles: `wizard-user` (answer questions, preview) and `wizard-admin` (generate/write files).

### Session Persistence
Client-side encrypted checkpoint using Web Crypto API (AES-256-GCM). The encryption key exists only in JavaScript memory — never persisted to disk or sessionStorage. Survives page refresh, destroyed on tab close.

### OpenTelemetry Observability
Optional instrumentation behind `EMBEDIQ_OTEL_ENABLED=true`. The `@opentelemetry/api` package provides noop implementations by default — zero overhead when disabled. SDK packages (`@opentelemetry/sdk-node`, exporters) are optional dependencies loaded via dynamic `import()`.

**Traces:**
- HTTP request spans (method, path, status code, requestId from context)
- `synthesizer.generate` span with child spans per generator (`generator.CLAUDE.md`, `generator.hooks`, etc.)
- `synthesizer.generateWithValidation` span with validation pass/fail attributes

**Metrics:**
- `embediq.files_generated` — counter of total files produced
- `embediq.generation_runs` — counter per generation with generator count attribute
- `embediq.validations` — counter with pass/fail attribute

**Configuration:**
- `EMBEDIQ_OTEL_ENABLED=true` — activates SDK initialization
- `OTEL_EXPORTER_OTLP_ENDPOINT` — collector URL (default: `http://localhost:4318`)
- Standard OTEL env vars for endpoint overrides

### Request Context Isolation
Each web request is wrapped in an `AsyncLocalStorage` context (`src/context/request-context.ts`) carrying:
- `requestId` — UUID per request, used for log correlation
- `userId`, `displayName`, `roles` — from authenticated user (if auth is active)
- `startedAt` — high-resolution timestamp for latency measurement

Any code in the request call chain can call `getRequestContext()` without parameter threading. The context middleware runs after auth, so user info is available. CLI mode has no context — `getRequestContext()` returns `undefined`.

### Wizard Audit Trail
Optional JSONL audit logging (`EMBEDIQ_AUDIT_LOG`). Events: session_start, profile_built, validation_result, file_written, session_complete. Noop when not configured. In web server mode, audit entries are auto-enriched with `userId` and `requestId` from the request context — callers no longer need to pass these explicitly.

### Configuration Templates
Organizational baselines in YAML format (`templates/` directory). Templates pre-fill answers, lock non-negotiable settings, and optionally activate domain packs. Three shipped templates: HIPAA Healthcare, PCI-DSS Finance, SOC2 SaaS.

### API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Liveness probe (status, version, uptime) |
| GET | `/ready` | None | Readiness probe (question bank loaded) |
| GET | `/api/templates` | User | Available configuration templates |
| GET | `/api/dimensions` | User | 7 dimension definitions |
| POST | `/api/questions` | User | Visible questions for a dimension |
| POST | `/api/profile` | User | Build profile from answers |
| POST | `/api/preview` | User | Preview generated files (with validation) |
| POST | `/api/generate` | Admin | Generate and write files (with validation) |
| GET | `/api/domain-packs` | User | Available domain packs |
| POST | `/api/diff` | User | Pre-write conflict analysis |

---

## Domain Pack Plugin Architecture (v2.0)

### Overview

Domain packs extend EmbedIQ with industry-specific knowledge without modifying core source code. Each pack plugs into all three layers:

```
┌──────────────────────────────────────────────────────────┐
│                    DomainPack Interface                    │
│                                                          │
│  Layer 1: questions[]          → QuestionBank merge       │
│  Layer 1: complianceFrameworks → REG_002 option extension │
│  Layer 2: priorityCategories   → PriorityAnalyzer merge   │
│  Layer 3: dlpPatterns[]        → HooksGenerator injection  │
│  Layer 3: ruleTemplates[]      → RulesGenerator append     │
│  Layer 3: ignorePatterns[]     → IgnoreGenerator append    │
│  Layer 3: validationChecks[]   → OutputValidator append    │
└──────────────────────────────────────────────────────────┘
```

### Built-in Domain Packs

| Pack | ID | Questions | DLP Patterns | Rule Templates | Compliance Frameworks |
|------|----|-----------|-------------|----------------|----------------------|
| **Healthcare** | `healthcare` | 6 (HC_001–HC_006) | 6 (MRN, beneficiary, ICD-10, DEA, NPI, FHIR) | 3 (HIPAA PHI, HITECH breach, interop) | HITECH, 42 CFR Part 2 |
| **Finance** | `finance` | 5 (FIN_D001–FIN_D005) | 6 (PAN, ABA, SWIFT, IBAN, EIN, CVV) | 3 (PCI-DSS cardholder, SOX controls, GLBA privacy) | SOX, GLBA, AML/BSA, FINRA |
| **Education** | `education` | 6 (EDU_001–EDU_006) | 6 (student ID, GPA, FAFSA, course, IEP/504, DOB) | 2 (FERPA compliance, COPPA child privacy) | FERPA, COPPA, state privacy |

### Domain Pack Resolution

Domain packs are resolved automatically from the user's industry answer (`STRAT_002`):

| Industry Answer | Domain Pack |
|----------------|-------------|
| `healthcare`, `health_tech`, `pharma` | Healthcare |
| `finance`, `fintech`, `banking`, `insurance`, `ecommerce` | Finance |
| `education`, `edtech`, `k12`, `higher_ed` | Education |

### External Plugin System

Custom domain packs can be placed in the `plugins/` directory (or `EMBEDIQ_PLUGINS_DIR`). Each `.js` or `.mjs` file must export a default object conforming to the `DomainPack` interface. External plugins are loaded via dynamic `import()` at startup.

### DomainPack Interface

```typescript
interface DomainPack {
  id: string;
  name: string;
  version: string;
  description: string;
  questions: Question[];              // Merged into QuestionBank
  complianceFrameworks: ComplianceFrameworkDef[];  // Extend REG_002 options
  priorityCategories: Record<string, string[]>;    // Merge with base 8
  dlpPatterns: DlpPatternDef[];       // Injected into DLP scanner
  ruleTemplates: RuleTemplateDef[];   // Appended to rules output
  ignorePatterns: string[];           // Appended to .claudeignore
  validationChecks: DomainValidationCheck[];  // Run in output validation
}
```

Each `DlpPatternDef`, `RuleTemplateDef`, and `DomainValidationCheck` supports an optional `requiresFramework` field — the item is only included when the specified compliance framework is in the user's profile.
