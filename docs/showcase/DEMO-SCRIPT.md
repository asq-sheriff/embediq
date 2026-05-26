<!-- audience: public -->

# EmbedIQ — Live Demo Script (20 minutes)

A talk-track for live customer conversations. This is distinct from the `scripts/demo.tape` terminal demo (which is a 110-second visual loop for the README). Use this when you are screen-sharing with a real prospect — CTO, CISO, HIPAA officer, contracting officer, engagement director.

Total time: 18-20 minutes plus 5-10 minutes of Q&A.

## Before the call

- Confirm which persona the prospect maps to (healthcare BPO, federal contractor, financial services, consulting firm).
- Clone `https://github.com/asq-sheriff/embediq` on a fresh machine state so the demo is reproducible.
- Have a target project ready — ideally one in their industry. A public open-source healthcare or fintech codebase works.
- Have `make build` and `make start` already aliased.
- Pre-stage the OSCAL profile JSON for their compliance baseline (FedRAMP Low for federal, NIST AI RMF for AI-governance-led, none for healthcare/fintech).
- Open four browser tabs: the GitHub repo, the EXECUTIVE-BRIEF.md, the persona brief, and the relevant OSCAL evidence sample.

## Demo structure

| Section | Time | Outcome |
|---|---|---|
| 1. Set the frame | 2 min | Prospect agrees on the problem |
| 2. Wizard interview | 4 min | Prospect sees the 10-minute interview |
| 3. Generated harness reveal | 3 min | Prospect sees the developer-side output |
| 4. Governance evidence reveal | 5 min | Prospect sees the audit-side output — the differentiator |
| 5. Drift detection + autopilot | 2 min | Prospect understands continuous compliance |
| 6. Close and ask | 2 min | Prospect commits to a pilot, deeper meeting, or referral |

## Section 1 — Set the frame (2 min)

Open with a question, not a slide.

> "Before I show you the tool, I want to make sure we are solving the same problem. When your engineers use Claude Code or Cursor or Copilot today, three questions tend to come up. Can you tell me which of these is sharpest for you?
>
> One — how do you stop sensitive data from leaking into the AI prompts.
>
> Two — when your auditor asks you what AI tools touch this codebase, you can give a defensible answer.
>
> Three — when you regenerate the configuration in six months, you can prove it has not drifted.
>
> Which of those three is the one that is actively costing you sleep?"

Listen. Note the answer. The rest of the demo emphasizes that pillar.

## Section 2 — The wizard interview (4 min)

Switch to terminal. Show:

```bash
git clone https://github.com/asq-sheriff/embediq
cd embediq
make start
```

Walk through the wizard. Skim — do not narrate every question. Stop on three specific moments:

**Moment 1 — the industry question (STRAT_002).**
> "When I select healthcare, it auto-resolves the HIPAA domain pack. Six wizard questions specific to PHI handling will appear, and six DLP patterns will get added to the generated configuration. Nothing manual."

**Moment 2 — the compliance frameworks question (REG_002).**
> "I'll also select NIST AI RMF here. Now the wizard composes the healthcare pack and the AI RMF pack. Six healthcare questions plus six AI RMF questions, in the right order. The first-wins conflict resolution is deterministic."

**Moment 3 — the playback phase.**
> "Before any files get generated, the wizard plays back what it understood. The user can correct anything that is wrong. This is where the deterministic guarantee comes from — same answers, same harness, every time."

Finish the wizard. Hit generate.

## Section 3 — Generated harness reveal (3 min)

```bash
ls .claude/
cat .claude/CLAUDE.md
```

Point at three specific things:

**Path-scoped rules.**
> "Different rules apply to different directories. The PHI directories have stricter DLP. The `infra/` directory has different rules from `claims/`. The agent applies the right policy per path."

**Pre-tool hooks.**
> "Before the agent calls any tool — read a file, run a command, send a prompt — these Python hooks scan the input. PHI patterns get blocked at the source, not at the network layer. Exit code 2 means blocked."

**Settings tiers.**
> "Permissive, Balanced, Strict, Lockdown. The wizard chose Strict for this profile based on the answers. It restricts file access, denies risky permission grants, and surfaces high-friction actions to the user before they happen."

Then show the multi-target output:

```bash
ls .cursor/ .github/ AGENTS.md
```

> "Same wizard interview. Same answers. Five different AI coding agent formats — Claude Code, Cursor, Copilot, Gemini, Windsurf. If your team standardizes on one, you generate only that one. If you have engineers on different tools, you generate all of them."

## Section 4 — Governance evidence reveal (5 min, the key section)

This is where the prospect's procurement / audit person sits up.

```bash
make start ARGS="--targets claude,oscal-component,oscal-ssp-fragment,cyclonedx-aibom,provenance"
ls .embediq/
```

Open four files in sequence. Spend roughly a minute each.

**`.embediq/oscal/component-definition.json`**
> "This is OSCAL — the NIST format for describing system components and the controls they implement. Drata and Vanta ingest this directly. Your 3PAO speaks this language. We did not invent a format — we emit the one the audit world is converging on. We round-tripped this against verbatim NIST 800-53 Rev 5 fixtures."

