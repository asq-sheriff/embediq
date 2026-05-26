<!-- audience: public -->

# EmbedIQ — Pitch Deck Outline

Markdown outline for a 13-slide pitch deck. Each slide carries:

- **Title** — what appears at the top of the slide.
- **Headline** — the single sentence that lands first.
- **Visual** — what to put in the body (chart, diagram, screenshot, list).
- **Speaker notes** — what to say while the slide is up. Roughly 30-60 seconds per slide.

Total speaking time: ~15 minutes plus Q&A.

This outline is ready to feed into Gamma, paste into a slide generator, or hand to a designer. The visual specs reference the same color palette as the v2.1 and v4.0 infographics — soft purple / teal / coral on a clean white-or-near-white background.

---

## Slide 1 — Title

**Title:** EmbedIQ

**Headline:** Federal-procurement-grade AI governance for the AI coding agents your developers already use.

**Visual:** EmbedIQ logo, "by Praglogic" subtitle, presenter name, date. Use the same purple gradient as the v2.1 infographic header bar.

**Speaker notes:**
> "Thanks for the time. Twelve minutes on what we built and why it matters, then I want to hear what is hardest for you. I will not pitch you on something you do not need."

---

## Slide 2 — The problem in three forces

**Title:** Three forces converged in the last twelve months

**Headline:** Your developers already use AI coding agents. Your auditors are about to ask about it.

**Visual:** Three vertical columns, each with an icon and a short label:

- **Federal pressure** — NIST AI RMF 1.0, AI 600-1, OMB M-24-10.
- **Audit pressure** — SOC 2, HIPAA, PCI-DSS, ISO 27001 questions about AI tooling.
- **Procurement pressure** — Drata and Vanta want OSCAL evidence. CycloneDX-ML is becoming the AI supply-chain standard.

**Speaker notes:**
> "Three things landed in the last year. Federal: every agency now needs AI inventory and governance evidence under M-24-10. Audit: the major frameworks are starting to ask 'what AI tools touch this codebase' — that question was nowhere a year ago. Procurement: the format the audit world is converging on is OSCAL. None of these were on your roadmap a year ago. All of them are on it now."

---

## Slide 3 — The specific gap

**Title:** Most teams answer with spreadsheets and screenshots

**Headline:** That does not survive the next audit cycle.

**Visual:** A "before" image — a messy stack of spreadsheets, Slack screenshots, and configuration files. Bullet list overlay:

- Inconsistent setup across teams
- No audit trail for configuration changes
- No supply-chain visibility for AI components
- No way to prove the configuration has not drifted

**Speaker notes:**
> "Right now most regulated teams answer the AI-tooling questions by maintaining spreadsheets, taking screenshots, and asking team leads to attest. That works one cycle. It does not work two cycles. And it definitely does not work when a procurement officer asks for OSCAL-formatted evidence."

---

## Slide 4 — What EmbedIQ is

**Title:** A ten-minute interview that produces three things

**Headline:** A working AI agent setup, a complete audit evidence package, and continuous compliance.

**Visual:** Three large boxes side by side, mirroring the v4.0 infographic middle column:

1. **Production-ready harness** — 15-40 config files for Claude / Cursor / Copilot / Gemini / Windsurf.
2. **Audit evidence package** — OSCAL component-definition + SSP fragment, CycloneDX-ML AIBOM, provenance trace, tamper-evident audit chain.
3. **Continuous compliance** — drift detection, scheduled re-scans, Drata / Vanta webhooks, CI-ready audit verifier.

**Speaker notes:**
> "EmbedIQ is a wizard that interviews your team for ten minutes, then produces three things in parallel. A working AI agent setup. The audit evidence to defend it. And the continuous-monitoring tooling to keep it honest."

---

## Slide 5 — The defining property

**Title:** The same interview always produces the same harness

**Headline:** Auditors can reproduce the artifact. Developers can re-run after a policy change. CI can detect drift automatically.

**Visual:** A simple diagram — three runs of the wizard from the same answer set, three identical output trees, with `diff` showing zero bytes different.

