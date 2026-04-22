<!-- audience: public -->

# EmbedIQ

**An adaptive AI coding agent configuration wizard by [Praglogic](https://praglogic.com).**

EmbedIQ interviews you about your project, team, and compliance obligations,
then generates a complete agent harness — 15–40 files — tailored to your
role, industry, tech stack, and security posture. Everything is
**deterministic, offline, and audit-ready**: no LLM calls, no telemetry,
no database. The same interview produces configuration for Claude Code,
Cursor, GitHub Copilot, Gemini CLI, Windsurf, and cross-agent `AGENTS.md`
from a single answer set.

> **Status:** v3.2 shipped. The full v3.1 and v3.2 feature sets
> (evaluation framework, multi-agent targets, composable skills,
> interrupt-and-resume, autopilot, GitHub PR integration, outbound
> webhooks, compliance inbound webhooks) are production-ready today.
> See [CHANGELOG.md](CHANGELOG.md).

---

## 60-second quickstart

```bash
git clone <repo-url>
cd embediq
npm install

# Interactive CLI wizard
npm start

# Or web UI
npm run start:web          # http://localhost:3000

# Already generated once? Drift-check a project
npm run drift -- --target ./my-project --archetype minimal-developer

# Scoring + benchmarking
npm run evaluate           # replay answer sets against golden references
npm run benchmark -- --candidate ./other-tool-output --candidate-label claude-init
```

See [`docs/getting-started.md`](docs/getting-started.md) for a guided
ten-minute tour.

---

## What it generates

Pick one or more output targets via `EMBEDIQ_OUTPUT_TARGETS` or
`--targets`:

| Target          | Files produced                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `claude` (default) | `CLAUDE.md`, `.claude/settings.json`, `.claude/rules/*`, `.claude/commands/*`, `.claude/agents/*`, `.claude/skills/*`, `.claude/hooks/*` (Python), `.claudeignore`, `.mcp.json.template`, `.claude/association_map.yaml`, `.claude/document_state.yaml` |
| `agents-md`     | `AGENTS.md` (cross-agent universal format)                                                         |
| `cursor`        | `.cursor/rules/*.mdc` with MDC frontmatter (`alwaysApply`, `globs`)                                |
| `copilot`       | `.github/copilot-instructions.md` + glob-scoped `.github/instructions/*.instructions.md`           |
| `gemini`        | `GEMINI.md`                                                                                         |
| `windsurf`      | `.windsurfrules`                                                                                    |

Non-technical roles (Business Analyst, Product Manager, Executive) get
coworker-shaped variants focused on research, analysis, and documentation
instead of code.

## Feature matrix

| Area                           | What ships today                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Adaptive Q&A**               | 71 questions · 7 dimensions · 40 with conditional branching                                         |
| **Role adaptation**            | 8 roles (developer, devops, lead, BA, PM, executive, QA, data); role-specific output variants       |
| **Domain packs**               | Built-in Healthcare / Finance / Education; external packs via `EMBEDIQ_PLUGINS_DIR`                 |
| **Composable skills**          | `SKILL.md` format for granular composition; external skills via `EMBEDIQ_SKILLS_DIR`                |
| **Output validation**          | Pre-write compliance checks (HIPAA, PCI-DSS, SOC2, GDPR, universal)                                 |
| **Multi-agent targets**        | Claude, AGENTS.md, Cursor, Copilot, Gemini, Windsurf from one interview                             |
| **Evaluation framework**       | Golden-config replay scoring, benchmark mode vs. competing tools, CI-gatekeeping exit codes        |
| **Drift detection**            | `npm run drift` classifies files as match / missing / modified / stale / version-mismatch / extra |
| **Autopilot**                  | `@hourly` / `@daily` / `@weekly` / `@monthly` scheduled drift scans + webhook triggers              |
| **Interrupt & resume**         | Shareable `?session=<id>` URLs; per-answer attribution for multi-stakeholder workflows              |
| **GitHub PR integration**      | `--git-pr` opens a PR with the generated files via the Git Data API (atomic multi-file commit)      |
| **Outbound notifications**     | Slack Block Kit / Teams MessageCard / generic JSON formatters via `EMBEDIQ_WEBHOOK_URLS`            |
| **Compliance webhooks**        | Drata / Vanta / generic adapters translate external findings into autopilot runs                    |
| **Authentication**             | Basic / OIDC / reverse-proxy header; RBAC with `wizard-user` + `wizard-admin`                       |
| **Session persistence**        | Null (default) / JSON file / SQLite backends; AES-256-GCM optional payload encryption               |
| **Observability**              | Optional OpenTelemetry (`EMBEDIQ_OTEL_ENABLED=true`); JSONL audit log                               |
| **Deployment**                 | Docker, docker-compose, Kubernetes manifests with health/readiness probes                           |

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
│  71 questions · 7 dimensions · 40 with branching   │
├────────────────────────────────────────────────────┤
│  Layer 2: Adaptive Logic Engine                    │
│  Branch evaluation · profile building · priorities │
├────────────────────────────────────────────────────┤
│  Layer 3: Unified Synthesizer                      │
│  Target-aware generators · validation · stamping   │
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
make check                # Type-check + 731+ tests
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

[MIT](LICENSE). Contributions welcome — see
[`CONTRIBUTING.md`](CONTRIBUTING.md).
