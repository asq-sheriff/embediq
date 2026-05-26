<!-- audience: public -->

# EmbedIQ — Objection-Handling FAQ

The fifteen questions that come up most often when an evaluator looks at EmbedIQ for the first time. Crisp answers, no hedging.

## 1. Is this just a wrapper around Claude Code's `/init`?

No. `/init` produces a developer-friendly `CLAUDE.md`. EmbedIQ produces a compliance-aware harness across **sixteen target formats** (Claude Code, Cursor, Copilot, Gemini, Windsurf, AGENTS.md, plus four local-AI integrations, plus an industry-agnostic RAG scaffold, plus a PHI-safe local router, plus four governance output targets), plus a per-agent `SETUP.md` install guide, plus an OSCAL evidence package, plus a CycloneDX-ML AIBOM, plus a per-file provenance trace, plus an optional tamper-evident audit chain. **Twenty-eight parallel generators across sixteen target formats.**

The right comparison is not `/init` versus EmbedIQ. It is "a quick-start developer aid" versus "an audit-defensible configuration system."

## 2. Why not just LLM-generate the configuration?

Because auditors cannot reproduce non-deterministic output. If an LLM produces a slightly different rule file each time, the artifact that was audited last quarter does not match the artifact running today. EmbedIQ's defining property is that **the same wizard answers always produce the same harness, byte-for-byte.** That property is what makes the OSCAL evidence package defensible.

We are not against AI-augmented generation — it is on the v4.x roadmap as an opt-in enhancement layer that runs after the deterministic generator and is score-gated against the deterministic baseline. The deterministic core stays the system of record.

## 3. Will my auditor actually accept OSCAL?

The major audit pipeline platforms — Drata, Vanta — already ingest OSCAL. The FedRAMP PMO publishes baselines in OSCAL JSON. NIST publishes 800-53 catalogs in OSCAL JSON. The CISA AI-supply-chain working groups are converging on CycloneDX-ML.

The honest scope boundary: EmbedIQ produces the **developer-side artifact** in OSCAL form. The auditor still needs the operator's authorization-boundary documentation, network architecture, data-flow diagrams, and incident-response plan. We mark the SSP we emit as `document-completion-status=fragment` so the auditor knows it is a starter, not a substitute. That clarity helps the conversation.

## 4. Where does my data go? Is anything sent to a third-party AI service?

By default, nothing leaves your machine. The wizard runs locally. Answers exist only in volatile memory and never persist to disk except where the operator explicitly opts into the encrypted session store. There is no telemetry, no analytics, no phone-home, no usage reporting.

If you enable the optional local-AI integration, prompts route through Ollama on your own infrastructure. If you enable the PHI-safe local router, it tries the local model first and only escalates to a hosted model when local cannot answer and the prompt has been redacted of PHI patterns.

## 5. What about hosted EmbedIQ — is there a SaaS offering?

Multi-tenant hosted SaaS is in planning, not shipped. The roadmap explicitly defers it until the v4.0 governance work is in market, commercial validation lands, and the architectural prerequisites are met. For now: self-hosted only, MIT licensed, runs in your infrastructure.

For federal data, self-hosted will remain the recommended posture indefinitely.

## 6. How does this differ from Drata or Vanta?

Drata and Vanta manage your compliance posture at the policy level — they collect evidence from many sources and present it to auditors. EmbedIQ produces the developer-side evidence those platforms ingest. The OSCAL component-definition EmbedIQ emits is designed to drop directly into Drata or Vanta.

We are upstream of GRC platforms, not a competitor to them.

## 7. What is the licensing model?

The core is MIT. Free to use, free to modify, free to self-host, free for unlimited engagements, free for commercial use. No copyleft, no attribution requirement beyond the standard MIT notice, no usage cap.

Praglogic offers paid professional services on top: custom domain packs, GRC platform integration, audit support, partner-led adoption.

## 8. How long does adoption take?

For a single team, the practical timeline is one to four weeks:

- Hour 1: Clone the repo, run the wizard, look at the output.
- Day 1-2: Pick a target team, run the wizard against their repo, review with the compliance lead.
- Week 1: Drop the harness into a feature branch, have engineers work against it for one sprint.
- Week 2-4: Generate the OSCAL evidence, submit to your audit pipeline, decide whether to roll out wider.

For a multi-team or multi-engagement rollout: 60 to 90 days for full standardization with autopilot drift detection in place.

## 9. What is the runtime story for production?

Two paths:

- **Single-team local**: CLI wizard, no infrastructure. Run on the developer's machine.
- **Multi-team self-hosted**: Express server, Postgres-backed session store (multi-node ready), Postgres-backed autopilot scheduler (multi-replica safe), four pluggable auth strategies (HTTP Basic, OIDC, reverse-proxy headers, demo), three-tier RBAC, optional TLS, optional OpenTelemetry instrumentation. Health and readiness endpoints. Docker image and docker-compose example shipped.

