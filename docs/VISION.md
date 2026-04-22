<!-- audience: public -->


# EmbedIQ — Vision

**A Praglogic product.**

---

## Vision Statement

> **Make any AI coding agent production-ready for any project, team, or industry in a single sitting — without hand-writing a single configuration file, and without trusting a third-party service with your answers.**

EmbedIQ interviews the people who know the project best, understands what they need their AI coding agent to do, and produces the complete working configuration across every agent their team uses — role-adapted, compliance-aware, security-tiered, and deterministic.

---

## The Category

EmbedIQ is creating a new category — **Agent Harness Generation** — that no existing tool fully occupies.

The adjacent spaces are close but structurally different:

- **Shallow config generators** (Agent Rules Builder, CLAUDE.md Generator) produce one file from a static template. No compliance awareness, no role adaptation, no validation. "Good enough for a side project" and structurally incapable of serving regulated industries.
- **Spec-driven workflow tools** (GitHub Spec Kit, AWS Kiro) help describe *what to build*, not *how the agent behaves*. They run alongside EmbedIQ in the timeline, not against it — you configure the agent with EmbedIQ, then specify features with Spec Kit.
- **Agent governance platforms** (Knostic and similar) monitor agent runtime behavior and flag violations *after the fact*. EmbedIQ operates *upstream* — configuring the agent so violations are structurally prevented instead of detected.
- **Format conversion tools** (Rulesync) translate existing rules between formats but don't generate configuration from structured input.

None of these combine adaptive Q&A, role-awareness, compliance-aware generation, deterministic output, and multi-file configuration synthesis across multiple agent formats. EmbedIQ does.

---

## The Problem

Setting up an AI coding agent well is harder than it should be. A production-grade harness touches 15 to 40 interrelated files across whichever agent the team uses — `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`, `GEMINI.md`, `.windsurfrules`, plus settings, permissions, hooks, skills, agents, and commands in each tool's native format. Each one has defaults that matter. Each one has security implications. Each one must line up with the others.

The existing options are all bad:

- **Hand-writing configs** is slow, inconsistent across teams, and almost always misses the security rules that matter most (DLP patterns, PHI/PII denials, audit logging, strict-permission hooks).
- **Copy-pasting from blog posts** embeds someone else's assumptions — stack, team size, industry, compliance posture — into your project.
- **Generic starter templates** don't adapt. A solo developer on a prototype gets the same boilerplate as a healthcare team shipping HIPAA-covered software, and neither is right.
- **AI config generators** require sending your project details to a third-party LLM — unacceptable for regulated industries and ungovernable at audit time.
- **Maintaining separate configs per agent** means teams either standardize on one tool (losing flexibility) or duplicate effort across five file formats (accepting drift as they diverge).

EmbedIQ closes this gap with a **deterministic Q&A engine** that produces configs specific to your project, your stack, your team, your compliance obligations, and every agent your developers use — entirely in-process, without ever invoking an LLM.

---

## Who This Is For

EmbedIQ is **role-adaptive** by design. The same wizard serves eight distinct user roles and produces meaningfully different output for each.

### Technical roles — full development setup

- **Developer** — language-specific rules, lint/test hooks, framework commands, model-routing for cost optimization.
- **DevOps** — CI/CD rules, infrastructure commands, container workflows, drift detection.
- **Tech Lead** — code review commands, architectural rules, team-scoped hooks, association maps.
- **QA** — test-runner integration, coverage gates, test-plan commands.
- **Data** — notebook workflows, pipeline commands, SQL/ETL rules.

### Non-technical roles — "Agent as intelligent coworker"

- **Business Analyst** — requirements analysis, user stories, acceptance criteria, data-flow diagrams, compliance validation.
- **Product Manager** — market research, PRDs, prioritization frameworks (RICE, MoSCoW), roadmap docs, stakeholder summaries.
- **Executive** — report summarization, strategic trade-off analysis, executive comms, board prep, industry benchmarks.

For non-technical roles, the generated `CLAUDE.md` / `AGENTS.md` is rewritten as coworker instructions. Technical generators (hooks, association maps) are skipped. Guidelines shift to "clear non-technical language, cite sources, flag assumptions, executive summaries before detail."

### Orthogonal: industry

