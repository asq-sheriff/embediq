<!-- audience: public -->

# Competitive comparison

A capability-level comparison of EmbedIQ against the tools evaluators
most frequently ask about. The framing here is deliberately
descriptive, not rhetorical — if a tool doesn't ship a capability
it's a blank cell, not a criticism, and if a tool ships something
EmbedIQ doesn't, we say so.

Pair this with [evaluation-methodology.md](evaluation-methodology.md)
to run quantitative benchmarks rather than relying on feature
matrices alone.

## Scope — what the tools are actually for

| Tool | Scope |
|---|---|
| **EmbedIQ** | Generates a production-ready AI coding agent harness from an adaptive Q&A — across Claude Code, Cursor, Copilot, Gemini, Windsurf, and `AGENTS.md` — with compliance-aware output. |
| **Claude Code `/init`** | Built-in Anthropic command that asks a small number of questions and produces a `CLAUDE.md` (+ some basic settings) for a repo you're already in. |
| **GitHub Spec Kit** | Spec-first workflow tool — describes *what to build* in a structured spec before implementation. Not primarily a config-generation tool. |
| **AWS Kiro** | AWS's agent IDE with "steering rules" that live in Kiro proprietary format. |
| **Agent Rules Builder** | Community / shallow generator producing a single markdown rules file from a small set of inputs. |
| **Rulesync** | Format-conversion utility — translates rules from one agent's format to another's. Not a generator. |

The tools occupy different layers. EmbedIQ is the only one whose
primary purpose is "generate a complete, compliance-aware agent
harness from a long-form interview."

## Feature matrix

Legend: ● full support, ◐ partial, ○ not supported, — not applicable.

| Capability | EmbedIQ | Claude `/init` | Spec Kit | Kiro | Agent Rules Builder | Rulesync |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Adaptive Q&A with branching | ● (71 q, 40 branches) | ◐ (few Qs) | ● (different purpose — spec interview) | ○ | ○ | — |
| Role adaptation (dev / BA / PM / exec / …) | ● (8 roles) | ○ | ○ | ○ | ○ | — |
| Multi-agent output from one interview | ● (6 target families) | ○ (Claude only) | ○ | ○ (Kiro only) | ● (one flat file) | — |
| Compliance-aware DLP enforcement | ● (Python hooks, 18+ patterns) | ○ | ○ | ◐ (via AWS services) | ○ | — |
| Rule templates per compliance framework | ● | ○ | ○ | ○ | ○ | — |
| Post-generation compliance validation | ● (13 built-in checks) | ○ | ○ | ○ | ○ | — |
| Domain packs (extensible) | ● (3 built-in + plugins) | ○ | ○ | ○ | ○ | — |
| Composable skills | ● | ○ | ○ | ○ | ○ | — |
| Configuration templates (org baselines) | ● | ○ | ○ | ○ | ○ | — |
| Multi-stakeholder session resume | ● (URL + contributor attribution) | ○ | ● (spec collaboration) | ◐ | ○ | — |
| Deterministic output | ● | ○ (LLM-based) | ○ (LLM-based) | ○ (LLM-based) | ● | ● |
| Evaluation framework (golden-config replay) | ● | ○ | ○ | ○ | ○ | — |
| Drift detection | ● | ○ | ○ | ○ | ○ | — |
| Scheduled regeneration / autopilot | ● | ○ | ○ | ○ | ○ | — |
| Git PR integration (opens PR with output) | ● (GitHub; GitLab/Bitbucket planned) | ○ | ● | ○ | ○ | — |
| Inbound compliance webhooks (Drata, Vanta) | ● | ○ | ○ | ○ | ○ | — |
| Outbound notifications (Slack / Teams) | ● | ○ | ○ | ◐ | ○ | — |
| Web UI + REST API | ● | ○ | ○ | ● (own IDE) | ◐ | — |
| CLI | ● | ● | ● | ● | ● | ● |
| Self-hosted / on-premise | ● | ◐ (Claude Code client-side but LLM is cloud) | ◐ | ○ | ● | ● |
| MIT license | ● | ○ (proprietary) | ● | ○ | varies | ● |

## Deployment-model matrix

| Model | EmbedIQ | Claude `/init` | Spec Kit | Kiro | Agent Rules Builder |
|---|:-:|:-:|:-:|:-:|:-:|
| Local CLI | ● | ● | ● | ○ | ● |
| Self-hosted web | ● | ○ | ○ | ○ | ◐ |
| Docker / Kubernetes | ● | ○ | ○ | ○ | ○ |
| Fully cloud-hosted SaaS | ○ | ● | ● | ● | ◐ |
| Air-gapped | ● | ○ | ○ | ○ | ● |

EmbedIQ is the only tool in the comparison set that ships a
self-hostable, air-gap-compatible web interface.

## Determinism / reproducibility matrix