Operating an EmbedIQ web deployment is a normal Postgres-backed Node service — nothing exotic.

## 10. What happens when our compliance policies change?

Three patterns:

- **Wizard-level**: re-run the wizard with updated answers, regenerate the harness. Deterministic — only the changed surfaces move.
- **Drift-detection-level**: schedule autopilot to scan the target project. If a rule has been hand-edited or a file is missing, autopilot flags it and optionally opens a PR.
- **Policy-document-level**: the roadmap includes RAG over enterprise policy documents to auto-fill the wizard. Not shipped yet; expected in v4.x.

In all three cases the answer is "regenerate and diff" — never "manually edit."

## 11. Can I write my own compliance pack?

Yes. Three layers of extensibility:

- **Domain pack** — drop a `.js` or `.mjs` file in the `plugins/` directory implementing the `DomainPack` interface. Auto-loaded at startup. Five-minute work.
- **Skill** — drop a `SKILL.md` file (frontmatter plus body) plus optional `dlp.yaml`, `compliance.yaml`, `rules/*.md`, `ignore.txt` under your skills directory. Composable with built-in packs.
- **OSCAL profile import** — point EmbedIQ at your own NIST OSCAL profile JSON and the framework gets resolved into the domain pack registry. No code changes required.

## 12. How do I know it is actually deterministic?

Run it twice with the same answers. Diff the output. There should be no difference.

We back this up with the evaluation harness: `make evaluate` replays 19 recorded answer sets through the full pipeline and scores generated output against golden references. CI fails if the score drops below the threshold. The golden-config tests at the repo level enforce byte-identical regeneration for every archetype.

## 13. What is your roadmap visibility like?

The public repo carries `CHANGELOG.md` (full release history) and the v4.0-shipped status in the README. Granular feature roadmap items are tracked privately (we ship to MIT, but plan in a private repo to avoid the "marketing your roadmap" problem).

The big picture: v4.0 Enterprise AI Governance Foundation is shipped. v4.1 will add a Provider Abstraction Layer plus an Enterprise AI Policy Pack plus policy-document RAG. v4.2 will add Self-Hosted Multi-Workspace. v4.3 will add AI-Augmented Generation, opt-in and score-gated.

## 14. How should we calculate ROI for this?

Build a worksheet around the four cost lines EmbedIQ moves:

- **Time to onboard a new engineer to an AI agent setup.** Today: hours to days of trial-and-error. With EmbedIQ: ten-minute wizard. Multiply by your engineer rotation rate.
- **Time to produce audit evidence on demand.** Today: weeks of spreadsheet work plus pulling screenshots. With EmbedIQ: re-run the wizard, hand over the OSCAL package. Multiply by your audit-cycle frequency.
- **Compliance incident risk reduction.** PHI-pattern DLP at the prompt level is harder to quantify but is the bar your insurer and your client MSAs are starting to require. The cost line is "what does a single PHI-disclosure incident cost?"
- **Drift detection.** Today: configuration rots until the next audit catches it. With EmbedIQ: autopilot flags drift within hours. The cost line is "the difference between catching drift at week one versus quarter one."

We do not publish a generic ROI number because the inputs vary wildly across organizations. We will gladly help build the worksheet for your specific situation — that conversation usually surfaces other constraints worth knowing about.

## 15. What if we want to integrate this with our existing tooling?

The integration surface is open:

- **Inbound webhooks**: built-in adapters for Drata, Vanta, and a generic JSON adapter. Trigger autopilot runs from compliance events.
- **Outbound webhooks**: subscribers for Slack and Microsoft Teams (auto-detected) plus a generic JSON envelope. Configurable per-URL event filters.
- **Git integration**: GitHub adapter shipped; the interface is platform-agnostic so GitLab and Bitbucket follow naturally.
- **OpenTelemetry**: traces and metrics behind a single env var. OTLP export compatible with Jaeger, Grafana, Datadog, or any OTLP collector.
- **Custom auth**: implement the `AuthStrategy` interface; the three built-in strategies (Basic, OIDC, header) are reference implementations.

Most prospects find the integration they need already exists. When it doesn't, the extension points are documented and small.

## See also

- [`EXECUTIVE-BRIEF.md`](EXECUTIVE-BRIEF.md) — the leave-behind document.
- [`DEMO-SCRIPT.md`](DEMO-SCRIPT.md) — the live-demo talk track.
- [`persona-healthcare-bpo.md`](persona-healthcare-bpo.md), [`persona-federal-contractor.md`](persona-federal-contractor.md), [`persona-consulting-firm.md`](persona-consulting-firm.md) — per-persona briefs.
- [`../evaluators/competitive-comparison.md`](../evaluators/competitive-comparison.md) — competitive methodology.
- [`../evaluators/security-model.md`](../evaluators/security-model.md) — security-model document for evaluators.