Every role can be paired with any industry via a **domain pack**. A BA at a hospital still gets HIPAA DLP patterns, PHI detection, and BAA guidance; a PM at a bank still gets PCI-DSS, SOX, and GLBA rules. Three domain packs ship today: **Healthcare** (HIPAA, HITECH, 42 CFR Part 2), **Finance** (PCI-DSS, SOX, GLBA, AML/BSA), **Education** (FERPA, COPPA, state student-privacy laws).

---

## Design Tenets

These are the decisions we do not revisit on a case-by-case basis.

### 1. Zero-persistence by default, answers never leave memory

No database. No session. No cookie. No telemetry. Answers exist only in volatile memory during the wizard, and only on the local file system after generation. This is a hard line, not a configurable option. When persistence is needed for enterprise workflows, it is **opt-in via an environment variable** and the default mode is preserved.

### 2. Deterministic generation — no LLM dependency

EmbedIQ itself never calls an LLM. All question routing, profile building, priority analysis, validation, and file generation is deterministic code. Users can inspect exactly why a specific rule was generated, reproduce any config byte-for-byte from the same answers, and audit the generation process. When AI-assisted enhancement arrives, it is an **opt-in post-processing step** gated on evaluation-framework evidence that it actually improves output — never replacing the deterministic baseline.

### 3. Role-adaptive, not role-bolted-on

The wizard, the profile, the priority analysis, and every generator all consult the user's role. A non-technical profile produces different output, skips technical generators entirely, and shifts the guideline voice. Role is a first-class input, not a post-hoc filter.

### 4. Compliance is built in, not annotated on

Industry and regulatory context drives generation. Permission tiers, DLP patterns, rule templates, ignore patterns, and validation checks all derive from the user's stated compliance obligations — not from developer judgment under deadline pressure. A HIPAA-covered team cannot accidentally produce a setup that logs PHI; the validator refuses to let them.

### 5. Multi-agent from a single interview

