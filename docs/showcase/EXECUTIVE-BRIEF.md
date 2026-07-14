<!-- audience: public -->

# EmbedIQ — Executive Brief

**Your AI coding agents are usually careful. EmbedIQ makes them *governed* — your compliance policy enforced at the source, verified in your CI, and evidenced for your auditor.**

Production AI coding agents — Claude Code, Cursor, GitHub Copilot, Gemini, Windsurf — are now embedded in every regulated engineering team. The models are capable and, most of the time, careful. But "most of the time" is not a compliance posture, and "we trust the tool to behave" is not an answer an auditor accepts. EmbedIQ turns your compliance policy into **enforced controls** around those agents, and produces the **machine-readable proof** that the controls actually fire.

## Why now

Three forces converged in the last twelve months:

- **Federal pressure** — NIST AI RMF 1.0, the AI 600-1 Generative AI Profile, and the OMB M-24-10 AI memo all require AI governance posture, supply-chain transparency, and continuous monitoring for any federal use of generative AI.
- **Audit pressure** — SOC 2, HIPAA, PCI-DSS, and ISO 27001 auditors are starting to ask "which AI tools touch this codebase, what data can flow to them, and how do you *prove* the guardrails are enforced and haven't drifted?"
- **Procurement pressure** — Drata and Vanta now expect OSCAL-formatted evidence. CycloneDX-ML is becoming the AI supply-chain standard.

Most regulated teams answer those questions today with spreadsheets, screenshots, and "the developers are careful." That does not survive the next audit cycle.

## What EmbedIQ is

EmbedIQ is the layer that converts *"we trust the model to behave"* into *"we enforce our policy and can prove it."* From a ten-minute interview it produces three things, in priority order:

1. **Enforced controls — the guarantee.** Guardrails that *refuse* the wrong action at the source, not guidance that hopes the model complies: a pre-tool hook that **blocks** a write containing regulated data (PHI, PAN, secrets) before it happens; an egress policy so regulated prompts **cannot** reach a destination you have no BAA/DPA for; permission floors and sandbox isolation.
2. **Proof — the artifact that ends the audit conversation.** A CI gate that **fails the build** when the policy is violated ("zero regulated prompts reach an uncovered destination, run against *your* policy"), plus machine-readable evidence: OSCAL component-definition and SSP fragment, a CycloneDX-ML AIBOM, per-file provenance, and a tamper-evident RFC-6962-style audit chain with a `verify-audit-log` CLI.
3. **Governance — so it stays true.** Drift detection, scheduled re-scans, and Drata/Vanta webhooks, so a control that someone weakens is caught rather than silently eroding.

The agent configuration itself (the `.claude/`, `.cursor/`, Copilot files) is how those controls are *delivered* — it is the mechanism, not the headline. The headline is the passing CI gate and the evidence bundle.

## Where EmbedIQ sits — the gap nobody else fills

| Layer | Who provides it | What they do *not* do |
|---|---|---|
| The model | Anthropic, OpenAI | Make it careful — but carefulness is not a control, and not under *your* policy |
| The agent | Claude Code, Cursor, Copilot | Make it capable — not enforce your compliance rules |
| Routing | LiteLLM, Portkey | Reach the model — not restrict *which* model may see regulated data |
| Delivery | Intune, Jamf | Push configs to machines — not decide what the config must enforce |
| GRC | Drata, Vanta | Track controls — not enforce them in the developer's tooling, or produce the AI-specific evidence |

**None of them enforce your specific policy at the agent, and none of them prove to your auditor that your agents are governed.** That gap is EmbedIQ's territory.

## Who it is for

The buyer is the **compliance officer or security owner**, not the developer.

- **Regulated healthcare** — HIPAA-covered developer teams, healthcare BPOs adopting Claude Code at scale.
- **Financial services** — PCI-DSS, SOX, and GLBA developer environments.
- **Federal contractors** — FedRAMP authorization candidates and agency teams adopting GenAI under OMB M-24-10.
- **Consulting firms** — standardizing enforced AI-agent governance across multiple regulated client engagements.
- **Education** — FERPA and COPPA developer environments.

