<!-- audience: public -->

# EmbedIQ

**Governed configuration for every AI coding agent — from one interview.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) · [Latest release: **v4.0.1**](https://github.com/asq-sheriff/embediq/releases/latest) · Deterministic & offline

EmbedIQ interviews you once about your project, team, and compliance
obligations, then generates a complete, governed agent harness — typically
15–40 files — for every major AI coding agent from a single answer set:
**Claude Code, Cursor, GitHub Copilot, Gemini, Windsurf, and cross-agent
`AGENTS.md`**. The generator makes **zero LLM calls**, so the same answers
always produce **byte-identical output** — including under regulatory audit.

[Full changelog](CHANGELOG.md) ·
[Security model](SECURITY.md) ·
[Documentation](docs/getting-started.md)

![EmbedIQ demo — drift, evaluation, and multi-engagement scoping in ~70 seconds](docs/assets/demo.gif)

---

## Why it matters

Teams adopting AI coding agents juggle four to six tools, each with its own
config language. Configurations duplicate, drift, and decay; compliance teams
have no single artifact to audit; security posture varies by each developer's
local setup; and every new hire rebuilds the harness from scratch.

EmbedIQ produces one **governed source of truth** from a structured interview
and keeps it that way — drift detection, scheduled regeneration, and
byte-identical re-runs. Because no model sits in the generator path, the output
is reproducible and provable, not best-effort.

---

## Capabilities at a glance

**One interview, every agent**
- Claude Code, Cursor, GitHub Copilot, Gemini, Windsurf, and `AGENTS.md` from one answer set.
- Role-adaptive: developers get a full harness (rules, hooks, settings); business analysts, product managers, and executives get a research-and-analysis "coworker" setup instead of code config.
- **Three-role delegation**: each question is owned by the Admin (policy), the Team Lead (the project + lived experience), or the Individual (per-seat preferences) — the admin sets policy and delegates the rest via a shareable link, with per-answer attribution. [→](docs/user-guide/13-three-role-delegation.md)
- Optional local-AI stack — Continue.dev, Aider, Zed AI, Ollama — plus a runnable RAG scaffold (FHIR-aware for healthcare, plain-text otherwise).

**Governance & compliance**
- Pre-write validators that *refuse* non-compliant output for HIPAA, PCI-DSS, SOC 2, and GDPR.
- Machine-readable evidence: OSCAL Component Definition + SSP fragment, CycloneDX-ML AIBOM, and a per-file provenance manifest — ingestible by Drata, Vanta, FedRAMP, and Dependency-Track pipelines.
- Built-in NIST AI RMF + AI 600-1 domain pack; composable with HIPAA / PCI / FERPA.

**Deterministic & audit-ready**
- No LLM calls in the generator path — same answers in, byte-identical files out.
- Optional RFC-6962 tamper-evident audit chain with a `verify-audit-log` CLI.
- A versioned, downloadable profile report capturing every answer and the decisions EmbedIQ derived from it.

**Stays in sync**
- Drift detection classifies every managed file (match / missing / hand-edited / stale / extra).
- Autopilot runs scheduled drift scans and can open a regeneration PR automatically.
- `--git-pr` opens that PR via GitHub, GitLab, Bitbucket Cloud, or Azure DevOps Repos.

**Enterprise integration**
- Azure DevOps: Azure Repos PRs + a stack-matched `azure-pipelines.yml`; Visual Studio (`.editorconfig`) and JetBrains (`.junie/`, `.aiignore`) output.
- Pluggable auth (HTTP Basic / OIDC / reverse-proxy header) with three-tier RBAC.
- Per-engagement state isolation for consulting/MSP use; Docker / Kubernetes deploy; optional OpenTelemetry.

---

## 60-second quickstart

```bash
git clone https://github.com/asq-sheriff/embediq.git
cd embediq
npm install

npm start                  # interactive CLI wizard
npm run start:web          # or the web UI — same wizard, same output, http://localhost:3000

# Generate with the governance evidence set
npm start -- --targets claude,cyclonedx-aibom,oscal-component,oscal-ssp-fragment,provenance

# Already generated? Drift-check a project
npm run drift -- --target ./my-project --archetype minimal-developer

# Score EmbedIQ's output (or a competing tool's) against golden references
npm run evaluate
```

CLI and web share one core: the browser holds the answer map and drives the
same generators. Guided tour: [`docs/getting-started.md`](docs/getting-started.md).

---

## What you get

A snippet from a generated `CLAUDE.md` — HIPAA-scoped TypeScript + Python team,
developer role, strict security tier:

````markdown
# Patient portal

## Tech Stack
- Languages: typescript, python
- Build: npm
- CI/CD: github_actions

## Security Requirements
- Never commit secrets, API keys, or credentials
- NEVER include PHI in any form: code, comments, test fixtures, logs
- DLP hooks actively scan all edits for sensitive data patterns

## Compliance
- HIPAA compliance is mandatory
- For PHI handling details, see .claude/rules/hipaa-compliance.md
````

That `CLAUDE.md` is one of ~16 files for this profile: path-scoped rule files,
Python DLP / audit / command-guard hooks, a permissions-tiered
`settings.json` + local allow-list, an `.mcp.json.template`, and egress
controls. Opt in more targets and the same answers also produce `AGENTS.md`,
`.cursor/rules/*.mdc`, Copilot instructions, `GEMINI.md`, and `.windsurfrules`.
Full inventory: [`docs/user-guide/02-generated-files.md`](docs/user-guide/02-generated-files.md).

---

## What it generates

Select targets via `--targets` (or `EMBEDIQ_OUTPUT_TARGETS`). The default is
`claude`.

| Hosted agent | Output |
| --- | --- |
| `claude` (default) | `CLAUDE.md`, `.claude/` rules, hooks, settings, commands, agents, skills, MCP template, ignore files |
| `agents-md` | `AGENTS.md` (cross-agent universal format) |
| `cursor` | `.cursor/rules/*.mdc` (MDC frontmatter) |
| `copilot` | `.github/copilot-instructions.md` + scoped `.github/instructions/*` |
| `gemini` | `GEMINI.md` |
| `windsurf` | `.windsurfrules` |

- **Local AI** — opting into the local-AI branch adds Continue.dev, Aider, Zed AI, and Ollama configs plus a runnable RAG scaffold. → [`docs/user-guide/05-multi-agent-targets.md`](docs/user-guide/05-multi-agent-targets.md)
- **Governance evidence** — `cyclonedx-aibom`, `oscal-component`, `oscal-ssp-fragment`, and `provenance` are opt-in post-pass outputs; existing output regenerates byte-identically without them. → [`docs/extension-guide/`](docs/extension-guide/)

Non-technical roles (BA / PM / Executive) get coworker-shaped output focused on
research, analysis, and documentation, and never see the local-AI targets.

---

## Architecture

```
┌────────────────────────────────────────────────────┐
│  Layer 1: Universal Question Bank                  │
│  93 questions · 7 dimensions · purposeText schema  │
├────────────────────────────────────────────────────┤
│  Layer 2: Adaptive Logic Engine                    │
│  Branch evaluation · profile building · priorities │
├────────────────────────────────────────────────────┤
│  Layer 3: Unified Synthesizer                      │
│  31 generators · 16 target formats · validation    │
└────────────────────────────────────────────────────┘
```

CLI and web interfaces share this core. The web API is stateless by default —
the browser holds the answer map; opt-in server-side sessions add
interrupt-and-resume without compromising the zero-persistence baseline.

---

## Requirements

| Requirement | Minimum | Check |
| --- | --- | --- |
| Node.js | 18+ | `node --version` |
| npm | 8+ | `npm --version` |

No Anthropic account or API key is needed to run the wizard — EmbedIQ is 100%
offline. Generated Claude Code output requires Claude Code + an Anthropic plan
to *use*; output for other agents has no runtime dependency beyond the agent.

---

## Documentation

| I want to… | Go to |
| --- | --- |
| Take a guided 10-minute tour | [`docs/getting-started.md`](docs/getting-started.md) |
| Run the wizard end-to-end | [`docs/user-guide/01-wizard-walkthrough.md`](docs/user-guide/01-wizard-walkthrough.md) |
| Understand every generated file | [`docs/user-guide/02-generated-files.md`](docs/user-guide/02-generated-files.md) |
| Generate for Cursor / Copilot / Gemini / Windsurf | [`docs/user-guide/05-multi-agent-targets.md`](docs/user-guide/05-multi-agent-targets.md) |
| Score output + schedule drift scans | [`docs/user-guide/06-evaluation-and-drift.md`](docs/user-guide/06-evaluation-and-drift.md) |
| Open a PR instead of writing to disk | [`docs/user-guide/09-git-pr-integration.md`](docs/user-guide/09-git-pr-integration.md) |
| Delegate questions to the right people | [`docs/user-guide/13-three-role-delegation.md`](docs/user-guide/13-three-role-delegation.md) |
| Export OSCAL / CycloneDX / provenance | [`docs/extension-guide/`](docs/extension-guide/) |
| Deploy to Docker or Kubernetes | [`docs/operator-guide/deployment.md`](docs/operator-guide/deployment.md) |
| Run multiple engagements from one checkout | [`docs/CONSULTING-FIRM-DEPLOYMENT.md`](docs/CONSULTING-FIRM-DEPLOYMENT.md) |
| Deploy in a HIPAA healthcare environment | [`docs/HEALTHCARE-BPO-DEPLOYMENT.md`](docs/HEALTHCARE-BPO-DEPLOYMENT.md) |
| Look up every env var / HTTP endpoint | [`docs/reference/configuration.md`](docs/reference/configuration.md) · [`docs/reference/rest-api.md`](docs/reference/rest-api.md) |
| Read the architecture | [`docs/architecture/overview.md`](docs/architecture/overview.md) |
| Evaluate EmbedIQ vs. competitors | [`docs/evaluators/competitive-comparison.md`](docs/evaluators/competitive-comparison.md) |

---

## Data privacy

- **No database** unless you opt into a session backend; default is volatile memory only.
- **No telemetry** — EmbedIQ never phones home.
- **No LLM calls** — the wizard is 100% deterministic; answers are never sent to any AI service.
- **No hidden disk writes** — output lands only in the directory you name.
- **Air-gap compatible** — the only optional outbound traffic (OpenTelemetry, git PR, webhooks) is opt-in via env vars.

Full threat model in [`SECURITY.md`](SECURITY.md).

---

## Contributors

- **[ASQ (@asq-sheriff)](https://github.com/asq-sheriff)** — creator & maintainer

## License

[MIT](LICENSE). A [Praglogic](https://pragmaticlogic.ai) project.