This is the most compliance-sensitive axis. LLM-powered tools cannot
claim byte-identical reproducibility today.

| Property | EmbedIQ | Claude `/init` | Spec Kit | Kiro | Agent Rules Builder |
|---|:-:|:-:|:-:|:-:|:-:|
| Same input → byte-identical output | ● | ○ | ○ | ○ | ● |
| Output stamped with generator version + timestamp | ● | ○ | ○ | ○ | ◐ |
| Drift detectable against a saved baseline | ● | ○ | ○ | ○ | ◐ |
| Reproducible across releases | ● (by SemVer) | ○ | ○ | ○ | varies |

For auditors this is the headline: EmbedIQ's determinism is an
architectural property, not a promise.

## Compliance / regulatory positioning

| Capability | EmbedIQ | Claude `/init` | Spec Kit | Kiro | Agent Rules Builder |
|---|:-:|:-:|:-:|:-:|:-:|
| HIPAA-focused DLP | ● | ○ | ○ | ○ | ○ |
| PCI-DSS-focused DLP | ● | ○ | ○ | ○ | ○ |
| FERPA-focused DLP | ● | ○ | ○ | ○ | ○ |
| SOC2 / SOX / GLBA rule templates | ◐ (SOC2 template; SOX/GLBA framework registration) | ○ | ○ | ◐ | ○ |
| Generated audit-log hook | ● | ○ | ○ | ○ | ○ |
| Validation rejects output missing required DLP patterns | ● | ○ | ○ | ○ | ○ |
| Inbound webhook from compliance platforms | ● (Drata, Vanta, generic) | ○ | ○ | ○ | ○ |

## Extensibility

| Surface | EmbedIQ | Claude `/init` | Spec Kit | Kiro | Agent Rules Builder |
|---|:-:|:-:|:-:|:-:|:-:|
| Add wizard questions without forking | ● (plugins + skills) | ○ | ○ | ○ | ○ |
| Add DLP patterns | ● | ○ | ○ | ○ | ○ |
| Add rule templates | ● | ○ | ○ | ◐ | ◐ |
| Add post-generation validators | ● | ○ | ○ | ○ | ○ |
| Add org-specific templates | ● | ○ | ○ | ○ | ○ |
| Add custom webhook formatters / adapters | ● | ○ | ○ | ○ | ○ |

## Observability / audit

| Capability | EmbedIQ | Claude `/init` | Spec Kit | Kiro | Agent Rules Builder |
|---|:-:|:-:|:-:|:-:|:-:|
| JSONL audit log | ● | ○ | ○ | ○ | ○ |
| OpenTelemetry traces + metrics | ● | ○ | ○ | ○ | ○ |
| Event bus for integrations | ● | ○ | ○ | ○ | ○ |
| Self-benchmark harness | ● | ○ | ○ | ○ | ○ |

## How to read this

Three calibration points for reading the matrix above:

1. **Different layers of the stack.** EmbedIQ and Claude `/init` are
   direct competitors on "generate agent config from an interview."
   Spec Kit and Kiro operate one layer up or in adjacent workflows
   — a team can use both EmbedIQ and Spec Kit together.
2. **Scope vs. depth.** Claude `/init` is narrower by design — it's
   a two-minute onboarding flow, not a compliance-aware configuration
   tool. A matrix showing `/init` with many `○` cells is describing
   scope, not quality. Pick the tool that matches your scope.
3. **Architecture as product.** The determinism, air-gap
   compatibility, and zero-persistence rows aren't bullet points that
   can be added in a sprint. They're architectural properties that
   drive the tool's entire design. That's where EmbedIQ's
   differentiation is most durable.

## Intended selection criteria

| If you need… | Pick |
|---|---|
| Anthropic-native setup in 2 minutes, Claude Code only, no compliance | Claude `/init` |
| A long-form interview producing compliance-aware config across multiple agents | EmbedIQ |
| Spec-first development (describe what to build, then implement) | Spec Kit + EmbedIQ for the agent config |
| AWS-native agent IDE with AWS compliance tooling in the cloud | Kiro |
| One flat `.cursorrules`-style file from a small input | Agent Rules Builder |
| Translating existing rules from one agent format to another | Rulesync |
| Compliance-heavy, air-gapped deployment with determinism requirements | EmbedIQ (no alternative ships all three properties) |

## Benchmarking

Quantitative comparison is the honest rebuttal to a feature matrix.
Run `npm run benchmark` with any competing tool's output as the
candidate and publish the results — the procedure in
[evaluation-methodology.md](evaluation-methodology.md) is
reproducible by any evaluator.

## See also

- [Evaluation methodology](evaluation-methodology.md)
- [Security model](security-model.md)
- [Threat coverage](threat-coverage.md)
- [Getting started](../getting-started.md) — try EmbedIQ for a
  direct comparison
