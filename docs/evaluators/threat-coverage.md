<!-- audience: public -->

# Threat coverage

Six classes of threat every AI coding agent configuration tool has to
reckon with, and where EmbedIQ stands on each. Evaluators and
security reviewers frequently ask these questions in different shapes;
this doc gives one paragraph per threat with concrete mitigations and
honest acknowledgment of gaps.

For the architectural guarantees underpinning these answers, see
[security-model.md](security-model.md). For the narrow threat model
(primitives, keys, disclosure process), see
[SECURITY.md](../../SECURITY.md).

## T1 — The underlying coding agent ships its own configuration tooling

Native tooling from the agent vendor (e.g. built-in "initialize
repo" flows) will always know the configuration surface best. If
that flow becomes "smart enough" for 80% of users, a third-party
wizard has to justify its existence for the remaining 20% plus the
regulatory long tail.

**EmbedIQ's position.**

- **Deterministic output + reproducible audit.** Vendor tooling that
  uses an LLM for configuration generation cannot produce the
  byte-identical, stamped output that auditors demand.
- **Role adaptation.** EmbedIQ's eight-role differentiation
  (developer, DevOps, lead, BA, PM, executive, QA, data) is a
  category vendor tooling doesn't usually target — they optimize for
  developers.
- **Multi-agent by design.** Vendor tooling configures its own
  agent. EmbedIQ's multi-target generator (Claude, Cursor, Copilot,
  Gemini, Windsurf, AGENTS.md from one interview) serves teams that
  use more than one agent.
- **Evaluation framework.** `npm run evaluate` + `npm run benchmark`
  let operators score any tool's output against golden references.
  Vendor tooling can't easily self-score against a neutral baseline.

**Remaining risk.** If vendor tooling improves dramatically for the
solo-developer baseline case, the marginal value of EmbedIQ for that
user shrinks. The enterprise-specific features (compliance,
multi-agent, audit) hold regardless.

## T2 — Generic spec / prompt tooling extends into configuration

Tools operating one layer up (spec-driven workflows like GitHub Spec
Kit, AWS Kiro) could extend their flows to emit agent config as a
byproduct.

**EmbedIQ's position.**

- **Role adaptation.** Spec-first tools target developers. They have
  no concept of a BA or PM flow.
- **Compliance depth.** EmbedIQ ships Python DLP scanners, audit
  hooks, and compliance rule templates — actual enforcement
  infrastructure, not advisory documentation.
- **Determinism.** Spec-driven tools tend to be LLM-powered for
  flexibility. That trades reproducibility for adaptability; EmbedIQ
  declines that trade.

**Remaining risk.** For teams that already run a spec-driven workflow
and only need lightweight agent config, spec-tool integration may
win on convenience. EmbedIQ and those tools are sequential in the
developer workflow, not competitive — run EmbedIQ once for the
baseline harness, run the spec tool per-feature.

## T3 — Cloud-native compliance tooling adds config generation

Major cloud vendors (AWS, Azure, GCP) ship compliance-aware services
that could layer config generation on top. Their compliance rigor
and enterprise distribution are formidable.

**EmbedIQ's position.**

- **Air-gap compatibility.** Cloud-native tooling requires internet
  connectivity by design. Healthcare organizations with strict data
  governance, financial institutions with residency requirements,
  and government agencies with air-gap mandates cannot adopt
  cloud-only tooling. EmbedIQ runs locally with zero required
  outbound traffic.
- **Multi-cloud + multi-agent positioning.** Cloud-native tooling
  generates for the vendor's own services. EmbedIQ is vendor-
  neutral; it configures any of six agent families from one
  interview.
- **No data leaves the process.** Wizard answers never touch cloud
  services; the generated output lands on disk and stays there.

**Remaining risk.** For organizations that are already fully
committed to a single cloud with that cloud's compliance tooling,
EmbedIQ competes on vendor neutrality — a weaker pitch than "you
can't use the alternative." Decline to compete in the "AWS-native"
segment; own "multi-cloud, multi-agent, vendor-neutral."

## T4 — Universal agent format consolidation