**Speaker notes:**
> "This is the property that makes EmbedIQ defensible in regulated environments. Same answers in, same harness out, every time. No LLM in the generator. The artifact your auditor sees this quarter is bit-for-bit identical to the artifact your auditor will see next quarter. That property is the thing every alternative tool gets wrong."

---

## Slide 6 — Live demo (5 minutes)

**Title:** Let me show you

**Headline:** —

**Visual:** Switch to terminal. Run the wizard against a target project. Hit the three moments from `DEMO-SCRIPT.md` section 2 — industry resolution, framework composition, playback. Generate. Open the four governance files in sequence.

**Speaker notes:**
> "This is a real run. Same wizard your team will use. I will skip questions for time. Watch what comes out the other end."

*(This is the only slide where you spend more than 60 seconds. Budget 5 minutes for the demo itself, then resume.)*

---

## Slide 7 — The competitive picture

**Title:** Why this matters versus the alternatives

**Headline:** Four common substitutes; four specific gaps EmbedIQ closes.

**Visual:** Two-column table — same as the EXECUTIVE-BRIEF "What makes it defensible" table:

| Alternative | Gap EmbedIQ closes |
|---|---|
| Claude `/init` | No compliance rules, no audit evidence, no drift detection. |
| Hand-authored configs | Inconsistent across teams, no traceability, drifts within weeks. |
| LLM-generated configs | Non-deterministic — the auditor cannot reproduce the artifact. |
| GRC platforms (Drata, Vanta) | Manage policy, not developer tooling. EmbedIQ produces the evidence they ingest. |

**Speaker notes:**
> "Most evaluators ask 'why not just use /init' or 'why not generate the config with Claude itself.' The answer is the same: those tools optimize for developer ergonomics. EmbedIQ optimizes for audit defensibility. Both matter — but in regulated environments only one of them keeps your authorization."

---

## Slide 8 — Who has bought into this

**Title:** Built for four specific buyers

**Headline:** Healthcare BPOs, federal contractors, financial services, consulting firms.

**Visual:** Four persona tiles. Each tile shows the role title and the single sharpest question they ask:

- **Healthcare CTO** — "Can I stop PHI from leaking into AI prompts and prove it?"
- **Federal ISSM** — "Can I produce OSCAL evidence my 3PAO will accept?"
- **Financial Services CISO** — "Can I show my auditor what AI tools touch payment data?"
- **Consulting Firm Engagement Director** — "Can I produce per-engagement audit evidence at handoff?"

**Speaker notes:**
> "These four buyers have the sharpest version of the problem. If you do not see yourself here, the tool still works — but the urgency is highest in these four populations. Which of them maps closest to your situation?"

*(Listen. Personalize the rest of the deck to the answer.)*

---

## Slide 9 — Commercial model

**Title:** How EmbedIQ is structured

**Headline:** Open source core, professional services for adoption, hosted offering in planning.

**Visual:** Three horizontal tiers:

- **Open source core (MIT)** — runs locally, no telemetry, no usage cap. Free.
- **Professional services (Praglogic)** — custom domain packs, GRC integration, audit support. Engagement-based pricing.
- **Hosted SaaS** — in planning. Multi-tenant managed deployment. Federal data: stays self-hosted indefinitely.

**Speaker notes:**
> "We are MIT-licensed at the core because the tool needs to be inspectable. You can read every line of code that generates your audit evidence. The commercial model is professional services for organizations that want help integrating, customizing, and standing it up. Hosted multi-tenant is planned for organizations that want managed deployment — but not for federal data."

---

## Slide 10 — Roadmap visibility

**Title:** What is shipped, what is next

**Headline:** v4.0 governance foundation is shipped. v4.1 and beyond build on it.

**Visual:** Horizontal timeline:

