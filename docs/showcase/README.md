<!-- audience: public -->

# EmbedIQ Showcase

Customer-facing documentation for evaluators, sales conversations, and pilot kickoffs. Each document is independently shippable — start with the one that matches your role.

## If you are evaluating EmbedIQ for the first time

Start with the **[Executive Brief](EXECUTIVE-BRIEF.md)** (5-minute read). It covers what EmbedIQ is, who it is for, what you get from one wizard run, what makes it defensible, the commercial model, and how to engage. Persona-agnostic; the right first document for a CIO, CISO, or procurement lead.

## If you map to a specific persona

Read the executive brief, then the persona-specific deep dive that matches your situation:

- **[Healthcare BPO Brief](persona-healthcare-bpo.md)** — HIPAA-covered developer teams, healthcare business process outsourcers, claims adjudication, prior authorization, clinical coding, RCM, eligibility verification, contact-center support.
- **[Federal Contractor Brief](persona-federal-contractor.md)** — Defense primes, civilian agency integrators, FedRAMP authorization candidates, NIST AI RMF posture, OSCAL evidence packages, agency teams adopting GenAI under OMB M-24-10.
- **[Consulting Firm Brief](persona-consulting-firm.md)** — Multi-engagement engineering services firms standardizing AI-agent setup across healthcare, financial services, federal, and education clients.

Each brief includes a vertical-specific pilot plan and engagement model.

## If you are running a live customer conversation

Use the **[Demo Script](DEMO-SCRIPT.md)** — a 20-minute talk track for live screen-shares. Includes the opening question that surfaces which problem matters most to the prospect, the six demo sections, and the closing ask.

For after-demo follow-up, the **[FAQ](FAQ.md)** answers the fifteen hardest objections — how this differs from `/init`, why not LLM-generate the configuration, whether auditors accept OSCAL, data residency, hosted vs self-hosted, pricing model, and roadmap visibility.

## If you are presenting EmbedIQ in a slide-based pitch

The **[Pitch Deck Outline](PITCH-DECK.md)** is a 13-slide deck specification. Markdown structure, headlines, visual specs, and speaker notes per slide. Ready to feed into Gamma, paste into a slide generator, or hand to a designer. Pairs with the Demo Script for slide 6 (the live-demo section).

## Reference material beyond this directory

For evaluators who want the technical / security / methodology view:

- [`../VISION.md`](../VISION.md) — strategic framing and product vision.
- [`../evaluators/competitive-comparison.md`](../evaluators/competitive-comparison.md) — methodology for comparing EmbedIQ against alternatives.
- [`../evaluators/evaluation-methodology.md`](../evaluators/evaluation-methodology.md) — how we score generated output against golden references.
- [`../evaluators/security-model.md`](../evaluators/security-model.md) — security model for CISO review.
- [`../evaluators/threat-coverage.md`](../evaluators/threat-coverage.md) — threat coverage for security architecture review.

For operators who want the technical / runbook view:

- [`../HEALTHCARE-BPO-DEPLOYMENT.md`](../HEALTHCARE-BPO-DEPLOYMENT.md) — operator runbook for healthcare BPO IT teams.
- [`../CONSULTING-FIRM-DEPLOYMENT.md`](../CONSULTING-FIRM-DEPLOYMENT.md) — operator runbook for consulting-firm IT teams.
- [`../operator-guide/audit-chain.md`](../operator-guide/audit-chain.md) — tamper-evident audit chain operator guide.
- [`../extension-guide/`](../extension-guide/) — per-feature extension guides (OSCAL imports, OSCAL exports, CycloneDX-ML AIBOM, provenance traces, NIST AI RMF pack).

## What to do next

- **Evaluators**: `git clone https://github.com/asq-sheriff/embediq && make start` — the wizard runs locally with no network calls.
- **Prospects**: schedule a 30-minute call via [praglogic.com](https://praglogic.com).
- **Partners**: review the consulting firm brief; Praglogic offers practice-led adoption support.

---

**Contact:** [praglogic.com](https://praglogic.com) · **Source:** [github.com/asq-sheriff/embediq](https://github.com/asq-sheriff/embediq) · MIT licensed