The `AGENTS.md` consensus could make per-agent config files
(`.cursorrules`, Copilot's `copilot-instructions.md`, etc.) less
valuable over time.

**EmbedIQ's position.**

- **AGENTS.md first.** EmbedIQ already generates `AGENTS.md` as the
  shared universal file. If the ecosystem fully consolidates, the
  target filter `EMBEDIQ_OUTPUT_TARGETS=agents-md` captures that.
- **Tool-specific deep features.** Claude Code hooks, Cursor's
  MDC-scoped `globs`, Copilot's `applyTo`, Gemini CLI's project
  context — none of these are expressible in `AGENTS.md` alone.
  Teams who use those features need the tool-specific files and
  will keep using them.
- **Evaluation-driven deprecation.** If the evaluation framework
  shows a tool-specific generator stops adding quality above the
  `AGENTS.md` baseline, that data is the deprecation signal.

**Remaining risk.** Low. Consolidation on `AGENTS.md` would simplify
the synthesizer but wouldn't invalidate EmbedIQ's role (producing
the right content from an interview).

## T5 — Niche "compliance pack" generators

Shallow config generators could add "HIPAA rules pack" or "PCI-DSS
rules pack" templates and capture the compliance-aware but
wizard-averse segment.

**EmbedIQ's position.**

- **Depth.** EmbedIQ's compliance implementation is enforcement
  infrastructure — Python DLP scanners detecting specific formats,
  validation checks that reject non-compliant output, hooks that
  block tool invocations at match time. A compliance "template" in
  a shallow generator is advisory markdown.
- **Role + industry + technical-stack awareness.** "HIPAA" means
  different things for a HIPAA-covered SaaS developer than for a
  HIPAA BAA signing a third-party tool. EmbedIQ's adaptive Q&A
  surfaces those differences; a template flattens them.

**Remaining risk.** For teams whose "compliance" is "generally
careful" rather than "regulatory obligation," a template in a
shallow generator may genuinely suffice. EmbedIQ shouldn't compete
here — the adaptive engine should branch aggressively to exit early
for minimal-compliance profiles, making the wizard faster rather
than forcing all users through the full flow.

## T6 — A well-resourced cloud-native LLM-powered competitor

A funded startup could build a "smart" cloud-native wizard with a
polished UI, free tier, and aggressive developer relations.

**EmbedIQ's position.**

- **Determinism.** LLM-powered generation is non-reproducible. For
  audit purposes in HIPAA, PCI-DSS, and SOX environments that's
  disqualifying — the competitor would need to solve determinism to
  compete in regulated industries, which undercuts their LLM-powered
  differentiator.
- **Air-gap.** A cloud-native competitor has the same
  reachability constraint as T3.
- **Ecosystem potential.** Composable skills (`EMBEDIQ_SKILLS_DIR`)
  create a network-effect surface — once an org encodes institutional
  guardrails as skills, switching costs go up. A competitor needs
  not just a better tool but a better ecosystem.

**Remaining risk.** Acknowledged. UX + distribution advantages can
win go-to-market even against superior technology. The response is
to match on distribution (CLI, web, Docker, K8s — already there)
and keep the quality-per-interview bar high (evaluation framework).
If a competitor with superior UX starts gaining traction in the
non-regulated segment, a lightweight "quick mode" (5 questions, <2
minutes) alongside the full wizard is the intended response.

## Framework-by-framework compliance coverage

| Framework | Built-in DLP | Rule templates | Validation checks | Notes |
|---|---|---|---|---|
| **HIPAA** | MRN, HPBN, ICD-10+context, DEA, NPI, FHIR Patient IDs | `hipaa-phi-handling.md` (path-scoped to `src/`, `lib/`, `app/`) | MRN presence, DEA presence, PHI handling rule, audit logging, patient data in `.claudeignore` | Healthcare domain pack. |
| **HITECH** | (uses HIPAA DLP) | `hitech-breach-notification.md` | — | Healthcare pack. |
| **42 CFR Part 2** | (uses HIPAA DLP) | — | — | Healthcare pack — framework registration only. |
| **PCI-DSS** | PAN, CVV, ABA, SWIFT/BIC, IBAN, EIN | `pci-dss-cardholder.md` | CVV storage forbidden, PAN masking rule | Finance domain pack. |
| **SOX** | — | — | — | Finance pack — framework registration only. |
| **GLBA / AML-BSA / FINRA** | — | — | — | Finance pack — framework registration only. |
| **FERPA** | student identifiers | `ferpa-student-records.md` | — | Education domain pack. |
| **COPPA** | — | `coppa-children-privacy.md` | — | Education pack. |
| **SOC 2** | — | — | — | Shipped as a profile template (`soc2-saas.yaml`). |
| **GDPR** | — | — | Universal DLP check | Covered by the universal validator, not a dedicated pack. |
| **ISO 27001** | — | — | — | Adapter-normalized identifier only (no dedicated pack yet). |

Gaps here are feature gaps, not architectural gaps — adding a pack
follows the pattern in
[extension-guide/writing-domain-packs.md](../extension-guide/writing-domain-packs.md).

## Acknowledged vulnerabilities

Tracked internally with explicit triggers that would prompt
investment:

- **UX / distribution gap vs. a polished cloud-native competitor.**
  Trigger: measurable traction of a competitor with lightweight
  onboarding in the non-regulated segment. Response: "quick mode"
  5-question wizard.
- **Claude Code mindshare dependency.** The deepest EmbedIQ
  configuration capabilities (hooks, commands, agents,
  `settings.local.json`) are Claude-Code-specific. Trigger: Claude
  Code mindshare decline relative to Cursor or Copilot. Response:
  match Claude-Code-depth on Cursor or Copilot generators.

## See also

- [Security model](security-model.md) — architectural guarantees
- [Evaluation methodology](evaluation-methodology.md) — benchmark
  us quantitatively
- [Competitive comparison](competitive-comparison.md) — tool-by-tool
  feature matrix
- [SECURITY.md](../../SECURITY.md) — threat model + cryptographic
  primitives