## What you get from one interview

| Artifact | Enforce / Prove / Govern | What it does |
|---|---|---|
| `.claude/hooks/` DLP + command guards | **Enforce** | Pre-tool hooks that *refuse* (exit 2) a write containing regulated data or a dangerous command — deterministically, every time. |
| Egress routing policy + eligibility gate | **Enforce / Prove** | Regulated data classes are eligible only for BAA-covered destinations; a CI mode fails the build if any could reach an uncovered one. |
| `.embediq/oscal/*.json` | **Prove** | Product-level compliance claim + per-deployment SSP starter. Drop into Drata or Vanta. |
| `.embediq/cyclonedx/aibom.json` | **Prove** | CycloneDX-ML bill of materials for every AI component the harness uses. |
| `.embediq/provenance/manifest.json` | **Prove** | Per-file traceability — which generator, target, domain pack, and skill produced each control. |
| `audit.jsonl` (chained) + `verify-audit-log` | **Prove / Govern** | RFC-6962-style tamper-evident log; CLI returns exit 0 / 1 / 2 for CI. |
| Drift detection + autopilot | **Govern** | Catches a hand-weakened control before the next audit does. |

## What makes it defensible

The moat is **"prove it," not "generate it."** Config generation is increasingly a commodity — several tools emit agent configs, and generated config does not, on its own, make a capable agent measurably safer (it's already careful). What no other tool provides is the **enforced, verified control**:

| Alternative | Gap EmbedIQ closes |
|---|---|
| Claude Code `/init`, config generators | Emit guidance the agent *may* follow. EmbedIQ emits guardrails that *refuse*, and proves they fire. |
| Hand-authored configs | Drift within weeks, no traceability, no proof. Audit-hostile. |
| GRC platforms (Drata, Vanta) | Manage policy, not developer tooling. EmbedIQ produces the enforcement *and* the evidence they ingest. |
| LLM-generated configs | Non-deterministic — the auditor cannot reproduce the exact artifact that was audited. |

**The defining property is verifiable enforcement:** the control *refuses* at the source, a CI gate *proves* it against your policy, and drift detection keeps it from eroding. Determinism supports this — reproducible evidence and reliable drift detection — but it is the foundation, not the pitch. No competing tool enforces your policy in the agent *and* hands your auditor the proof.

## Where it runs

- **Local** — CLI, MIT-licensed, no network calls required, answers never leave memory.
- **Self-hosted web** — Express server, four pluggable auth strategies (Basic / OIDC / reverse-proxy header / demo), three-tier RBAC, Postgres-backed sessions for multi-node deployment, optional TLS.
- **Air-gapped** — local-AI integration (Ollama) for organizations that cannot send code or prompts to hosted APIs; the routing policy can be compiled with zero external destinations — local-only by construction, verifiable by reading the config.
- **Continuous** — autopilot scheduler (cron- or webhook-triggered) re-scans target projects, detects drift, and can open pull requests automatically.

## Commercial model

- **Open source core** — MIT licensed. Runs locally or in your private infrastructure. No vendor lock-in.
- **Hosted offerings** — in planning. Multi-tenant SaaS for organizations that want managed deployment.
- **Professional services** — available through Praglogic for healthcare BPOs, consulting firms, and federal contractors who need custom domain packs, GRC integration, or audit support.

## How to engage

1. **Evaluate** — `git clone https://github.com/asq-sheriff/embediq`, `make start`, walk the interview against one of your projects (~15 minutes), and run the enforcement + eligibility checks.
2. **Pilot** — pick one regulated engineering team. Generate the enforced controls plus the evidence package. Drop them into the team's repo on a feature branch, wire the CI gates, and submit the OSCAL output to your audit pipeline.
3. **Scale** — standardize across teams, turn on autopilot drift detection, connect Drata/Vanta webhooks, and wire the audit-chain verifier into CI.

---

**Source:** [github.com/asq-sheriff/embediq](https://github.com/asq-sheriff/embediq) (MIT) · **Vendor:** [praglogic.com](https://praglogic.com)