**`.embediq/oscal/ssp-fragment.json`**
> "This is the System Security Plan fragment. Operator-overridable via three env vars: the OSCAL profile reference, the system name, the FIPS-199 sensitivity. We stamp it as `document-completion-status=fragment` — we don't pretend it is a complete SSP, because that requires authorization-boundary information your security team owns. This is the starter."

**`.embediq/cyclonedx/aibom.json`**
> "CycloneDX 1.6 ML-BOM — the AI bill of materials standard. Every AI component the harness uses appears here: Ollama models, hosted APIs, IDE agents, the local-router service if you opted in. This is the answer to 'what is the AI supply chain of this system.'"

**`.embediq/provenance/manifest.json`**
> "Per-file traceability. Every file in the generated harness is mapped to the generator that produced it, the target format it was emitted for, the domain pack it came from, and the skill that contributed it. When an auditor asks 'how was this file produced,' there is a literal answer."

Then the audit chain:

```bash
EMBEDIQ_AUDIT_CHAIN_ENABLED=true \
EMBEDIQ_AUDIT_LOG=./audit.jsonl \
  make start
cat audit.jsonl | head -3
make verify-audit-log INPUT=./audit.jsonl
```

> "Every line carries a prevHash linking to the previous line. RFC-6962 linked-log pattern — the same approach Certificate Transparency uses. Tampering with any line breaks the chain. The verifier walks the file and returns exit 0 if intact, exit 1 if broken. Drop it straight into CI."

## Section 5 — Drift detection and autopilot (2 min)

```bash
make drift -- --target ./my-project --archetype healthcare-bpo
```

> "Continuous compliance. The drift detector regenerates the expected harness from the original answers and compares against what is on disk. Each file is classified — match, missing, modified-by-user, modified-stale-stamp, version-mismatch, extra. Files outside the managed subtrees are the user's domain and never get flagged."

Then mention autopilot briefly:

> "On a cron schedule or triggered by a Drata or Vanta webhook, autopilot re-runs drift detection automatically. Open a PR if drift is detected. Alert if the failure streak exceeds a threshold. This is the 'will not silently rot' guarantee."

## Section 6 — Close and ask (2 min)

End with a specific ask, not "what do you think."

For a warm prospect:
> "Here is what a one-month pilot looks like for your team. Week one, pick a regulated engineering team. Week two, run the wizard and drop the harness into their repo. Week three, generate the OSCAL package and submit it to your audit pipeline. Week four, decide whether to roll out to a second team. The whole pilot uses the open-source MIT-licensed core. If at the end of week four you want professional services support, we can talk. What would block you from starting that next Tuesday?"

For a cold prospect:
> "There is more I want to show you — the local-AI integration for air-gapped environments, the multi-agent skill composition system, the Drata and Vanta webhook integration. Worth a follow-up? I can prep the demo against a project closer to your stack."

For a referral target:
> "Even if this is not for you specifically — who in your network has the AI-tooling-meets-audit problem? Two introductions would be worth more to me than ten more demos."

## Common interruptions and the answer

**"Is this just a wrapper around `/init`?"**
> "Claude Code's `/init` produces a generic developer-friendly CLAUDE.md. EmbedIQ produces a compliance-aware harness across sixteen target formats, plus the OSCAL evidence, plus the AIBOM, plus the provenance trace, plus the tamper-evident audit chain. Different artifact, different problem."

**"Why not just use Drata or Vanta directly?"**
> "Drata and Vanta manage your compliance posture at the policy level. EmbedIQ produces the developer-side evidence those platforms ingest. They are complementary — we are upstream of them."

**"Why not LLM-generate the configuration?"**
> "Because auditors cannot reproduce non-deterministic output. If the LLM generates a different rule next time, your auditor sees a moving target. Our value comes from byte-identical regeneration — same answers, same harness, forever."

**"How is your data security?"**
> "The wizard runs locally by default. Answers never leave your machine. If you run the web server, four pluggable auth strategies and three-tier RBAC. The optional local-AI integration means PHI never has to touch a hosted model. Zero telemetry."

**"What does it cost?"**
> "The core is MIT licensed. Free to use, modify, and self-host for unlimited engagements. Professional services through Praglogic for custom domain packs, GRC integration, and audit support."

## Post-demo follow-up

Within 24 hours:

- Send the prospect the executive brief plus their persona brief plus a one-line summary of the answer they gave to your opening question.
- Suggest a specific next meeting — "let's get your HIPAA officer on a 30-min call to look at the OSCAL output" — not a vague "let's stay in touch."
- If they did not commit to a pilot, ask the referral question by email.

## See also

- [`EXECUTIVE-BRIEF.md`](EXECUTIVE-BRIEF.md) — the leave-behind document.
- [`persona-healthcare-bpo.md`](persona-healthcare-bpo.md), [`persona-federal-contractor.md`](persona-federal-contractor.md), [`persona-consulting-firm.md`](persona-consulting-firm.md) — per-persona deep dives.
- [`FAQ.md`](FAQ.md) — objection-handling answers.
- `scripts/demo.tape` — the 110-second terminal loop for the README.