- **v4.0 (shipped)** — OSCAL import + export, CycloneDX-ML AIBOM, provenance trace, tamper-evident audit chain, NIST AI RMF pack.
- **v4.1** — Provider Abstraction Layer, Enterprise AI Policy Pack, policy-document RAG.
- **v4.2** — Self-Hosted Multi-Workspace.
- **v4.3** — AI-Augmented Generation (opt-in, score-gated against deterministic baseline).

**Speaker notes:**
> "v4.0 just shipped. The federal-procurement use case is unblocked today. v4.1 adds policy-document RAG so the wizard can read your existing enterprise AI policy and auto-fill the answers. v4.3 is where AI-augmented generation arrives — opt-in, gated against the deterministic baseline. The deterministic core stays the system of record."

---

## Slide 11 — The pilot ask

**Title:** A 30-day pilot looks like this

**Headline:** Week one: evaluate. Week two: pilot. Week three: audit dry run. Week four: decide.

**Visual:** A four-week timeline with the specific outcome at each week. Mirror the pilot plan from the relevant persona brief — pick the persona slide 8 surfaced.

**Speaker notes:**
> "Here is what I am asking for: one engineering team, four weeks, no budget commitment because the core is open source. At the end of week four you have a working harness in one team's repo, an OSCAL package that passed your audit pipeline's dry run, and a real decision to make about wider rollout. If at week four it is the wrong tool for you, you have lost zero dollars and one team's sprint."

---

## Slide 12 — Risks and how we mitigate them

**Title:** The honest scope boundaries

**Headline:** EmbedIQ produces developer-side evidence. The rest of your authorization is yours.

**Visual:** A two-column table:

| What EmbedIQ does | What EmbedIQ does not do |
|---|---|
| Generate compliant AI agent harness | Author your AI policy |
| Produce OSCAL component + SSP fragment | Define your authorization boundary |
| Produce CycloneDX-ML AIBOM | Substitute for your CMDB |
| Tamper-evident audit chain | Replace HSM-backed signing (planned) |
| Drift detection + autopilot | Manage your overall GRC program |

**Speaker notes:**
> "I want to be clear about what we do not do, because evaluators get burned by tools that overclaim. EmbedIQ is one input to your governance program. It produces the developer-side artifact in the right format. It does not produce your AI policy, define your authorization boundary, or replace your GRC platform. Your auditor needs all of those things; we produce the one EmbedIQ is in the right position to produce."

---

## Slide 13 — Close

**Title:** Two things I am asking for today

**Headline:** Decide whether a pilot makes sense. Tell me what would block it.

**Visual:** Two large CTAs:

1. **Schedule a pilot kickoff** — pick one team, four weeks, open-source core.
2. **Tell me who else in your network has this problem** — two introductions to people in your situation.

Below: contact info and the repo URL.

**Speaker notes:**
> "Two specific asks. First — if this feels right, let us pick one team and start a four-week pilot. No budget commitment. Second — even if it is not for you, two introductions to people in your network with the AI-tooling-meets-audit problem would matter more to me than ten more demos. Either of those work?"

---

## Production notes for slide generation

If you generate this in Gamma or a similar tool:

- Theme: clean, minimal, light background. Same color palette as the v2.1 and v4.0 infographics (soft purple primary, teal and coral accents).
- Typography: sans-serif, with a single monospace accent for code references.
- Avoid stock photography. Use only diagrams, icons, and the EmbedIQ infographics.
- Include the EmbedIQ logo on every slide footer plus the slide number. No third-party logos unless you have explicit permission.
- Export as PDF for sharing; keep the Gamma original for live editing.

## See also

- [`EXECUTIVE-BRIEF.md`](EXECUTIVE-BRIEF.md) — the leave-behind document, paired with this deck.
- [`DEMO-SCRIPT.md`](DEMO-SCRIPT.md) — the talk track for slide 6.
- [`FAQ.md`](FAQ.md) — answers for live Q&A after slide 13.
- [`persona-healthcare-bpo.md`](persona-healthcare-bpo.md), [`persona-federal-contractor.md`](persona-federal-contractor.md), [`persona-consulting-firm.md`](persona-consulting-firm.md) — per-persona deep dives for follow-up.
