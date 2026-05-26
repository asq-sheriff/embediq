<!-- audience: public -->

# EmbedIQ

**One adaptive interview → production-ready configs for six AI coding agents, with federal-procurement-grade governance output.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) **Stable** · v4.0 governance suite shipped 2026-05-25

EmbedIQ interviews you about your project, team, and compliance
obligations, then generates a complete agent harness — 15–40 files —
tailored to your role, industry, tech stack, and security posture.
Same answer set produces output for **Claude Code, Cursor, GitHub
Copilot, Gemini CLI, Windsurf, and cross-agent `AGENTS.md`**. Opt
into local AI and the same interview also configures **Continue.dev,
Aider, Zed AI, and Ollama** against locally-installed models, and
emits a **runnable RAG scaffold** under `rag/` — FHIR-aware for
healthcare profiles, plain-text for everyone else, with one
path-scoped compliance rule file per active framework.

Opt in to **v4.0 governance targets** (`cyclonedx-aibom`,
`oscal-component`, `oscal-ssp-fragment`, `provenance`) and the same
interview produces a **NIST OSCAL Component Definition + SSP fragment
+ CycloneDX-ML AIBOM + per-file provenance manifest** alongside the
harness — feedable into Drata, Vanta, FedRAMP 20x, Dependency-Track,
or any OSCAL/CycloneDX-aware pipeline. Add `EMBEDIQ_AUDIT_CHAIN_ENABLED=true`
for a tamper-evident audit chain (RFC-6962 pattern) plus a
`verify-audit-log` CLI that walks the chain and reports the first
integrity break.

Everything is **deterministic, offline, and audit-ready**: no LLM calls,
no telemetry, no database. Same answers in → byte-identical files out.