A team using Claude Code today and Cursor tomorrow does not re-answer 71 questions. The Q&A, profile, priorities, compliance logic, and validation are all agent-agnostic. Only the Synthesizer targets specific formats — `CLAUDE.md` + `.claude/*`, `AGENTS.md`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`, `GEMINI.md`, `.windsurfrules`. The Q&A interview feeds every target format from a single answer set.

### 6. Type safety as the configuration source

Questions, dimensions, conditions, and domain packs live as TypeScript code, not YAML or JSON. This gives compile-time type safety, IDE autocompletion, and refactorability that external data files cannot match. Domain packs extend via a typed plugin interface; they do not require forking the core.

### 7. Three layers, deliberately independent

- **Question Bank** — what to ask (static, typed).
- **Adaptive Engine** — which questions apply now (evaluates branching conditions).
- **Synthesizer** — what to generate from the answers, across which target formats.

Changes to any one layer do not require changes to the others. Multi-agent output targeting is purely a Synthesizer concern — adding new target formats never forces changes to the Question Bank or Engine.

### 8. Dual interfaces, one core

CLI and web share the engine layer. Neither is a wrapper around the other — both are first-class surfaces over the same business logic.

### 9. Pluggable, not hard-coded

Authentication is pluggable. Domain packs are pluggable. Generators are pluggable. Session backends are pluggable. Target formats are pluggable. Extensibility is a property of the architecture, not a future promise.

### 10. Generate outputs, not collaboration

EmbedIQ generates files and events. Existing enterprise tools handle the human coordination around those outputs and events. The PR is the collaboration artifact. The Slack notification is the collaboration trigger. The compliance-platform webhook is the collaboration input. EmbedIQ does not become a collaboration tool — it becomes a tool that feeds into the collaboration tools the team already uses.

---

## Product Pillars

### 1. Adaptive Q&A

71 questions across seven dimensions — Strategic Intent, Problem Definition, Operational Reality, Technology Requirements, Regulatory Compliance, Financial Constraints, Innovation. 40 questions have branching conditions; irrelevant paths are hidden. Completing the wizard takes 5–15 minutes end-to-end.

### 2. Profile synthesis and priority derivation

Raw answers are folded into a structured `UserProfile`. Priorities are auto-derived via tag-weight analysis across eight categories (Security, Cost, Quality, Productivity, Team, CI/CD, Monitoring, Documentation) with confidence scoring. Users review and adjust in a playback-and-edit phase before generation begins.

### 3. Multi-agent Synthesizer

Today: 12 generators produce a complete Claude Code harness. Next: per-format generators (`AGENTS.md`, Cursor `.mdc`, Copilot `.instructions.md`, Gemini, Windsurf) produce configuration for every agent the team uses, all from the same profile. Target selection via `EMBEDIQ_OUTPUT_TARGETS` env var (default `claude`, preserving current behavior; `all` generates every format).

### 4. Multi-layer security defense

- **Context exclusion** — `.claudeignore` (and equivalents for other agents) keeps sensitive files out of the agent's view.
- **Real-time scanning** — Python hooks fire before tool invocation, run DLP scanners (custom regex from domain packs), block or warn based on severity.
- **Permission enforcement** — graduated tiers (Permissive, Balanced, Strict, Lockdown) at tool invocation.

All three layers stay local — nothing is sent to the LLM, nothing is stored by EmbedIQ.

### 5. Validation before write

`OutputValidator` runs eight check categories (universal, HIPAA, PCI-DSS, SOC2, GDPR, security, domain-pack custom) against the generated file set before any file touches disk. A HIPAA-covered team cannot accidentally ship a setup that violates basic PHI handling rules.

### 6. Measurable quality

An evaluation framework replays recorded answer sets, scores generated configs against golden reference configs, and measures question efficiency. Every generator, every domain pack, every skill is scored. Community-published skills surface their quality score at import time. Competitor output can be scored against the same golden configs — so "our HIPAA config is better than `/init`'s" becomes a data-driven claim, not a qualitative one.

### 7. Observability and persistence (opt-in)

- **Typed event bus** emitting events across engine/synthesizer/server layers.
- **Pluggable subscribers** — audit log, metrics collector, status reconciler, OpenTelemetry exporter, WebSocket hub, outbound notification webhooks.
- **Server-side sessions** via `SessionBackend` (NullBackend, JsonFile, SQLite) with optional AES-256-GCM payload encryption at rest.
- **Async session exports** for admin audit workflows, with `ownerToken` stripping.

Every one of these is opt-in behind an environment variable. Default remains zero-persistence, zero-telemetry.

### 8. Enterprise-fit integration layer

The generated configuration doesn't stop at the filesystem. A Git platform integration (GitHub, GitLab, Bitbucket) pushes generated output to a branch and opens a PR with evaluation scores, validation results, and contributor attribution in the PR body. Outbound webhooks notify Slack, Teams, or PagerDuty on generation, drift, regression, or validation failure. Inbound webhooks from compliance platforms (Drata, Vanta) trigger regeneration when controls change. The human coordination happens in the tools the team already uses.

---

## Strategic Horizons

### Now (shipped, production-ready)

- Adaptive wizard, 71 questions, 12 generators, role-adaptive configuration for Claude Code.
- Three built-in domain packs (Healthcare, Finance, Education) with a typed plugin interface for external packs.
- Dual CLI + Web interface with vanilla-JS frontend (under 20 KB).
- Pluggable authentication and RBAC (no-auth, Basic, OIDC, reverse-proxy header).
- Event bus with WebSocket real-time progress streaming.
- Server-side session persistence (JSON file for dev, SQLite for single-node production) with optional at-rest encryption and async dump exports.
- OpenTelemetry instrumentation (traces, metrics).
- Configuration validation against universal and domain-specific rules.
- Full Docker / Kubernetes deployment manifests.

### Next — v3.1 Strategic Differentiation

Ordered by strategic value; each widens the gap between EmbedIQ and every competing tool while mitigating specific threats from the landscape.

1. **Evaluation Framework** — golden reference configs per archetype, replay harness, diff-based scoring, competitive benchmarking mode. Turns "trust us" into provable quality. Gates and validates every downstream feature.
2. **Multi-Agent Output Targeting** — `AGENTS.md` (universal standard) plus tool-specific generators for Cursor, Copilot, Gemini, Windsurf. Transforms the addressable market from "Claude Code users" to "any AI coding agent users."
3. **Composable Skills System** — fine-grained, reusable units that compose across compliance frameworks and industries. Enterprise teams author custom skills; a registry enables sharing. Quality scored by the evaluation framework. Network effects create a moat that funded competitors cannot replicate with product improvements alone.

### Next — v3.2 Enterprise Operations and Integration

4. **Interrupt and Resume** — shareable session URLs so a 71-question wizard can span multiple days and multiple contributors. Answers attributed by contributor for compliance audit trails.
5. **Autopilot and Drift Detection** — drift detection ships first as a standalone CLI (`embediq drift --target ./my-project`). Scheduled regeneration and webhook-triggered regeneration follow once session infrastructure is deeper.
6. **Git Platform Integration** — GitHub/GitLab/Bitbucket adapters. Generated output flows into a PR with evaluation scores and validation results in the body. The collaboration happens where teams already review code.
7. **Outbound Notification Webhooks** — Slack, Teams, PagerDuty, and generic webhook support. Connects EmbedIQ's event bus to the team's communication tools without building OAuth flows or marketplace integrations.
8. **Compliance Platform Inbound Webhooks** — Drata, Vanta, and generic adapters that translate compliance-platform findings into regeneration triggers. Closes the loop: compliance gap detected → EmbedIQ regenerates → PR opened → team reviews → gap closed.

### Later — v4.0 AI-Augmented Generation

Gated on evaluation-framework data. AI enhancement only ships once the evaluation framework can prove it improves output quality over the deterministic baseline. A provider abstraction supports Claude, OpenAI, Ollama, and a default noop that preserves template-only behavior. Token usage tracked per run. Always opt-in; deterministic baseline always available.

### Future horizons — trigger-gated

- **Cluster deployment** — cross-node event fan-out, shared rate limits, distributed job queues, shared storage for exports. Postgres dialect, Redis pub/sub, job queue abstraction — all part of one initiative when multi-replica demand appears.
- **Multi-workspace SaaS** — UUID-scoped workspaces with owner/admin/member roles for hosted multi-tenant deployment.
- **Agent-to-agent protocols** — A2A Agent Cards when EmbedIQ is discoverable by enterprise agent ecosystems; ACP multi-agent workflows if AI enhancement evolves beyond single LLM calls.
- **Quick mode** — lightweight five-question wizard serving the "better than `/init` but don't need 71 questions" segment. Triggered if a polished competitor UX threatens non-regulated market share.
- **Deep Cursor/Copilot generator parity** — expand non-Claude-Code generators to match Claude Code's configuration depth. Triggered if Claude Code mindshare declines measurably.

Each trigger is documented in the roadmap so the team monitors leading indicators without prematurely investing.

---

## Competitive Threat Landscape

The vision is informed by six identified threat vectors. The roadmap sequences mitigations so the highest-probability threats ship first.

| Threat | Primary Mitigation |
|---|---|
| Anthropic improves Claude Code's `/init` | Evaluation framework — quantitative comparison turns a threat into a sales asset |
| GitHub Spec Kit extends to configuration | Role adaptation (non-technical users) + determinism (audit-compatible output) |
| AWS/Kiro adds compliance-aware steering | Air-gap compatibility + multi-agent generation (Kiro is IDE-proprietary) |
| `AGENTS.md` consolidation | Tool-specific deep features not expressible in the universal format (hooks, scoped Cursor rules, Copilot scoped instructions) |
| Niche players add compliance templates | Depth of compliance enforcement (DLP patterns, validation, hooks) vs. advisory markdown |
| Funded cloud-native LLM-powered competitor | Composable skills ecosystem — network effects create a moat money can't easily replicate |

Two acknowledged vulnerabilities — UX/distribution gap (triggers "quick mode" investment) and Claude Code market-share dependency (triggers deep Cursor/Copilot parity investment) — have explicit monitoring indicators rather than pre-emptive investment.

Determinism, air-gap compatibility, zero-persistence, role adaptation, and compliance depth are not just design tenets — they are the structural moats that make EmbedIQ defensible against each threat.

---

## What EmbedIQ Is Not

Equally important as what the product does is what it refuses to do. These are not capabilities we are delaying — they are outside the product's problem domain.

- **Not a code generator.** EmbedIQ generates *configuration*, not application code. AI coding agents generate application code; EmbedIQ tells them how to do it well.
- **Not a conversational agent.** Q&A is structured, not freeform. Users answer questions; they do not chat with the wizard.
- **Not an LLM wrapper.** The core is deterministic. When AI capabilities arrive, they are opt-in supplements gated on evaluation evidence.
- **Not a collaboration tool.** Multi-stakeholder coordination happens in git PRs, Slack threads, and compliance platforms — the tools the team already uses. EmbedIQ feeds those tools; it does not replace them.
- **Not an in-product approval workflow.** PR review in GitHub/GitLab/Bitbucket is superior — already integrated into team process with audit trails, branch protection, and approval requirements.
- **Not a real-time collaborative editor.** Would require CRDTs and a fundamentally different architecture. Interrupt and resume with shareable session URLs is the right level for sequential Q&A.
- **Not a project manager.** No issue tracking, no boards, no tickets. Integrations with project-management tools are consumers of generated configs, not features of the wizard.
- **Not a database-backed application by default.** Zero-persistence is the default. Persistence is explicitly opt-in.
- **Not multi-user by default.** The wizard is a single-user flow. Multi-workspace SaaS is a trigger-gated future horizon.
- **Not format-locked to any one agent.** Today's output is Claude-Code-focused; the architecture is agent-agnostic and v3.1 delivers multi-agent generation as the primary strategic capability.

---

## Success Measures

EmbedIQ is successful when:

1. **Developers use what the wizard generates.** Invoking generated slash commands, using generated agents, following generated `CLAUDE.md` / `AGENTS.md` conventions — if these feel like someone else's boilerplate, the product has failed. If they feel like configuration the user would have written themselves given infinite time, the product has succeeded.
2. **Compliance teams trust what the wizard generates.** If audit logs, DLP patterns, and permission rules survive a regulatory review without rework, the product has succeeded. If compliance officers have to patch the output to be defensible, the product has failed.
3. **Non-technical users find their AI coding agent genuinely useful as a coworker.** A BA running the wizard and getting a dev-focused setup with hooks and agents they cannot understand is a product failure. A BA getting role-specific guidelines that match how they actually work is a product success.
4. **Teams using multiple agents maintain one answer set.** A team running Claude Code on some projects and Cursor on others should answer the wizard once and get both harnesses in sync. If teams maintain separate configurations per agent after v3.1, the product has failed on its core multi-agent promise.
5. **The generated setup stays current.** When compliance requirements change, when a new domain pack or skill ships, when team structure evolves — regenerating should be a single command, and the diff should be reviewable in a PR that the team trusts.
6. **Quality is provable, not promised.** When a prospect asks "how do I know this is good?", the answer is an evaluation score, not a trust-me pitch. When a competitor claims superiority, the evaluation harness says "prove it" with the same golden configs.

---

## Guardrails

These are decisions we protect against feature creep.

- **Zero-persistence default.** Never weaken. Server-side sessions ship with `EMBEDIQ_SESSION_BACKEND=none` as the default.
- **No required external service.** EmbedIQ must run in an air-gapped environment with zero network calls. Every external integration (OIDC, OTel collector, git platform, webhook endpoint, compliance platform, LLM provider) is optional.
- **No required LLM.** The deterministic baseline must remain fully functional without any LLM dependency, forever. AI features are opt-in supplements gated on evaluation evidence.
- **Three-layer independence.** Questions, engine, and synthesizer must stay separable. Multi-agent output targeting is purely a Synthesizer concern.
- **Type safety over data files.** Questions stay in TypeScript. External configuration (templates, domain packs, skills) is opt-in for extension, never replaces the typed core.
- **Role-adaptive output.** Role must remain a first-class input across every layer.
- **Outputs feed collaboration; they do not replace it.** EmbedIQ does not build in-product approvals, boards, or real-time editors.
- **Evaluation gates AI enhancement.** AI-enhanced output must score higher than the deterministic baseline to be applied. This gate protects the determinism brand and prevents AI from silently degrading quality.

---

## Positioning

**EmbedIQ is to AI coding agents what a good platform team is to a developer — it handles the setup decisions so the engineer can focus on the work.**

The product is not trying to be the flashiest AI tool in the category. It is trying to be the most trustworthy. It runs locally. It does not send your answers to third parties. It produces configs you can read, diff, and audit. It adapts to who you are and what you are building. It generates for every agent your team uses, from a single interview. When you regenerate in six months, the output reflects the world you live in then, not the world of the AI model that generated it.

The vision is a future where setting up an AI coding agent for a regulated healthcare team is not harder than setting it up for a solo weekend project — because in both cases, you answer the questions, and the right configuration comes out. For every agent the team uses.

---

*For implementation detail, see [`architecture/overview.md`](architecture/overview.md). For usage, see [`getting-started.md`](getting-started.md) or the per-feature [`user-guide/`](user-guide/). For shipped-feature history, see [`../CHANGELOG.md`](../CHANGELOG.md).*