[Latest release: **v4.0**](https://github.com/asq-sheriff/embediq/releases/latest) ·
[Full changelog](CHANGELOG.md) ·
[Security model](SECURITY.md) ·
[Governance suite docs](docs/extension-guide/writing-oscal-imports.md)

![EmbedIQ demo — drift, evaluation, and multi-engagement scoping in ~70 seconds](docs/assets/demo.gif)

---

## Why this exists

Teams adopting AI coding agents today juggle four to six tools — Claude
Code, Cursor, Copilot, Gemini, Windsurf — each with its own config
language and capability surface. Configurations duplicate, drift, and
decay. Compliance teams have no single artifact to audit. Security
postures vary per developer's local setup, and every new hire rebuilds
the harness from scratch.

EmbedIQ produces a governed multi-agent harness from one structured
interview, and keeps it that way via drift detection, scheduled
regeneration, and byte-identical re-runs. No LLM in the generator path,
so the same answers always produce the same output — including under
regulatory audit.

---

## Who this is for

**Best fit**

- **Regulated industries** — healthcare, financial services, government —
  where compliance auditors block non-deterministic tooling and a
  byte-identical regeneration story is a regulatory requirement, not a
  preference.
- **Multi-agent enterprise environments** already standardizing on
  `AGENTS.md` plus tool-specific files, where keeping six configs
  consistent by hand has become a recurring tax.
- **Consulting firms and systems integrators** running multiple client
  engagements from the same checkout, who need isolated state per
  engagement without a hosted control plane. See the
  [per-engagement deployment pattern](docs/CONSULTING-FIRM-DEPLOYMENT.md).
- **Teams whose AI workforce includes non-developers** — business
  analysts, product managers, executives — who need role-adaptive
  output rather than a flattened `CLAUDE.md`.

**Not for**

- **Hobbyist solo developers** who want a one-page `CLAUDE.md`. Shallow
  generators serve that case well and a 91-question wizard would
  over-serve it — even with the engine's short-circuiting for
  minimal-compliance profiles, admin-vs-user gating, and agent-target
  filtering.

---

## 60-second quickstart

```bash
git clone https://github.com/asq-sheriff/embediq.git
cd embediq
npm install

# Interactive CLI wizard
npm start

# Or web UI — same wizard, same generators, same output
npm run start:web          # http://localhost:3000

# Generate with full v4.0 governance output set
EMBEDIQ_AUDIT_LOG=./audit.jsonl \
EMBEDIQ_AUDIT_CHAIN_ENABLED=true \
  npm start -- --targets claude,cyclonedx-aibom,oscal-component,oscal-ssp-fragment,provenance

# Already generated once? Drift-check a project
npm run drift -- --target ./my-project --archetype minimal-developer

# Scoring + benchmarking
npm run evaluate           # replay answer sets against golden references
npm run benchmark -- --candidate ./other-tool-output --candidate-label claude-init

# v4.0 — verify the tamper-evident audit chain
npm run verify-audit-log -- --input ./audit.jsonl
```

> **CLI or web — same surface.** `npm start` launches the terminal
> wizard with `@inquirer/prompts` (arrow-key navigation, conditional
> branching, in-place edits). `npm run start:web` launches a vanilla-JS
> SPA on port 3000 with the same wizard flow, same generators, same
> output — stateless by default, optional Postgres backend for
> horizontal scale-out, encrypted resumable sessions via shareable
> `?session=<id>` URLs. Both surfaces drive identical generation.
> Full walkthroughs:
> [CLI](docs/user-guide/01-wizard-walkthrough.md) ·
> [Web](docs/user-guide/07-session-and-resume.md).

Guided 10-minute tour: [`docs/getting-started.md`](docs/getting-started.md).

---

## What you get

A snippet from a generated `CLAUDE.md` — HIPAA-scoped TypeScript + Python
team, developer role, strict security tier:

````markdown
# Patient portal

## Tech Stack

- Languages: typescript, python
- Build: npm
- CI/CD: github_actions

## Security Requirements

- Never commit secrets, API keys, or credentials
- NEVER include PHI in any form: code, comments, test fixtures, logs
- NEVER include PII in any form: code, comments, test fixtures, logs
- DLP hooks actively scan all edits for sensitive data patterns
- Follow OWASP Top 10 guidelines for all user-facing code

## Compliance

- HIPAA compliance is mandatory
- Never include PHI in code, comments, logs, or test data
- For PHI handling details, see .claude/rules/hipaa-compliance.md
````

That `CLAUDE.md` is one of 16 files generated for this profile under
the default `claude` target. Backing it up: path-scoped rule files
(`.claude/rules/hipaa-phi-handling.md`,
`.claude/rules/healthcare-interop.md`, `.claude/rules/hipaa-compliance.md`,
`.claude/rules/security.md`, plus language rules for `typescript` and
`python`), three Python hook scripts under `.claude/hooks/`
(`dlp-scanner.py`, `audit-logger.py`, `command-guard.py`), a
permissions-tier `.claude/settings.json` plus a `.claude/settings.local.json`
allow-list, an `.mcp.json.template` for MCP server wiring, and the
`.claudeignore` / `.claude/.claude_ignore` egress controls. Opt additional
targets in (`--targets claude,agents-md,cursor,copilot,gemini,windsurf`)
and the same answer set produces `AGENTS.md`, `.cursor/rules/*.mdc`,
`.github/copilot-instructions.md` + scoped instructions, `GEMINI.md`,
and `.windsurfrules` alongside. If TECH_013 (local AI) is `yes`,
add `.continue/config.json`, `.aider.conf.yml` + `.aiderignore`,
`.zed/settings.json`, a root `OLLAMA_SETUP.md`, and a runnable
RAG scaffold under `rag/` (chunker + embedder + SQLite-VSS store +
audit + CLI) with `RAG_RUNBOOK.md` at the project root and a
path-scoped compliance rule file under `.claude/rules/` for each
active framework (`rag-hipaa-`, `rag-pci-`, `rag-soc2-`, or
`rag-ferpa-compliance.md`; `rag-conventions.md` for non-regulated
profiles).

See the full file inventory in
[`docs/user-guide/02-generated-files.md`](docs/user-guide/02-generated-files.md).

---

## What it generates

Pick one or more output targets via `EMBEDIQ_OUTPUT_TARGETS` or
`--targets`:

**Hosted agents** (six target families — the default surface):

| Target          | Files produced                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `claude` (default) | `CLAUDE.md`, `.claude/settings.json`, `.claude/settings.local.json`, `.claude/rules/*` (universal + per-language), `.claude/commands/*` and `.claude/agents/*` (when the profile registers any), `.claude/skills/*` (when domain packs / skills are active), `.claude/hooks/*` (Python DLP, audit, egress, command-guard), `.claudeignore`, `.mcp.json.template`, `.claude/association_map.yaml`, `.claude/document_state.yaml` |
| `agents-md`     | `AGENTS.md` (cross-agent universal format)                                                         |
| `cursor`        | `.cursor/rules/*.mdc` with MDC frontmatter (`alwaysApply`, `globs`)                                |
| `copilot`       | `.github/copilot-instructions.md` + glob-scoped `.github/instructions/*.instructions.md`           |
| `gemini`        | `GEMINI.md`                                                                                         |
| `windsurf`      | `.windsurfrules`                                                                                    |

**Local-AI integrations** (v3.3 — auto-included when the wizard's
`TECH_013` "use local AI" answer is `yes`; per-IDE gated by
`TECH_017`):

| Target          | Files produced                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `continue-dev`  | `.continue/config.json` — Ollama models, tab-autocomplete, embeddings provider, telemetry off      |
| `aider`         | `.aider.conf.yml` + `.aiderignore` — Ollama-backed default model, language-aware test/lint commands |
| `zed-ai`        | `.zed/settings.json` — Ollama provider registration                                                |
| `ollama`        | Root `OLLAMA_SETUP.md` runbook — install commands, `ollama pull` per selected model, hardware-tier tuning notes |
| `rag-scaffold`  | `rag/` directory (chunker + embedder + SQLite-VSS store + audit + CLI), root `RAG_RUNBOOK.md`, and one path-scoped `.claude/rules/rag-{framework}-compliance.md` per active compliance framework. Chunker is FHIR-aware for healthcare profiles, plain-text otherwise. |
| `local-router`  | `router/` Express dispatch service (v3.3) — routes local Ollama by default, escalates to hosted LLMs after optional PHI redaction; opt-in via `TECH_019` |

**v4.0 governance outputs** (post-pass — opt-in only; existing goldens regenerate byte-identically):

| Target              | File produced | What it carries |
| ------------------- | ------------- | --------------- |
| `cyclonedx-aibom`   | `.embediq/cyclonedx/aibom.json`            | CycloneDX 1.6 ML-BOM enumerating every AI model, agent, and service the harness invokes (Ollama, hosted APIs, IDE agents, local-router). Procurement-relevant under EO 14110. [Doc →](docs/extension-guide/exporting-cyclonedx-aibom.md) |
| `oscal-component`   | `.embediq/oscal/component-definition.json` | OSCAL 1.1.2 Component Definition — product-level claim that the harness implements the listed compliance frameworks. Drata / Vanta / OSCAL-aware platforms ingest directly. [Doc →](docs/extension-guide/exporting-oscal-component-definitions.md) |
| `oscal-ssp-fragment`| `.embediq/oscal/ssp-fragment.json`         | OSCAL 1.1.2 SSP fragment — deployment-level claim. Stamped `document-completion-status=fragment` so audit pipelines know the operator merges with their org-specific SSP content. Operator-tunable via `EMBEDIQ_OSCAL_SSP_*` env vars. [Doc →](docs/extension-guide/exporting-oscal-ssp-fragments.md) |
| `provenance`        | `.embediq/provenance/manifest.json`        | Per-file authoritative generator + target attribution + heuristic driver inference ("why is this file here?"). [Doc →](docs/extension-guide/exporting-provenance-trace.md) |

Plus opt-in via env var (not a target):

- **Tamper-evident audit chain** (v4.0) — `EMBEDIQ_AUDIT_CHAIN_ENABLED=true` writes hash-chained JSONL entries to `EMBEDIQ_AUDIT_LOG`. RFC-6962 linked-log pattern; `npm run verify-audit-log -- --input <path>` reports the first integrity break. [Doc →](docs/operator-guide/audit-chain.md)
- **NIST AI RMF + AI 600-1 domain pack** (v4.0) — opt in via `REG_002` containing `nist-ai-rmf`, or compose programmatically via `domainPackRegistry.composeFromPacks(['healthcare', 'nist-ai-rmf'], …)`. Adds 6 wizard questions, 4 path-scoped rule files (Govern/Map/Measure/Manage), 2 recognized frameworks. [Doc →](docs/extension-guide/nist-ai-rmf-pack.md)

Non-technical roles (Business Analyst, Product Manager, Executive) get
coworker-shaped variants focused on research, analysis, and documentation
instead of code, and never see the local-AI targets.

---

## How it stacks up

EmbedIQ ships an evaluation harness that scores its output against
golden references and against what other tools produce — Claude
`/init`, hand-rolled configs, shallow template generators. The same
harness that gates internal quality is yours to run end-to-end:

```bash
npm run evaluate                                  # score EmbedIQ vs golden references
npm run benchmark                                 # score another tool's output vs the same goldens
npm run evaluate -- --format scorecard --out r.html  # customer-facing HTML scorecard
```

Methodology, scoring weights, and per-archetype scorecards in
[`docs/evaluators/competitive-comparison.md`](docs/evaluators/competitive-comparison.md);
the scorecard option surface (themes, layouts, logo embed, PDF
output) in
[`docs/user-guide/06-evaluation-and-drift.md`](docs/user-guide/06-evaluation-and-drift.md#customer-facing-scorecards).
"Prove it" beats "trust me" in regulated procurement.

---

## Feature matrix

### Core differentiators

| Area | What ships today |
|---|---|
| **Adaptive Q&A** | 91 questions · 7 dimensions · explicit agent-target selection (`STRAT_TARGETS`) and admin-vs-user split (`STRAT_000b`) gate ~28 admin-only questions for end-user operators |
| **Role adaptation** | 9 roles (developer, devops, lead, eng_manager, BA, PM, executive, QA, data); role-specific output variants; admin/user operator-type orthogonal to role |
| **Per-question context + purpose** | Every question carries `helpText` (shown to all users) plus admin-only `purposeText` explaining what the answer drives in the generated output |
| **Multi-agent targets** | Claude Code, `AGENTS.md`, Cursor, Copilot, Gemini, Windsurf — from one interview |
| **Local-AI integration** (v3.3) | Continue.dev, Aider, Zed AI, and Ollama — auto-included when the wizard's local-AI branch (`TECH_013`) is opted in |
| **Runnable RAG scaffold** (v3.3) | `rag-scaffold` target emits chunker + embedder + SQLite-VSS store + audit + CLI under `rag/`, with FHIR-aware chunker for healthcare profiles and per-framework compliance rules (`rag-hipaa-`, `rag-pci-`, `rag-soc2-`, `rag-ferpa-compliance.md`) |
| **Compliance-aware output** | Pre-write validators (HIPAA, PCI-DSS, SOC2, GDPR, universal); refused — not warned about |
| **Determinism + audit-readiness** | Zero LLM calls in the generator path; same answers → byte-identical files; CI-gateable |
| **Evaluation framework** | Golden-config replay scoring; benchmark mode against competing tools |
| **Domain packs + composable skills** | Built-in Healthcare / Finance / Education plus `SKILL.md` authoring format; external packs via `EMBEDIQ_PLUGINS_DIR` / `EMBEDIQ_SKILLS_DIR` |

### Operational features

| Area | What ships today |
|---|---|
| **Drift detection** | `npm run drift` classifies files as match / missing / modified / stale / version-mismatch / extra |
| **Autopilot** | Scheduled drift scans (`@hourly` / `@daily` / `@weekly` / `@monthly` presets or arbitrary 5-field cron expressions in any IANA timezone with DST handling) plus webhook triggers. Multi-replica scheduling via the Postgres-backed store (`claimSchedule()` CAS — every replica reads the shared table, each due schedule fires exactly once). Failure-streak alerting via the `autopilot:alerting` event (one-shot per crossing). |
| **Interrupt & resume** | Shareable `?session=<id>` URLs; per-answer contributor attribution for multi-stakeholder workflows |
| **Multi-platform PR integration** | `--git-pr` opens a PR via GitHub, GitLab, or Bitbucket Cloud (atomic multi-file commits through each platform's native API) |
| **Outbound notifications** | Slack Block Kit / Teams MessageCard / generic JSON via `EMBEDIQ_WEBHOOK_URLS` |
| **Compliance webhooks** | Drata, Vanta, and generic adapters translate external findings into autopilot runs; HMAC-SHA256 signature verification opt-in per adapter |

### v4.0 governance suite

| Area | What ships today |
|---|---|
| **OSCAL catalog/profile import** | `DomainPackRegistry.loadFromOscalCatalog()` + `.loadFromOscalProfile()` ingest NIST 800-53 / SSDF / FedRAMP profiles directly. No JVM dep. Composes with industry packs via `composeFromPacks()`. |
| **OSCAL component-definition export** | Per-generation product-level OSCAL claim — `--targets oscal-component`. Drata / Vanta / FedRAMP 20x ingestion-ready. |
| **OSCAL SSP fragment export** | Per-engagement deployment-level OSCAL fragment — `--targets oscal-ssp-fragment`. Operator-tunable via `EMBEDIQ_OSCAL_SSP_*` env vars. Stamped `document-completion-status=fragment`. |
| **CycloneDX-ML AIBOM** | Full AI bill of materials enumerating every model, agent, and service the harness invokes — `--targets cyclonedx-aibom`. EO 14110-aligned. |
| **Per-file provenance trace** | "Why is this file here?" answer-key combining authoritative generator attribution + heuristic driver inference — `--targets provenance`. |
| **Tamper-evident audit chain** | RFC-6962-pattern hash-chained `audit.jsonl` via `EMBEDIQ_AUDIT_CHAIN_ENABLED=true` + `verify-audit-log` CLI for offline integrity check. |
| **NIST AI RMF + AI 600-1 pack** | Built-in domain pack mapping Govern/Map/Measure/Manage onto rule templates + validation checks + 6 wizard questions. Cross-industry; compose with HIPAA / PCI / FERPA via `composeFromPacks()`. |

### Infrastructure & deployment

| Area | What ships today |
|---|---|
| **Authentication** | Basic / OIDC / reverse-proxy header / demo (admin-vs-user persona switcher for demo recordings — never for production); three-tier RBAC (`wizard-viewer` / `wizard-user` ≡ `wizard-contributor` / `wizard-admin`) with legacy `wizard-user` preserved as a contributor alias |
| **Session persistence** | Null (default) / JSON file / SQLite / Postgres backends; AES-256-GCM optional payload encryption with side-by-side key rotation (`EMBEDIQ_SESSION_DATA_KEY_PREV`). Postgres backend supports horizontal scale-out — every web replica reads the same session table |
| **Multi-engagement scoping** | `EMBEDIQ_ENGAGEMENT_ID` isolates session, autopilot, and audit state under `.embediq/engagements/<id>/` — one process per engagement |
| **Observability** | Optional OpenTelemetry (`EMBEDIQ_OTEL_ENABLED=true`); JSONL audit log |
| **Deployment** | Docker, docker-compose, Kubernetes manifests with health and readiness probes |

---

## Requirements

**To run EmbedIQ**

| Requirement | Minimum   | Check             |
| ----------- | --------- | ----------------- |
| Node.js     | 18+       | `node --version`  |
| npm         | 8+        | `npm --version`   |

No Anthropic account or API key is needed to run the wizard itself —
EmbedIQ is 100% offline.

**To use the generated Claude Code output**

| Requirement | Details |
| --- | --- |
| Claude Code | `npm install -g @anthropic-ai/claude-code` |
| Anthropic subscription | Pro ($20/mo), Max ($100-200/mo), Team ($30/user/mo), Enterprise, or API (BYOK) |
| Python 3.8+ | Required if hook scripts are generated (DLP, audit, egress) |

Output for other targets (Cursor, Copilot, Gemini, Windsurf, `AGENTS.md`)
has no tool-specific runtime requirement beyond the agent itself.

---

## Architecture

Three-layer design:

```
┌────────────────────────────────────────────────────┐
│  Layer 1: Universal Question Bank                  │
│  91 questions · 7 dimensions · purposeText schema  │
├────────────────────────────────────────────────────┤
│  Layer 2: Adaptive Logic Engine                    │
│  Branch evaluation · profile building · priorities │
├────────────────────────────────────────────────────┤
│  Layer 3: Unified Synthesizer                      │
│  28 generators · 16 target formats · validation    │
└────────────────────────────────────────────────────┘
```

Both CLI and web interfaces share the same core. The web API is
stateless by default — the browser holds the answer map and sends it
with each request. Opt-in server-side sessions add interrupt-and-resume
without compromising the zero-persistence baseline.

---

## Documentation map

| I want to… | Go to |
| --- | --- |
| Take a guided 10-minute tour | [`docs/getting-started.md`](docs/getting-started.md) |
| Run the wizard end-to-end | [`docs/user-guide/01-wizard-walkthrough.md`](docs/user-guide/01-wizard-walkthrough.md) |
| Understand every generated file | [`docs/user-guide/02-generated-files.md`](docs/user-guide/02-generated-files.md) |
| Generate for Cursor / Copilot / Gemini / Windsurf | [`docs/user-guide/05-multi-agent-targets.md`](docs/user-guide/05-multi-agent-targets.md) |
| Score my output against golden configs | [`docs/user-guide/06-evaluation-and-drift.md`](docs/user-guide/06-evaluation-and-drift.md) |
| Resume a wizard session on another device | [`docs/user-guide/07-session-and-resume.md`](docs/user-guide/07-session-and-resume.md) |
| Schedule nightly drift scans | [`docs/user-guide/08-autopilot.md`](docs/user-guide/08-autopilot.md) |
| Open a PR instead of writing to disk | [`docs/user-guide/09-git-pr-integration.md`](docs/user-guide/09-git-pr-integration.md) |
| Wire Slack / Teams notifications | [`docs/user-guide/10-notification-webhooks.md`](docs/user-guide/10-notification-webhooks.md) |
| Trigger runs from Drata or Vanta | [`docs/user-guide/11-compliance-webhooks.md`](docs/user-guide/11-compliance-webhooks.md) |
| Deploy to Docker or Kubernetes | [`docs/operator-guide/deployment.md`](docs/operator-guide/deployment.md) |
| Run multiple engagements out of one checkout | [`docs/CONSULTING-FIRM-DEPLOYMENT.md`](docs/CONSULTING-FIRM-DEPLOYMENT.md) |
| Deploy in a HIPAA-covered healthcare BPO environment | [`docs/HEALTHCARE-BPO-DEPLOYMENT.md`](docs/HEALTHCARE-BPO-DEPLOYMENT.md) |
| Wire authentication | [`docs/operator-guide/authentication.md`](docs/operator-guide/authentication.md) |
| Set up OpenTelemetry | [`docs/operator-guide/observability.md`](docs/operator-guide/observability.md) |
| Look up every env var | [`docs/reference/configuration.md`](docs/reference/configuration.md) |
| Look up every HTTP endpoint | [`docs/reference/rest-api.md`](docs/reference/rest-api.md) |
| Write my own domain pack / skill / adapter | [`docs/extension-guide/`](docs/extension-guide/) |
| Read the architecture | [`docs/architecture/overview.md`](docs/architecture/overview.md) |
| Evaluate EmbedIQ vs. competitors | [`docs/evaluators/competitive-comparison.md`](docs/evaluators/competitive-comparison.md) |
| Contribute code or docs | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Report a security issue | [`SECURITY.md`](SECURITY.md) |

---

## Commands at a glance

```bash
make help                 # Show all targets
make check                # Type-check + 949 tests
make start                # CLI wizard
make start-web            # Web server on :3000
make evaluate             # Run evaluation harness
make benchmark            # Benchmark another tool's output
make drift                # Drift-check a project (flags required)
make otel-dev             # Web server with OpenTelemetry enabled
make docker-up            # Start via docker-compose
```

Or use the raw `npm` scripts — every Makefile target wraps a one-line
`npm run ...` call.

---

## Data privacy — the short version

- **No database** unless you opt in to a session backend (JSON file or
  SQLite). Default is volatile memory only.
- **No telemetry.** EmbedIQ never phones home.
- **No LLM calls.** The wizard is 100% deterministic — answers are
  never sent to any AI service.
- **No hidden disk writes.** Output lands in the directory you name,
  period.
- **Air-gap compatible.** CLI runs offline; web server's only optional
  outbound traffic is OpenTelemetry export, git PR integration, and
  outbound webhooks — all opt-in via env vars.

Full threat model and compliance-framework coverage in
[`SECURITY.md`](SECURITY.md) and
[`docs/evaluators/threat-coverage.md`](docs/evaluators/threat-coverage.md).

---

## License

[MIT](LICENSE). A [Praglogic](https://pragmaticlogic.ai) project.
Contributions welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).
