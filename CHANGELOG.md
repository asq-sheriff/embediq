<!-- audience: public -->

# Changelog

All notable changes to EmbedIQ are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.1.0] — 2026-07-14 — Policy-driven egress control + audit evidence

The routing layer is re-architected around a Policy Decision Point / Policy
Enforcement Point split: one deterministic routing policy compiled to many native
enforcement configs. The compliance gate becomes credential locality + route
absence — never a filter — kept honest by drift.

### Added
- **Routing Policy Decision Point** (`src/synthesizer/policy/`) — one versioned,
  deterministic `RoutingPolicy` compiled from the profile: a destination catalog
  with a `covered[]` (BAA/DPA attestation) field and a fail-closed eligibility
  lattice that answers *which destinations a given data class is eligible to
  reach* before any cost/quality optimization. Regulated-class rules are
  contributed by domain packs (`DomainPack.eligibilityContributions`), so adding
  a vertical is pack data, not a core edit.
- **LiteLLM gateway generator** (`--targets litellm`) — compiles
  `litellm/config.yaml` from the routing policy; `model_list` holds only eligible
  (BAA-covered) destinations, so on a regulated profile an uncovered provider is
  absent entirely — air-gapped by construction, provable by reading the file.
- **Egress guardrail generator** — an OSS custom-code LiteLLM guardrail
  (`litellm/guardrails/embediq_phi_egress.py`) rendered from the compliance
  pack's DLP patterns (one source of truth). Defence in depth; the control is
  route absence + credential locality, not the filter.
- **Egress-eligibility gate** (`npm run evaluate -- --mode router-eligibility`)
  — replays an adversarial PHI/PCI corpus through the policy and proves no
  regulated prompt can reach a forbidden destination, even under a classifier miss.
- **Unified audit/evidence bundle** (`--targets audit-bundle`) —
  `.embediq/audit-bundle/` manifest + README indexing every compliance artifact
  (routing policy, gateway, guardrail, OSCAL, AIBOM, provenance, DLP hook) with a
  content hash, the egress posture, and the runnable controls an auditor can execute.
- **BAA-coverage metadata on the AIBOM** — each hosted model carries an
  `embediq:baa-covered` property sourced from the routing policy.
- `REG_019` BAA/DPA attestation question → `UserProfile.coveredProviders`;
  `GATEWAY_BASE_URL` for the router.

### Changed
- **Local router is now decision-only** — it classifies a request and forwards
  escalations to the LLM gateway; it holds no provider credentials and makes no
  direct provider call, so the PHI/PII egress gate is unbypassable. The gateway
  owns the keys and enforces the guardrail.
- `GenerationContext` carrier refactor — the policy is derived once and threaded
  to every generator, so the router / gateway / guardrail / ignore configs cannot
  drift apart.
- Drift detection now governs the local-AI output family (`router/`, `rag/`,
  `litellm/`), previously ungoverned.
- **36 generators across 18 target formats.**

### Fixed
- `flushSessionWrites()` registered the session write-back inside
  `res.on('finish')`, which fires after the client request resolves — so the
  flush (tests + graceful shutdown) could miss an in-flight write. A per-request
  settlement promise is now registered synchronously.

### Removed
- The router's inline PHI redactor and hosted-client (`router/src/redactor.ts`,
  `router/src/hosted-client.ts`) — egress DLP now lives at the gateway guardrail,
  rendered from the compliance pack, closing the divergent second source of truth.

### Notes
- New capabilities are opt-in targets; existing goldens regenerate
  byte-identically (14/14 at 100%). 1428 tests passing.

## [4.0.6] — 2026-06-04 — Landing redesign + isolation transparency + wizard polish

### Added
- **Landing "How agent isolation & sandboxing actually works" section** — the
  four-step enforcement handoff (choose deployment environment + posture →
  EmbedIQ generates `managed-settings.json` + `.devcontainer` → Intune/Jamf
  delivers & locks it to an OS path devs can't edit → the OS + Claude Code
  native sandbox confines at runtime), each step attributed to who owns it, with
  an honest "what it does / what it doesn't" split. EmbedIQ produces the config;
  it is **not** itself the sandbox or the MDM.

### Changed
- **Apple-style landing redesign** — the welcome screen is now a cohesive
  scrolling landing: an eyebrow + soft-glow hero with the gated handoff stepper
  and a 3-up glance strip, a tinted "Everything a regulated team needs" band with
  four icon cards, the isolation handoff as its own section, and a closing CTA —
  on a unified type / spacing / card system.
- **Wizard screens matched to the landing** — accent-tinted scope banner (was
  indigo), the "why we ask" panel as a soft rounded accent card, lighter heading
  weights, the landing's softer card/input radii, and the same accent tints +
  subtle hover lift across the Q&A, review, and generate screens.

### Notes
- Visual / UX only — no generator or schema changes; existing goldens regenerate
  byte-identically (14/14 at 100%); 1367 tests passing.

## [4.0.5] — 2026-06-04 — Role-scoped handoff + landing & demo polish

### Added
- **Gated three-role handoff** in the web wizard — Admin → Team Lead → Individual
  unlock in sequence (each role stays locked until the prior slice completes),
  every slice ends in a summary, and generation runs only after the final
  (Individual) slice. Completed roles stay reviewable. Single-pass generation and
  goldens are unchanged.
- **Landing "Built into every setup" section** — Guardrails, Enforced sandboxing
  (Claude Code), Tamper-evident audit trail, Audit-ready evidence.
- **Codex** named across the agent targets (it reads `AGENTS.md`, which EmbedIQ
  already generates) — in the hero strip and the AGENTS.md target option.
- **EmbedIQ credit** in every generated file's stamp (homepage · a Praglogic
  project · MIT) — a courtesy attribution stripped by the evaluator and
  drift-detector, so goldens stay byte-identical.
- **"See it in action" README screenshots** — the role-scoped handoff, the scoped
  interview, a slice-complete summary, and the Ready-to-Generate screen.

### Changed
- Plainer hero subtitle (drops the "OSCAL" / "tamper-evident" jargon); right-sized
  headline; the frameworks question (`TECH_003`) is now skippable.

### Fixed
- Welcome-screen favicon (eliminates the `/favicon.ico` 404 console error);
  invisible resume-banner text (used a CSS token that does not exist).

### Notes
- Additive / opt-in throughout — existing goldens regenerate byte-identically
  (14/14 at 100%); 1367 tests passing.

## [4.0.4] — 2026-06-04 — Expanded language coverage

### Added
- **More languages in the stack interview (`TECH_001`):** **C++**, **SQL**, and
  **Apache Spark**, plus **JavaScript** split out from TypeScript into its own
  option. Each drives a path-scoped rules file — SQL → parameterized-query /
  migration guardrails; C++ → RAII + smart pointers + `clang-tidy`; Spark →
  DataFrame-over-RDD, no `.collect()` on large data; JavaScript → ESLint +
  const-by-default. JavaScript also wires into the build/test default-inference
  (npm / jest / ESLint + Prettier).

### Notes
- Additive: existing answer sets don't select the new languages, so goldens
  regenerate byte-identically.

## [4.0.3] — 2026-06-03 — Agent isolation & sandbox enforcement

"Do we need a VM to run the coding agents?" — answered as both product capability
and guidance. The wizard generates the agent's **isolation enforcement layer**, and
two new docs frame the decision (native OS sandbox vs dev container vs microVM vs
full VM/VDI, plus the Azure patterns).

### Added
- **Isolation-posture question (`TECH_023`, admin-only).** A team-wide policy the
  admin sets once — managed endpoint / dev container / VDI / ephemeral cloud / CI-only
  / none. Gated to the Coding Agent Admin (`STRAT_000b` **and** `respondent: admin`);
  individual users inherit the posture, they are not asked.
- **`managed-settings.json` generator.** Emits `deploy/claude-code/managed-settings.json`
  (`"sandbox": { "enabled": true }` + a non-wideable deny floor matched to the security
  tier) plus a delivery README, for fleet enforcement via Intune / Jamf / MDM.
- **Dev-container generator.** Emits `.devcontainer/devcontainer.json` (+ README),
  language-matched, when the posture is a dev container.
- **Docs:** `docs/evaluators/isolation-decision-guide.md` (the isolation ladder, where a
  VM earns its place, Azure patterns, a decision matrix) and
  `docs/operator-guide/azure-isolation-runbook.md` (AVD + WSL2 + Intune managed-settings
  + Zero-Trust).

### Notes
- Both generators are opt-in on the posture and **no-op otherwise**, so existing goldens
  regenerate byte-identically. Totals are now **33 generators** and **95 questions**.

## [4.0.2] — 2026-06-03 — Three-role respondent model + delegation workflow

The wizard previously asked a single "Coding Agent Admin" nearly every question.
An audit of all 93 questions showed they split three ways by *who is actually
positioned to answer* — so a central admin answering alone produces a
confidently-wrong harness, worst in Problem Definition (pain points feed the
priority analyzer → CLAUDE.md priorities). This adds a three-role model and a
delegation workflow built on the existing session + `contributedBy` rails.

### Added — three-role classification

- **`Question.respondent`** (`admin` / `lead` / `individual` / `any`) + an auditable `RESPONDENT_BY_ID` map and `respondentOf()` resolver in `src/bank/question-registry.ts`. The Admin owns only the setup-identity questions (role / proficiency / operator) plus the **Compliance policy switches** and **Financial** — 18 questions. The **Team Lead** is the primary driver and owns the project, problem definition, operational reality, all of Technology (stack + infra), Innovation, and the actual-data-flow compliance facts — ~40 questions. The **Individual** owns per-seat preferences (IDE, local-model hardware/model, concurrent sessions).
- **Role-scoped visibility** — `QuestionBank.getVisibleQuestions(dimension, answers, role?)` filters by respondent and stamps the resolved respondent on served questions. Omitting `role` returns the full set, so single-pass generation and goldens are byte-identical.

### Added — delegation workflow

- **Operator-aware proxy framing** — when someone answers a question owned by a different role, the wizard shows a marker ("👥 Best answered by your Team Lead" / "🧑 Personal preference") and pairs it with the existing skip→infer affordance so a proxy can defer rather than guess.
- **`DelegationAssignment`** on `WizardSession` + endpoints: `POST /api/sessions/:id/assignments` mints a `?session=…&role=…` link; `GET` returns live per-role completion (answered/visible/status/contributors).
- **Delegated access** — the session middleware grants a non-owner access when their `?role=` matches an assignment the owner created (the link is the bearer capability); `PATCH` restricts a delegate's writes to their own role's slice (defense in depth — admin-owned answers in a lead's payload are dropped).
- **Web UI** — `?role=` scopes the wizard to the delegate's slice with a context banner; an "Assign & delegate" panel + per-role dashboard on the generate screen lets the admin create assignments, copy links, and watch progress. Reminders are re-copyable links (no SMTP in the stack).
- **Per-role audit attribution** — the profile report gains a "Contributions by role" section (counts via `respondentOf`) and tags each answer-log entry with its owning role + contributor; the JSON report adds an `attribution` block. Generation tolerates partial answers (inference + skip), so the admin can generate before delegates finish.

### Tests

- Test count **1285 → 1339**: role-filtered visibility, `roleCompletion`, report attribution, and a delegation integration suite (assignment creation, non-owner deny `403`, delegate grant, slice-restricted writes, dashboard completion). Browser-driven verification of the proxy framing and SPA init via headless Playwright. Evaluator stays at 100% (goldens byte-identical).

## [4.0.1] — 2026-05-31 — Azure / Microsoft stack + wizard quality

Layered on top of v4.0: a wizard-UX overhaul, the Azure / Microsoft stack
(Azure Repos PR adapter, azure-pipelines.yml, Visual Studio + JetBrains output,
cloud/deployment question), and a wizard-quality pass (operator-aware framing,
cross-answer validation, optional-question inference, profile report export, and
versioned audit-chained profile snapshots).

### Added — wizard surface

- **`STRAT_TARGETS` agent-selection question** — MULTI_CHOICE of all six hosted-agent formats; the answer drives `config.targets` server-side so the harness only emits files for the selected agents. Defaults to all agents when unanswered.
- **`STRAT_000b` admin-vs-user operator distinction** — orthogonal to role; auto-derived from auth role (`wizard-admin` → admin, `wizard-user` → user) when authenticated, gating ~28 admin-only questions (REG, FIN, security/audit) for non-admin operators.
- **`purposeText` schema field on `Question`** — admin-only "WHY WE ASK" panel rendered below `helpText`. Populated for all 91 questions (full pass, no skipped entries).
- **"Other (specify)" follow-up pattern** extended to 10 question dimensions where option lists can't be exhaustive: TECH_004 (IDE), TECH_005 (build), TECH_006 (testing), TECH_007 (CI/CD), TECH_009 (monitoring), TECH_010 (DB), TECH_011 (linting), TECH_014 (hardware), REG_002 (compliance frameworks), PROB_003 (prior solutions tried). Each adds a `<id>_other` FREE_TEXT follow-up gated on CONTAINS 'other'.
- **PROB_003 conversion** — was pure FREE_TEXT; now MULTI_CHOICE of 11 common pre-failure patterns (Copilot deprecated APIs, generic agents without compliance, pre-commit hooks disabled, GRC without dev-side, etc.) + Other-specify follow-up.
- **Four new REG framework follow-ups** parallel to the HIPAA / REG_003 pattern: REG_003a (PCI cardholder data), REG_003b (GDPR data-subject rights), REG_003c (FDA SaMD class), REG_003d (NIST AI RMF risk tier).
- **Per-dimension review step** — after the last question in a dimension is answered, the user sees a review panel listing every Q&A pair for that dimension; clicking any answer returns to that question for editing.
- **Back navigation** within a dimension; previous answers pre-fill on revisit.

### Added — synthesizer

- **`SETUP.md` generator** — emits a per-agent install + activation guide alongside the harness whenever any agent target is selected. Content adapts to the selected agent set: Claude Code install + verify, Cursor MDC discovery, Copilot install, Gemini Code Assist, Windsurf, plus AGENTS.md. Includes verification steps, compliance-specific checks (HIPAA / PCI), and troubleshooting.
- **`relevantFor` on `AnswerOption`** — option-level filtering driven by upstream answers. Python-only project sees only Python test frameworks / linters in TECH_006 / TECH_011 instead of the full mixed-language list.

### Added — Azure / Microsoft stack

- **Azure DevOps Repos git adapter** — `EMBEDIQ_GIT_PROVIDER=azure-repos` opens PRs directly into Azure Repos via the Git REST API (`api-version=7.1`). Three-part `organization/project/repository` identifier, HTTP Basic PAT auth, and a ref-update + single-push flow (add/edit classified against the base tree). Self-hosted Azure DevOps Server via `EMBEDIQ_GIT_API_BASE_URL`.
- **`azure-pipelines.yml` generator** — emits a runnable Azure Pipelines CI file when CI/CD is Azure DevOps (TECH_007). Build/test jobs are matched to the stack (.NET, Python, Java/Maven/Gradle, Node, Go, Rust); a Security stage with dependency + secret scanning is added for regulated profiles (HIPAA/PCI/SOC2/GDPR/FedRAMP).
- **`visual_studio` IDE option (TECH_004)** + a **`.editorconfig` generator** — Visual Studio users get a root `.editorconfig` driving formatting and Roslyn analyzer severities from the selected languages.
- **JetBrains generator** — IntelliJ / PyCharm / WebStorm / Rider users get `.junie/guidelines.md` (Junie / AI Assistant project guidelines) and `.aiignore` (AI context exclusions, including PHI/PII paths for regulated repos).
- **`TECH_022` cloud / deployment-target question** (Azure / AWS / GCP / on-prem / hybrid / other) threaded into `DevOpsProfile.cloudTarget`; surfaces a deployment-target line and gates Azure-specific scaffolding. Optional and branched — existing archetypes that don't answer it regenerate byte-identically.
- **Drift + SETUP.md coverage** — `azure-pipelines.yml`, `.editorconfig`, `.aiignore`, and `.junie/` are tracked by the drift detector's managed trees; SETUP.md emits Visual Studio, JetBrains, and Azure Pipelines activation sections (technical roles only).

### Added — wizard quality

- **Operator-aware question framing** — user-profile questions (role, proficiency) render team-framed copy for a Coding Agent Admin configuring for a team, first-person copy for an individual; selected from the auth-derived operator type.
- **Cross-answer consistency validation** — rule-based checks warn (with a suggested fix, non-blocking) when a typed answer contradicts earlier ones: framework↔language, duplicate "Other" entries, serverless-without-cloud, invalid DLP regex, under-spec local-model hardware, purpose↔industry. `POST /api/validate`. LLM-assisted semantic checks reserved as an extension point.
- **Optional questions with default-inference** — TECH_004/005/006 (IDE / build / testing) are skippable; the profile infers a sensible default from the selected languages when skipped (tagged "inferred" in the report).
- **Profile report export** — human-readable (md) / machine-readable (json) report of every answer plus the determinations EmbedIQ derived (resolved domain pack, targets, inferred defaults, priorities, consistency warnings); `POST /api/profile/report`, web download, and CLI `--profile-report`.
- **Versioned, audit-retained profile snapshots** — each session-bound generation appends an immutable profile snapshot (`GET /api/sessions/:id/profile-history`) with profile/answers hashes, chained into the tamper-evident audit log via a `profile_snapshot` entry.
- **Question-bank quality pass** — reordering (free-form purpose last; cloud after CI/CD; agent-teams before concurrent sessions) and the FIN_003 local-classifier routing option gated on local AI being enabled.

### Added — auth

- **`demo` auth strategy** — admin/user persona switcher activated via `EMBEDIQ_AUTH_STRATEGY=demo`. Reads `embediq_demo_user` cookie (or `?demo-user=` query param) and returns one of two preset users: `demo-admin@example.com` with `wizard-admin` role, or `demo-user@example.com` with `wizard-user` role. Permissive at the middleware level so the UI can render the persona picker. **Never for production** — anyone can claim any role.
- **Header user-profile menu** — top-right avatar + dropdown showing signed-in user, role badge, DEMO badge when in demo mode, "Switch account" and "Sign out" actions. Replaces the welcome-screen identity banner for authenticated users.
- **`/api/identity` endpoint** — surfaces auth state, OS-level host info (hostname, platform, release, username from `os.hostname()` + `os.userInfo()`), MDM-injected workstation ID (from `X-Workstation-Id` or `X-Device-Id` headers), and IP. Honest about device-verification source (`mdm-header` / `os-hostname` / `user-agent-fallback`).

### Added — refactored

- **`FIN_003` rewritten to be agent-agnostic** — was Claude-specific (OpusPlan / SonnetPlan / Manual / Auto-via-claude-router). Now: Deterministic rules / Local-LLM classifier (via TECH_013) / Tiered planning (per-agent) / Manual per-request / No routing.
- **Healthcare BPO archetype refactor** — `healthcare-bpo-strict` renamed to `healthcare-bpo-web-developer`; three siblings added (`healthcare-bpo-web-pm`, `healthcare-bpo-microsoft-developer`, `healthcare-bpo-microsoft-pm`) to cover the two dominant healthcare-BPO stack patterns × role variants. **Nine customer-specific archetypes deleted** — customer-named fixtures are no longer allowed in the repo; they're regenerable from the canonical archetypes with a customer overlay.
- **Welcome screen repositioned** — "Claude Code Setup Wizard" → "Configure your AI coding agents"; subtitle covers all five IDE targets; three explanatory meta-pills (15 target formats, 23 generators, HIPAA · PCI · FedRAMP · NIST AI RMF) with hover tooltips explaining each.

### Changed — counts

- Total questions: **77 → 91** (+14 net: STRAT_TARGETS, STRAT_000b, 4 REG framework follow-ups, 8 Other-specify follow-ups, minus PROB_004 redundancy removal, minus OPS_007 redundancy removal).
- Total generators: **23 → 28** (added SETUP.md + provenance-trace + cyclonedx-aibom + oscal-component + oscal-ssp-fragment all reframed into the canonical generator count).
- Target formats: **15 → 16** (added `provenance` as a distinct target alongside the earlier governance outputs).
- Auth strategies: **3 → 4** (added `demo`).
- Healthcare-BPO archetypes: **1 → 4 canonical** (after deleting 9 customer-specific fixtures).
- Total archetypes: **19 → 13** (customer-neutral set; same coverage with fewer redundant fixtures).
- Test count: **1,265 → 1,285** (snapshot regeneration after SETUP.md addition + golden regenerate after archetype refactor + new admin/user paths).
- Priority percentages replaced with categorical labels (Top / High / Moderate / Light) in the playback view — raw percentage preserved as tooltip.

### Fixed

- Duplicate file-list rendering on Phase 3 — the preview list (`#file-preview`) and the result list (`#file-list`) both showed after Generate; preview now hides when results land.
- "Setup Complete" h1 appeared before generation actually ran — now starts as "Ready to Generate" and swaps after success.
- Question counter showed "1 of N-1" after answering each question because the re-fetched visible list was filtered to unanswered — refactored to keep the full visible list and navigate by index.
- Pain-points multi-choice question was unresponsive — label/checkbox double-toggle bug; switched to manual state management with `event.preventDefault()`.
- Silent failure when clicking Continue with no required value selected — now shows validation hint + card shake.
- `eng_manager` role missing from `UserRole` union type (broke `tsc --noEmit`) — added.
- Welcome page and CLI banner still said "Claude Code Setup Wizard" — updated to "AI Coding Agent Setup Wizard".
- "Non-technical" proficiency option visible when role is developer/devops/lead/etc. — gated via `relevantFor` to only appear when role is BA/PM/Executive.

### Documentation

- **Full purposeText authoring pass** — all 91 questions now carry both `helpText` (context for everyone) and `purposeText` (admin-only "why we ask").
- **6 new customer-facing showcase docs** in `docs/showcase/`: `EXECUTIVE-BRIEF.md`, `persona-healthcare-bpo.md`, `persona-federal-contractor.md`, `persona-consulting-firm.md`, `DEMO-SCRIPT.md`, `FAQ.md`, `PITCH-DECK.md`, `PROCUREMENT-EVIDENCE-PACK.md`, `README.md` (showcase index).
- A customer-demo runbook marked stale (references deleted archetypes); narrative content preserved with a re-mapping note pointing to the canonical archetypes.

## [4.0.0] — Enterprise AI Governance Foundation

Shipped 2026-05-25 as seven discrete phases (all seven v4.0 governance phases) on top
of v3.7. Together they form the complete federal-procurement
governance suite: OSCAL catalog/profile import on the front end,
OSCAL component-definition + SSP fragment + CycloneDX-ML AIBOM +
per-file provenance trace on the back end, RFC-6962-pattern
tamper-evident audit chain underneath. NIST AI RMF + AI 600-1
GenAI Profile available as a composable domain pack.

All new output targets are **opt-in only** — added to
`ALL_TARGETS` but not `DEFAULT_TARGETS`, so existing goldens
regenerate byte-identically.

### Added — OSCAL catalog + profile import

- **`src/governance/oscal/loader.ts`** —
  `readOscalCatalog()`, `oscalCatalogToFramework()`,
  `flattenControls()`, `slugifyTitle()`, `OscalLoadError`.
  Hand-rolled minimal OSCAL types so EmbedIQ stays JVM-free for
  governance imports.
- **`src/governance/oscal/profile.ts`** —
  `readOscalProfile()`, `resolveOscalProfile()`,
  `oscalProfileToFramework()`. Operator-supplied `catalogPaths`
  map (UUID- or href-keyed). No network fetch, no `rlinks`
  chasing — offline-only by design.
- **`DomainPackRegistry.loadFromOscalCatalog()`** /
  **`.loadFromOscalProfile()`** / **`.composeFromPacks()`** — the
  entry points operators use to feed NIST OSCAL content + their
  industry pack into the wizard.
- **`src/domain-packs/composer.ts`** — `composePacks()` with the
  same first-wins-with-warnings semantics as `composeSkills()`.
- Vendored real-world fixtures:
  `tests/fixtures/oscal/nist-800-53-rev5-ir-slice.json` (verbatim
  NIST 800-53 Rev 5 IR family slice) +
  `nist-800-53-rev5-low-baseline-profile.json` (verbatim
  FedRAMP-pattern LOW baseline). CI-gated via round-trip tests.

### Added — OSCAL Component Definition export

- **`TargetFormat.OSCAL_COMPONENT`** + post-pass emitter at
  `src/synthesizer/generators/oscal-component.ts`. Output:
  `.embediq/oscal/component-definition.json` — valid OSCAL 1.1.2.
  Component-level props carry the full artifact manifest;
  control-implementations[] enumerates active compliance
  frameworks. Suitable for Drata / Vanta / FedRAMP 20x ingestion.

### Added — OSCAL SSP Fragment export

- **`TargetFormat.OSCAL_SSP_FRAGMENT`** + post-pass emitter.
  Output: `.embediq/oscal/ssp-fragment.json` — explicitly marked
  `document-completion-status=fragment` so audit pipelines know
  the document is not standalone.
- Operator overrides via env vars (avoid hand-editing the JSON):
  `EMBEDIQ_OSCAL_SSP_PROFILE_HREF`, `EMBEDIQ_OSCAL_SSP_SYSTEM_NAME`,
  `EMBEDIQ_OSCAL_SSP_SENSITIVITY` (fips-199-low|moderate|high).

### Added — CycloneDX-ML AIBOM export

- **`TargetFormat.CYCLONEDX_AIBOM`** + post-pass emitter at
  `src/governance/cyclonedx/`. Output:
  `.embediq/cyclonedx/aibom.json` — valid CycloneDX 1.6 with
  ML-BOM extensions enumerating every AI model, agent, and
  service the harness invokes (Ollama, hosted APIs, IDE agents,
  local-router). `dependencies[]` records the harness depends
  on every emitted component — Dependency-Track / OSV-Scanner
  walk this directly. EO 14110 / FedRAMP supply-chain disclosure
  aligned.

### Added — Per-file provenance trace

- **`TargetFormat.PROVENANCE`** + post-pass emitter at
  `src/governance/provenance/`. Output:
  `.embediq/provenance/manifest.json` — one entry per generated
  file combining authoritative generator + target attribution
  (recorded by the orchestrator) with heuristic driver inference
  from a rule catalog (`driver-heuristics.ts`).
- The trace records itself; runs LAST in the post-pass chain so
  the manifest covers every other governance output.
- `methodology.note` block surfaces the authoritative-vs-heuristic
  distinction so auditors don't over-read the trace.

### Added — Tamper-evident audit chain

- **`EMBEDIQ_AUDIT_CHAIN_ENABLED=true`** opt-in env var. When set,
  every entry in `EMBEDIQ_AUDIT_LOG` carries a SHA-256 `prevHash`
  linking it to its predecessor (or to a deterministic genesis
  hash for the first entry). Linked-log pattern inspired by RFC
  6962 Certificate Transparency.
- **`src/util/audit-chain.ts`** — pure primitives (`hashEntry`,
  `canonicalize`, `verifyAuditChain`, `appendChainedEntry`,
  `readLastEntryHash`, `GENESIS_HASH`).
- **`scripts/verify-audit-log.ts`** + npm script
  `verify-audit-log` + Makefile target — offline integrity
  verification. Exit 0 clean / 1 broken / 2 config error.
- Threat-model boundary documented in
  `docs/operator-guide/audit-chain.md` — defends single-entry
  tampering + middle deletions + middle insertions; explicitly
  does NOT defend end truncation, full re-chaining, or
  multi-writer races (single-writer assumption).

### Added — NIST AI RMF + AI 600-1 domain pack

- **`src/domain-packs/built-in/nist-ai-rmf.ts`** — 6 wizard
  questions (Govern / Map / Measure / Manage + AI 600-1 GenAI
  Profile + external assessment); 2 compliance frameworks
  (`nist-ai-rmf`, `nist-ai-600-1`); 4 priority categories; 4
  path-scoped rule templates (one per RMF function); 4
  validation checks. Zero DLP / ignore patterns — cross-industry
  pack composes with industry packs for data-class DLP.
- **`src/skills/built-in/nist-ai-rmf.ts`** — companion skill
  (`nist-ai-rmf.full`).
- **`REG_002`** now lists `nist-ai-rmf` as a recognized framework
  option.

### Changed

- **`SynthesizerOrchestrator.generate()`** tracks
  `generatorByPath` + `targetByPath` maps during the parallel
  batch so the provenance trace can record authoritative attribution.
  Records the maps for every post-pass output too (coworker
  overlay, cyclonedx-aibom, oscal-component, oscal-ssp-fragment,
  provenance-trace).
- **`src/util/wizard-audit.ts`** routes through
  `appendChainedEntry()` when chain mode is enabled; falls back
  to plain JSONL otherwise.
- **Makefile + package.json**: new `verify-audit-log` target /
  script.

### Compatibility

- **No breaking changes.** Every new target is opt-in via
  `--targets` / `EMBEDIQ_OUTPUT_TARGETS`; every new env var is
  opt-in via `=true`. Existing goldens regenerate byte-identically
  when no v4.0 targets are selected.
- Mixing plain JSONL with chain-mode entries against the same
  audit file produces a broken chain — operators rotate the file
  when switching modes.

### Test suite

**+192 tests, +16 test files.** Full suite **1285 passing across
89 files** (was 1093/73 at v3.7 commit point).

Type-check clean except for the pre-existing `eng_manager`
literal-vs-`UserRole` error from commit `3a0b719` (unrelated).
docs-lint clean across the markdown surface.

## [3.7.0] — Drop-in enterprise wins

Three additive wins surfaced during the v4.0 restructure conversation,
plus the SQL-backend round-trip that closes the per-schedule
`alertOnFailureStreak` story. Total effort ~1 week. Zero strategic
commitment to v4.0 — the work is independently valuable.

### Added

- **Karpathy-guidelines built-in skill**
  ([`src/skills/built-in/karpathy-guidelines.ts`](src/skills/built-in/karpathy-guidelines.ts))
  packaging four behavioral principles (Think Before Coding · Simplicity
  First · Surgical Changes · Goal-Driven Execution) as a composable
  skill. MIT-licensed content from
  [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills),
  attribution preserved in the generated rule file. Opt-in via skill
  composition; does not affect existing golden archetypes. The fifth
  built-in skill alongside `healthcare.full`, `healthcare.rag`,
  `finance.full`, and `education.full`.
- **Autopilot failure-streak monitor**
  ([`src/autopilot/failure-monitor.ts`](src/autopilot/failure-monitor.ts))
  emits a new `autopilot:alerting` event when a schedule's consecutive-
  failure count first crosses its threshold. One-shot semantics — does
  not re-fire on subsequent failures within the same streak; a single
  success resets the counter so the next streak can alert again.
- **`alertOnFailureStreak` per-schedule field** on `AutopilotSchedule`
  + `ScheduleCreateInput`. Overrides the global default. Set to `0` to
  disable alerting for a specific schedule. **Round-trips through all
  three backends** (JSON, SQLite, Postgres) — the shared contract suite
  proves it. SQLite uses a `pragma_table_info` probe +
  `ALTER TABLE ADD COLUMN` for existing-deployment upgrades; Postgres
  uses native `ALTER TABLE ADD COLUMN IF NOT EXISTS`.
- **`EMBEDIQ_AUTOPILOT_ALERT_FAILURE_STREAK`** env var sets the global
  default failure-streak threshold (default `3`). Per-schedule
  `alertOnFailureStreak` wins when set. Set to `0` globally to disable
  failure-streak alerting across the deployment.
- **`autopilot:alerting`** event in the typed `WizardEvents` map.
  Auto-included in the default webhook subscriber notification set, so
  Slack / Teams / generic chat formatters render it as a high-visibility
  alert with schedule name, failure count, most-recent-error, and
  last-success timestamp.
- **`wizard-viewer`** role — new lowest tier in the RBAC hierarchy.
  Read-only access to generations, audit log, skills, autopilot status.
  Common fit for compliance auditors who need to verify evidence
  without touching anything.
- **`wizard-contributor`** role — explicit name for the middle tier
  (equivalent to legacy `wizard-user`). Both names work identically; the
  new name surfaces in OIDC group mappings and docs alongside the
  legacy alias.

### Changed

- **`requireRole()`** now uses a strict three-tier hierarchy
  (`wizard-viewer` < `wizard-user` ≡ `wizard-contributor` <
  `wizard-admin`) instead of literal-match-plus-admin-override. Higher
  tiers strictly include lower-tier permissions. Unknown roles outside
  the EmbedIQ namespace (custom OIDC group emitters) fall back to the
  legacy literal-match path, preserving backwards compatibility for
  custom strategies.
- **WS upgrade gate** in `src/web/server.ts` now allows any tier ≥
  viewer rather than requiring `wizard-user` or `wizard-admin`
  literally — viewers can now subscribe to event streams.
- **`DEFAULT_NOTIFICATION_EVENTS`** in the webhook formatter now
  includes `autopilot:alerting`. New chat-summary case in the Slack /
  Teams formatters renders the alert with structured fields.

### Compatibility

- **No breaking changes.** Existing deployments continue working
  unchanged:
  - The legacy `wizard-user` role is preserved verbatim as a
    contributor-tier alias — basic / OIDC / proxy-header strategies
    that emit it keep working.
  - Custom roles outside the EmbedIQ namespace fall back to literal-
    match.
  - Default failure-streak threshold of 3 is opinionated but
    operationally safe; set `EMBEDIQ_AUTOPILOT_ALERT_FAILURE_STREAK=0`
    to disable globally if needed.
  - All shipped goldens regenerate byte-identically (karpathy-guidelines
    is opt-in via skill composition, not auto-applied).

### Test suite

21 new tests (failure-monitor unit, autopilot runner alerting
integration, three-tier RBAC scenarios, karpathy-skill registration,
contract suite extensions for `alertOnFailureStreak` round-trips
across JSON/SQLite/Postgres). Full suite **1120 passing across 74
files** (was 1093/73).

## [3.6.1] — Session payload-encryption key rotation

Closes the last remaining v3.2 follow-up. `PayloadCipher` now accepts
a current key plus any number of decrypt-only previous keys, so
operators can rotate `EMBEDIQ_SESSION_DATA_KEY` without invalidating
in-flight sessions.

### Added

- **`EMBEDIQ_SESSION_DATA_KEY_PREV`** env var — single hex string or
  comma-separated list of previous keys. Used for decryption only;
  new writes always use the active `EMBEDIQ_SESSION_DATA_KEY`. Each
  entry must decode to a 32-byte AES key.
- **`PayloadCipher.fromHexKeys(active, previous[])`** — explicit
  multi-key constructor for tests and callers that don't read from
  the environment. `fromHexKey(hex)` remains as a single-key
  back-compat shim.
- **`PayloadCipher.previousKeyCount`** — diagnostics getter, useful
  in operator scripts checking which replicas have a PREV configured.
- **Rotation runbook** in `docs/operator-guide/session-backends.md` —
  the canonical phase-1 / phase-2 / phase-3 flow plus the multi-step
  rotation case and audit / compliance notes.

### Changed

- **`PayloadCipher.decrypt()`** now walks every configured key (active
  first, then each previous in order) before throwing. On total
  failure the error message names how many keys were tried, so the
  operator sees "rotation may have removed the encrypting key
  prematurely" rather than a generic GCM auth-tag mismatch.

### Compatibility

- **No breaking changes.** Existing single-key deployments behave
  exactly as before — `EMBEDIQ_SESSION_DATA_KEY_PREV` is optional.
- All shipped goldens regenerate byte-identically.
- `PayloadCipher.fromHexKey(hex)` is preserved as a back-compat
  alias; the constructor still accepts a single key.

### Test suite

15 new tests targeting the rotation primitives (single-key
back-compat, single-step rotation, multi-step three-key chain,
malformed key rejection, comma-separated parsing, the natural
re-encrypt-on-write completion path). Full suite **1093 passing
across 73 files** (was 1078/72).

## [3.6.0] — SQL-backed autopilot store with multi-replica scheduling

Closes the second half of the SQL-backed multi-node story. The
autopilot store now has a database backend that mirrors the session
store's shape: a `SqlAutopilotDialect` interface with SQLite and
Postgres implementations behind it. Multiple scheduler replicas can
run concurrently without duplicate firings via **claim-and-advance**:
each tick atomically advances a due schedule's `next_run_at` from the
observed value to the next firing; only one replica's CAS succeeds.

### Added

- **`AutopilotStore` interface** (`src/autopilot/autopilot-store.ts`).
  Extracted from `JsonAutopilotStore` so both stores share one
  contract. New required method: `claimSchedule(id,
  expectedNextRunAt, newNextRunAt, now)` — the atomic CAS primitive
  used by the scheduler.
- **`DatabaseAutopilotStore`** + **`SqlAutopilotDialect`**
  (`src/autopilot/backends/database-store.ts`). Two-table schema —
  `embediq_autopilot_schedules` + `embediq_autopilot_runs`, both
  portable (TEXT/INTEGER only). Owns schedule ↔ row serialization
  (JSON columns for `targets`, `complianceFrameworks`, and
  `driftSummary`) so dialects stay thin.
- **`SqliteAutopilotDialect`** + **`PostgresAutopilotDialect`** —
  identical SQL surface, identical row shape. Postgres uses
  `RETURNING id` to detect CAS success; SQLite uses `info.changes ===
  1`.
- **`selectAutopilotStore()`** factory (`src/autopilot/factory.ts`).
  Env-driven selection: `EMBEDIQ_AUTOPILOT_STORE=json-file` (default)
  / `database`, with `EMBEDIQ_AUTOPILOT_DB_DRIVER=sqlite|postgres`
  and `EMBEDIQ_AUTOPILOT_DB_URL` mirroring the session-store pattern.
  Postgres requires the optional `pg` package; selecting the driver
  without it throws a clear install hint.
- **Shared contract test suite** (`tests/helpers/autopilot-store-contract.ts`).
  Same suite — schedule CRUD, claim-and-advance (including a
  five-way parallel race verifying exactly one winner), runs CRUD,
  driftSummary/error round-trip — runs against all three backends:
  JSON, SQLite, Postgres (pg-mem). 39 contract tests per backend
  shape locked in.
- **Operator-guide updates** — `deployment.md` Scaling section gets
  the multi-replica autopilot env-var set. `08-autopilot.md` "Known
  limitations" updated.

### Changed

- **Scheduler tick path** (`src/autopilot/scheduler.ts`) — now calls
  `store.claimSchedule(...)` for each due schedule and skips on
  `null` (another replica won). The runner no longer advances
  `nextRunAt` when invoked from the scheduler (new
  `RunOptions.advanceNextRun` defaults to `true` for webhook/manual
  triggers).
- **`createApp()` is now async** because the autopilot factory must
  dynamically import `pg` when Postgres is selected. All 27 test
  call sites updated. No production caller change beyond `await`.
- **`JsonAutopilotStore`** now implements the new `AutopilotStore`
  interface (no behavioral change — `claimSchedule` is a CAS-on-
  equality check against the in-memory schedule list).

### Compatibility

- `EMBEDIQ_AUTOPILOT_STORE` defaults to `json-file` — operators using
  autopilot today see zero behavioral change.
- The existing `EMBEDIQ_AUTOPILOT_DIR` env var still controls the
  JSON-store directory; `EMBEDIQ_AUTOPILOT_DB_*` are new and only
  apply when `EMBEDIQ_AUTOPILOT_STORE=database`.
- Goldens untouched — synthesizer surface unchanged.

### Test suite

1078 passing across 72 files (was 1039/71). 39 new contract tests
exercising the three backends.

## [3.5.0] — Postgres-backed session store (multi-node-ready)

The next v3.2 follow-up. Web replicas can now share a Postgres-backed
session store and scale horizontally with no sticky-session
configuration. The four existing single-node backends (`none`,
`json-file`, `database`+`sqlite`) continue to work unchanged.

### Added

- **`PostgresDialect`** (`src/web/sessions/backends/postgres-dialect.ts`)
  implementing the existing `SqlDialect` interface — same
  `embediq_sessions` schema, same row shape as SQLite, same contract
  test suite. Uses `INSERT ... ON CONFLICT(session_id) DO UPDATE`
  (Postgres 9.5+) so upserts are a single round-trip. All queries are
  parameterized — no string concatenation.
- **Structural `PgPoolLike`** type — the dialect accepts anything with
  `{ query, end }`. The concrete `pg.Pool` is the production use case;
  `pg-mem` provides the same shape for in-memory tests.
- **`pg` + `@types/pg`** added as `optionalDependencies`. Selecting the
  Postgres driver without installing them throws a clear error naming
  the install command.
- **`pg-mem`** added as a `devDependency` for the test suite — same
  contract suite the SQLite dialect runs against, plus four dialect-
  specific tests (schema creation, upsert idempotency, filtered list).
- **Operator-guide updates** — `deployment.md` now includes a Multi-
  Node Postgres section with the exact env-var set, the Dockerfile
  snippet for installing `pg` in the runtime image, and the
  single-replica pinning guidance for the still-JSON autopilot store.

### Changed

- **`SqlDialect` interface widened to async** — every method now
  returns `Promise<T>` so the same interface fits both sync drivers
  (`better-sqlite3`) and async drivers (`node-postgres`).
  `ensureSchema()` is replaced by `init()`, called lazily by the
  backend on first use (and exposed for explicit pre-warming).
- **`SqliteDialect`** updated to satisfy the async interface — the
  underlying calls remain synchronous, only the declared return types
  changed.
- **`DatabaseBackend`** now lazy-inits the dialect (one shared
  promise across all callers) and `await`s every dialect call.
- **Session-backend tests** (`tests/unit/database-backend-sqlite.test.ts`)
  continue to pass byte-for-byte. New `database-backend-postgres.test.ts`
  runs the same contract suite against `pg-mem`.

### Compatibility

- **No new mandatory env vars.** Operators using `EMBEDIQ_SESSION_BACKEND=database`
  with the default `sqlite` driver see zero behavioral change.
- **No goldens regenerated** — synthesizer untouched.
- **Autopilot store stays single-node JSON-file for now.** SQL-backed
  autopilot is the next pickup; multi-node deployments should pin the
  scheduler to a single replica today.

### Test suite

1039 passing across 71 files (was 1008/70).

## [3.4.0] — Arbitrary cron + timezone-aware autopilot scheduling

### Added — Arbitrary cron + timezone-aware autopilot scheduling

The v3.2 follow-up item that's been outstanding since v3.2.0 close.
Autopilot schedules previously accepted only the four UTC presets;
they now also accept a standard 5-field cron expression plus an
optional IANA timezone for true wall-clock scheduling.

- **`cadence`** now accepts either a preset (`@hourly` / `@daily` /
  `@weekly` / `@monthly`) **or** a standard 5-field cron expression
  (`minute hour day-of-month month day-of-week`). Wildcards (`*`),
  ranges (`1-5`), lists (`1,3,5`), and steps (`*/15`, `0-30/5`) are
  all supported. Month / day-of-week alias names (`JAN-DEC` /
  `SUN-SAT`) accepted case-insensitively. POSIX day-of-month /
  day-of-week OR-semantics (when both fields are restricted, the
  schedule fires when *either* matches).
- **New `timezone`** field on `AutopilotSchedule` and
  `ScheduleCreateInput`. Any IANA timezone identifier
  (`America/Los_Angeles`, `Asia/Kolkata`, `UTC`, …). Pairs with cron
  expressions for wall-clock scheduling; ignored for presets. With no
  timezone, cron expressions are interpreted in UTC.
- **DST handled correctly.** "Daily 09:00 in `America/Los_Angeles`"
  fires at 16:00 UTC during PDT and 17:00 UTC during PST — the
  evaluator converts each firing through `Intl.DateTimeFormat`.
  Spring-forward gaps resolve to the first valid instant after the
  jump; fall-back overlaps choose the first occurrence.
- **REST validation** — `POST /api/autopilot/schedules` rejects
  unparseable cron expressions and unknown timezones with `400` and
  the underlying error message.
- **Pure TypeScript** — no new runtime dependency. Built on
  `Intl.DateTimeFormat` from Node 18+ full-ICU.
- **41 new tests** — 29 cron parser (valid + invalid + DST + tz),
  2 store-level (cron + timezone round-trip), 4 REST validator
  (cron accepted, tz accepted, malformed cron rejected, unknown tz
  rejected) plus the existing autopilot integration coverage. Full
  suite: 1008 passing across 70 files (was 973/69).

### Compatibility

- All existing `@hourly` / `@daily` / `@weekly` / `@monthly` schedules
  continue to fire on UTC boundaries with no change to their
  `nextRunAt`. The `CADENCE_VALUES` export is kept as an alias of the
  new `CADENCE_PRESETS` so external callers still compile.
- All shipped goldens regenerate byte-identically — no synthesizer
  surface changed.

## [3.3.1] — Local AI Integration Layer (Phases 2 + 3)

Bundles two phases of the v3.3 Local AI Integration Layer together —
the industry-agnostic RAG scaffold (Phase 2) and the local router
with confidence escalation (Phase 3). Both ship together so the
PHI-safe routing differentiator lands alongside the runnable
retrieval pipeline.

See the per-phase notes below for full detail.

### Added — v3.3 Local Router with Confidence Escalation

Third phase of v3.3, and the headline PHI-safe-routing differentiator.
Generates a runnable Express dispatch service that decides per request
whether to answer locally (Ollama) or escalate to a hosted LLM —
*always* through a PHI redactor on healthcare profiles, and optionally
through a confidence self-evaluation step that re-routes low-quality
local answers.

- **Three new wizard questions** (`TECH_019`/`020`/`021`). All gated on
  `TECH_013=true` plus a technical role.
  - `TECH_019` — opt into the local router (yes/no).
  - `TECH_020` — which external LLM APIs are available for escalation
    (multi-select: Anthropic / OpenAI). Leaving both unchecked keeps
    dispatch local-only — escalation returns 501.
  - `TECH_021` — enable confidence-based escalation (yes/no).
- **Three new optional `UserProfile` fields** — `routerEnabled`,
  `externalApis`, `confidenceEscalation`. All undefined for archetypes
  without `TECH_019=true`, preserving byte-identity of existing
  goldens.
- **New `TargetFormat.LOCAL_ROUTER`** (`local-router`). Auto-included
  when `profile.routerEnabled === true`; never in `DEFAULT_TARGETS`.
- **New `LocalRouterGenerator`**
  (`src/synthesizer/generators/local-router.ts`). Emits a runnable
  Express service under `router/`:
  - `router/package.json`, `router/.env.example`, `router/README.md`
  - `router/src/server.ts` — `POST /route` endpoint
  - `router/src/classifier.ts` — token-count + escalation-hint signals
  - `router/src/local-client.ts` — Ollama wrapper
  - `router/src/hosted-client.ts` — Anthropic / OpenAI calls (or a
    `501` stub when no `externalApis` are configured)
  - `router/src/audit.ts` — JSONL audit log with HMAC-hashed prompts
  - `router/src/redactor.ts` — **HIPAA-only**; runs before any
    escalation. Catches SSN, MRN, phone, email, DOB, ZIP5.
  - `router/src/confidence.ts` — **opt-in**; local self-evaluation
    triggers a redacted re-dispatch below `ROUTER_CONFIDENCE_THRESHOLD`.
  - `ROUTER_RUNBOOK.md` at project root — per-framework hardening
    checklist.
  - `.claude/rules/router-conventions.md` — path-scoped to `router/**`.
- **Explicit chaining wired into Aider / Continue.dev / Zed AI** when
  `routerEnabled` plus an `externalApis` entry are set. Aider gets
  `model: anthropic/claude-sonnet-4-6` (or `openai/gpt-4o`) for heavy
  edits and `weak-model: ollama/<defaultLocalModel>` for commit
  messages / repo-map summaries. Continue.dev surfaces the hosted
  model alongside the local Ollama entries (autocomplete stays local).
  Zed AI registers the hosted provider as a selectable backend while
  keeping the local default model. Profiles without `routerEnabled`
  see no change.
- **New `healthcare-router-developer` golden archetype** (42 files) —
  locks healthcare + local AI + router + confidence + Anthropic
  end-to-end, including the HIPAA redactor, chained Aider config,
  and per-framework runbook content.

### Added — v3.3 RAG Scaffold (industry-agnostic)

Second phase of v3.3. Extends the wizard from "configure local AI" to
"configure local AI **and** generate a runnable retrieval pipeline"
when the user opts in. Industry-agnostic — the same generator emits a
FHIR-aware variant for healthcare and a plain-text variant for every
other industry, and emits one path-scoped compliance rule file per
active framework on the profile.

- **New `TargetFormat.RAG_SCAFFOLD`** (`rag-scaffold`). Auto-included
  whenever `profile.localAiEnabled === true` (alongside the four
  local-AI targets). Never emitted for BA/PM/exec roles.
- **New `RagScaffoldGenerator`** (`src/synthesizer/generators/rag-scaffold.ts`).
  Emits a small runnable RAG application under `rag/`:
  - `rag/README.md`, `rag/package.json` (or `rag/pyproject.toml` for
    Python-only stacks), `rag/.env.example`
  - `rag/src/chunker.ts` (or `.py`) — **FHIR-aware** for healthcare
    (preserves Patient / Observation / Encounter resource boundaries),
    **plain-text** for every other industry
  - `rag/src/embedder.ts` — local Ollama `nomic-embed-text` by default
  - `rag/src/store.ts` — SQLite-VSS with at-rest-encryption guidance
  - `rag/src/audit.ts` — HMAC-hashed query logging (never stores raw
    queries or chunk content)
  - `rag/src/cli.ts` — `index <dir>` + `query <text>` commands
  - `RAG_RUNBOOK.md` at project root — setup, smoke test,
    industry-aware compliance obligations, production-hardening
    checklist with per-framework items
- **Per-framework compliance rules.** One file under `.claude/rules/`
  per active framework on `profile.complianceFrameworks`:
  - `rag-hipaa-compliance.md` (HIPAA) — PHI handling, BAA, six-year
    audit retention per §164.316(b)(2), 45 CFR 164.514 de-identification
  - `rag-pci-compliance.md` (PCI-DSS) — never index full PANs, SAD
    prohibition, CDE network segmentation, one-year audit retention
  - `rag-soc2-compliance.md` (SOC 2) — Trust Services Criteria
    references (CC6.x, CC7.2, CC8.1, C1.x), change management, access
    reviews
  - `rag-ferpa-compliance.md` (FERPA) — education-record vs
    directory-information distinction, parental consent rules
  - `rag-conventions.md` (fallback) — generic best practices for
    profiles with no active frameworks
- **New `healthcare.rag` built-in skill** — trimmed companion to the
  generator. Carries vector-dump DLP patterns and RAG-runtime ignore
  patterns specific to healthcare. Registered for `/api/skills`
  discovery; not auto-composed (composition wiring is a follow-up).
- **New `healthcare-rag-developer` golden archetype** (30 files) —
  locks the FHIR-aware chunker + HIPAA rule + HIPAA runbook variant
  end-to-end.

### Changed

- The three pre-existing local-AI archetypes (`local-ai-developer`,
  `local-ai-enterprise`, `dotnet-developer`) now also emit the RAG
  scaffold — they all have `localAiEnabled: true`. Each gets the
  plain-text chunker variant + `rag-conventions.md`. File counts:
  `local-ai-developer` 14 → 24, `local-ai-enterprise` 15 → 25,
  `dotnet-developer` 13 → 23.

### Compatibility

- All non-local-AI archetypes (`minimal-developer`,
  `agents-md-developer`, `hipaa-developer-strict`,
  `consulting-engagement-default`, `healthcare-bpo-strict`) regenerate
  byte-identically — RAG only ships when `localAiEnabled === true`.
- TECH_001 / TECH_005 / wizard question set unchanged.
- No new mandatory wizard questions.

## [3.3.0] — Local AI Integration Layer (Phase 1)

First phase of v3.3 — extends EmbedIQ from "configures hosted-model
agents" to "configures hosted + local AI from one interview." Plus
closes a language-coverage gap that pre-dated v3.3 but ships here.

### Added — Local-Model Wizard Support

The wizard now configures Continue.dev, Aider, Zed AI, and Ollama
when the user opts into local AI (`TECH_013` yes) and picks their
IDE integrations.

- **Three new wizard questions** (`TECH_016`/`017`/`018`) — Ollama
  model picks, IDE integrations, default model for autocomplete.
  Gated on `TECH_013=true` plus a technical role; independent of
  team size and primary IDE. Total wizard questions: 71 → 74.
- **Four new generators**:
  - `continue-dev.ts` → `.continue/config.json` with selected models,
    default-as-tab-autocomplete, embeddings provider, telemetry off.
  - `aider.ts` → `.aider.conf.yml` + `.aiderignore`. Default model
    points at `ollama/<defaultLocalModel>`, test/lint commands
    inferred per language, auto-commits disabled. `.aiderignore`
    picks up HIPAA / PCI patterns when those frameworks are active.
  - `zed-ai.ts` → `.zed/settings.json` registering an Ollama provider.
  - `ollama-setup.ts` → root `OLLAMA_SETUP.md` runbook with install
    commands per OS, `ollama pull` commands for selected models,
    hardware-tier tuning notes, IDE wiring notes, end-to-end
    validation, and a HIPAA reminder when applicable.
- **Four new `TargetFormat` values**: `continue-dev`, `aider`,
  `zed-ai`, `ollama`. Auto-included by the orchestrator when
  `profile.localAiEnabled` is true (per-IDE gating via
  `profile.ideIntegrations`). Selectable explicitly via `--targets`
  / `EMBEDIQ_OUTPUT_TARGETS` too. Never emitted for BA/PM/exec roles.
- **Four new optional `UserProfile` fields**: `localAiEnabled`,
  `ollamaModels`, `ideIntegrations`, `defaultLocalModel`. All
  absent when `TECH_013` is false, preserving existing golden
  configs byte-for-byte.
- **Two new golden archetypes**: `local-ai-developer` (small team,
  multi-IDE TS sandbox) and `local-ai-enterprise` (medium team,
  TS+Python, GPU hardware). Both score 100% with zero validator
  failures.

### Added — Language coverage (C# / Swift / Ruby)

Closes a pre-existing gap: the wizard's `TECH_001` question
accepted all 8 languages (TypeScript, Python, Java/Kotlin, Go,
Rust, C#/.NET, Swift, Ruby), but the rule generator only emitted
language-specific files for 5 of them.

- **New rule files**: `.claude/rules/csharp.md`, `swift.md`,
  `ruby.md` — path-scoped, mirrors the existing pattern. C# rule
  covers net8/9 LTS, nullable reference types, async/await
  end-to-end, `IAsyncEnumerable` for streaming, `dotnet format`,
  `dotnet test`. Swift covers Swift Concurrency, value-types-by-
  default, `swift-format lint --strict`. Ruby covers
  `frozen_string_literal`, keyword args, `rubocop`, `bundle exec
  rake test`.
- **Extended Aider test/lint inference** for: C# (`dotnet test` /
  `dotnet format --verify-no-changes`), Swift (`swift test` /
  `swift-format lint --strict --recursive .`), Ruby
  (`bundle exec rake test` / `bundle exec rubocop`); plus Java
  lint (`mvn checkstyle:check`).
- **Three new `TECH_005` build-tool options**: `dotnet`, `swift_pm`,
  `bundler`.
- **New golden archetype**: `dotnet-developer` — C# developer on a
  small enterprise team running Continue.dev + Aider against local
  Ollama models. Locks in csharp.md emission and dotnet test/format
  wiring. Scores 100% with zero validator failures.

### Compatibility

- All eight pre-existing golden archetypes regenerate byte-identically.
- No `TECH_013` answer = no local-AI fields on the profile = no
  local-AI generators fire = output unchanged for non-local-AI users.
- `TECH_001` wizard options unchanged; `TECH_005` only adds new
  entries without renaming or removing existing ones.

### Tests

919/919 passing across 67 test files (was 871/65 before this release).

- 23 new unit tests for local-AI generators
- 22 new unit tests for language rule coverage (all 8 languages)
- 4 new Aider command-inference tests (C#/Swift/Ruby/Java-lint)
- 3 new archetypes hit the existing `evaluator.test.ts` end-to-end test

### Coming next in v3.3

- **Healthcare RAG Pipeline** — HIPAA-aware retrieval scaffold
  (chunker, embeddings, SQLite-VSS store) for healthcare + local-AI
  profiles.
- **Local Router with Confidence Escalation** — the PHI-safe
  routing headline differentiator. Local classifier routes simple
  tasks to the local model; escalates complex tasks to Claude/OpenAI
  only after PHI redaction.

## [3.2.2] — GTM Enablement

Three deliverables that turn the existing evaluation framework and
positioning work into client-presentable assets. The eval framework
gates internal quality today; this release makes the same data
presentable externally for sales conversations, procurement, and
client deliverables. Pure additions — no behavior changes to the
core wizard or generators.

### Added
- **Customer-facing HTML scorecards.** `--format scorecard` turns
  `npm run evaluate` or `npm run benchmark` into a standalone HTML
  scorecard suitable for a sales email, audit packet, or compliance
  reviewer. Two layouts (`full` with optional multi-archetype TOC;
  `email-safe` table-based for email clients), two themes (`light`,
  `dark`), white-label logo embed via `--scorecard-logo`,
  side-by-side benchmark comparison, deterministic output, audit-
  stamped provenance footer. Optional PDF output via `--format pdf`
  using puppeteer as an optional peer dependency.
- **Healthcare BPO deployment runbook
  ([`docs/HEALTHCARE-BPO-DEPLOYMENT.md`](docs/HEALTHCARE-BPO-DEPLOYMENT.md)).**
  Synthesis runbook for healthcare BPOs and regulated services
  firms — two deployment topologies (air-gapped single-node,
  controlled-outbound), seven-step setup walking through HIPAA pack
  resolution, encrypted SQLite sessions, OIDC + RBAC, autopilot +
  compliance feedback loop with HMAC verification, six-year audit
  retention, optional per-engagement scoping, and customer-facing
  scorecard for client deliverables. Includes a BAA-survivable
  evidence checklist mapping eight common auditor questions to the
  artifacts EmbedIQ produces.
- **Industry case-study fixtures.** Two new golden archetypes
  prospects can run end-to-end:
  - `healthcare-bpo-strict` — tech-lead persona at a healthcare BPO
    claims platform, full HIPAA + strict tier, TypeScript + Python.
    16 generated files.
  - `consulting-engagement-default` — developer persona at a systems
    integrator, SaaS + SOC 2 + audit logging, balanced security,
    multi-agent target set (Claude + AGENTS.md + Cursor). 16
    generated files.
- **Scorecard renderer module** (`src/evaluation/scorecard-renderer.ts`
  + `scorecard-template.ts`) — pure HTML+CSS templates, deterministic
  output, inline CSS only, no external assets, optional peer-dep
  puppeteer for PDF.
- **CLI flags** for the scorecard format: `--scorecard-title`,
  `--scorecard-subtitle`, `--scorecard-theme`, `--scorecard-layout`,
  `--scorecard-logo`, `--scorecard-include-failures`.

### Tests
- 40 new tests across the scorecard renderer (25 unit + 15 end-to-end
  integration) covering themes, layouts, logo embed, benchmark
  side-by-side, deterministic output, error paths.
- Both new archetypes hit the existing `evaluator.test.ts`
  end-to-end test and score 100% with zero validator failures.

### Compatibility
- All five pre-existing golden archetypes regenerate byte-identically.
- New optional peer dependency (`puppeteer`) only needed for
  `--format pdf`; HTML scorecard works with zero new dependencies.

## [3.2.1] — Operational Consolidation

Five v3.2.x follow-ups landing as a single patch release. All non-gated
and backward-compatible — no env-var migration, no golden-config
changes, no behavior shift unless you opt in.

### Added
- **GitLab adapter for git PR integration.** `EMBEDIQ_GIT_PROVIDER=gitlab`
  selects a `GitLabAdapter` that uses REST v4 with atomic
  multi-action commits via the `actions[]` payload, base-tree
  pre-walk, and delete-then-recreate branch idempotency. Project
  paths support nested groups (`group/subgroup/project`).
  Self-hosted GitLab via `EMBEDIQ_GIT_API_BASE_URL` (adapter appends
  `/api/v4`).
- **Bitbucket Cloud adapter for git PR integration.**
  `EMBEDIQ_GIT_PROVIDER=bitbucket` selects a `BitbucketAdapter` that
  uses REST 2.0 with multipart `/src` commits and Bearer-token auth
  via Repository / Workspace Access Tokens (app-password Basic auth
  is not supported). All three platforms (GitHub, GitLab, Bitbucket)
  now share the same `GitPlatform` interface and PR-template flow.
- **HMAC signature verification on inbound compliance webhooks.**
  Per-adapter opt-in via `EMBEDIQ_COMPLIANCE_SECRET_<ADAPTER>` env
  vars. Drata's `X-Drata-Signature`, Vanta's `X-Vanta-Signature`,
  and the generic adapter's `X-EmbedIQ-Signature` (`<hex>` or
  `sha256=<hex>`) are verified against `HMAC-SHA256(secret,
  raw-body)`. Unset → verification skipped (preserves existing
  shared-secret gateway as the only trust layer). Adds a second
  defense layer for high-assurance deployments.
- **docs-lint script.** `scripts/docs-lint.ts` (and `make docs-lint`)
  enforces the `<!-- audience: public | private -->` directive on
  every markdown file, scans public-tagged files for leak markers
  (private repo URLs, internal-only framework references), and
  validates cross-link targets exist. Runs in CI via the
  `tests/integration/docs-lint.test.ts` suite. Backbone for the
  dual-repo sanitize-and-publish flow.
- **Per-engagement state scoping.** `EMBEDIQ_ENGAGEMENT_ID` env var
  nests default session, autopilot, and audit-log paths under
  `.embediq/engagements/<id>/`, enabling consulting firms and
  systems integrators to run one process per client engagement
  out of the same checkout without state leakage. Strict ID
  sanitization rejects path traversal. Explicit
  `EMBEDIQ_SESSION_DIR` / `EMBEDIQ_SESSION_DB_URL` /
  `EMBEDIQ_AUTOPILOT_DIR` always win over engagement scoping —
  operator-set paths are never modified. Audit-log entries
  auto-tagged with `engagementId` via request context with direct
  env fallback for CLI mode. New
  [`docs/CONSULTING-FIRM-DEPLOYMENT.md`](docs/CONSULTING-FIRM-DEPLOYMENT.md)
  runbook covers the full deployment pattern.

### Changed
- `WizardAuditEntry` gained an optional `engagementId` field, auto-
  enriched from request context or directly from
  `EMBEDIQ_ENGAGEMENT_ID`. Absent on entries written before this
  release; explicit values on the entry override context.
- `RequestContext` gained an `engagementId?: string` field populated
  by `createRequestContext()` from `resolveEngagementId()`.

### Fixed
- `docs/user-guide/11-compliance-webhooks.md` security section
  incorrectly claimed HMAC verification was a future roadmap item;
  it's been shipped since the HMAC commit and is now documented
  accurately.

## [3.2.0] — Enterprise Operations & Integration

Closes v3.2. Five priorities shipped: interrupt-and-resume wizards, autopilot
scheduled regeneration, GitHub PR integration, outbound notification webhooks,
and compliance platform inbound webhooks.

### Added
- **Interrupt & resume wizard flows.** `?session=<id>` resume URLs;
  server-side computation of next dimension/question from partial answers;
  welcome-back banner with progress totals; partial profile reconstruction;
  `contributors` map showing who answered what (multi-stakeholder audit
  attribution). `AdaptiveEngine.serialize()` / `restore()` for headless
  replay.
- **Drift detection CLI.** `npm run drift -- --target <dir>
  (--answers <yaml> | --archetype <id>)` with six classifications:
  match / missing / modified-by-user / modified-stale-stamp /
  version-mismatch / extra. Stamp-aware — distinguishes post-generation
  user edits from entirely hand-authored files. Exit codes 0 / 1 / 2 for
  CI gating.
- **Autopilot scheduled regeneration.** In-process scheduler with
  `@hourly` / `@daily` / `@weekly` / `@monthly` cadence presets (UTC);
  JSON-file store at `EMBEDIQ_AUTOPILOT_DIR`; REST CRUD under
  `/api/autopilot/schedules`; manual trigger webhook at
  `/api/autopilot/webhook/:scheduleId`; per-run records with four status
  classifications; optional `EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET` shared
  secret. Opt-in via `EMBEDIQ_AUTOPILOT_ENABLED=true`.
- **GitHub PR integration.** `--git-pr` CLI flag uses the GitHub
  REST v3 Git Data API for atomic multi-file commits (no local working
  tree). PR template includes profile summary, per-generator file list,
  validation results, contributor attribution, and drift context. Env
  vars: `EMBEDIQ_GIT_PROVIDER` / `EMBEDIQ_GIT_REPO` / `EMBEDIQ_GIT_TOKEN`
  / `EMBEDIQ_GIT_BASE_BRANCH` / `EMBEDIQ_GIT_API_BASE_URL`. GitHub
  Enterprise supported via the base URL override.
- **Outbound notification webhooks.** Event-bus subscriber auto-
  detects Slack (Block Kit), Microsoft Teams (MessageCard), and generic
  JSON formats from the target host. Per-URL event filter via repeated
  `?events=…&events=…` query params. Per-target failure isolation with
  a 3-second timeout so a slow endpoint never blocks the wizard.
  `EMBEDIQ_WEBHOOK_URLS` to enable, `EMBEDIQ_WEBHOOK_FORMAT` to override.
- **Compliance platform inbound webhooks.** Adapters for Drata,
  Vanta, and a generic format translate external findings into autopilot
  run triggers. `POST /api/autopilot/compliance/:adapterId` fires a run
  for every enabled schedule whose `complianceFrameworks` list matches
  the event's framework. Framework normalization (`soc_2` → `soc2`,
  `pci-dss` → `pci`, etc.) ensures platform identifiers match.

### Changed
- `AutopilotSchedule` gained an optional `complianceFrameworks: string[]`
  field used by the inbound compliance webhook route to match events to
  schedules.
- `SerializedAnswer` gained an optional `contributedBy` field, stamped
  server-side from the request context on every `/api/sessions/:id` PATCH.
  The client cannot forge attribution.

### Fixed
- `WebhookSubscriber.flush()` now drains the microtask queue before
  awaiting in-flight POSTs, so tests that emit and immediately flush
  see every delivery complete.

## [3.1.0] — Strategic Differentiation

Three priorities shipped: evaluation framework, multi-agent output
targeting, and the composable skills system.

### Added
- **Evaluation framework.** Golden-config replay harness under
  `src/evaluation/` with three shipped archetypes
  (`minimal-developer`, `hipaa-developer-strict`,
  `agents-md-developer`). `npm run evaluate` scores generated output
  against goldens via a stamp-aware diff scorer (markdown headings +
  Jaccard, JSON/YAML structural walk with unordered permission-array
  sets, text Jaccard, binary hash). Per-file, per-dimension,
  per-generator scores. `npm run benchmark` scores externally-produced
  configuration files against the same goldens. CLI: text/JSON output,
  baseline regression detection, CI-friendly exit codes.
- **Multi-agent output targeting.** `TargetFormat` enum
  (`claude`, `agents-md`, `cursor`, `copilot`, `gemini`, `windsurf`)
  and five new generators producing cross-agent `AGENTS.md`,
  `.cursor/rules/*.mdc` with MDC frontmatter, `.github/copilot-
  instructions.md` + glob-scoped `.github/instructions/*.instructions.md`,
  `GEMINI.md`, and `.windsurfrules`. Target selection via
  `EMBEDIQ_OUTPUT_TARGETS` env var or `--targets` CLI flag. Default
  remains `claude` for backward compatibility.
- **Composable skills system.** `Skill` interface as the new
  lower-level primitive (id, name, version, tags, source, requires,
  conflicts, payload fields). `SkillComposer` merges N skills into a
  `ComposedSkillPayload` with first-wins conflict resolution.
  `SkillRegistry` singleton with built-in registration plus async
  external loading from `EMBEDIQ_SKILLS_DIR` (each subdirectory with a
  `SKILL.md` becomes one skill). Web API: `GET /api/skills` and
  `GET /api/skills/:id`.

### Changed
- `SetupConfig` gained an optional `targets?: TargetFormat[]` field.
  Omitted means Claude-only (preserves v2.x default).
- `ConfigGenerator` interface gained a `target: TargetFormat` field
  for target-aware orchestrator filtering.

## [3.0.0] — Enterprise Runtime Foundation

### Added
- **Event bus architecture.** Typed in-memory event bus with
  nine events across engine, synthesizer, and web layers. Five
  subscribers: `AuditSubscriber`, `MetricsCollector`,
  `StatusReconciler`, `OtelSubscriber`, `WebSocketHub`. Frontend live
  progress streaming within a 20 KB JS budget.
- **Multi-backend server-side sessions.** `SessionBackend`
  interface with `NullBackend` (zero-persistence default),
  `JsonFileBackend` (dev), and `DatabaseBackend` + `SqliteDialect`
  (production). TTL-governed, monotonic versioning, AES-256-GCM
  optional payload encryption, owner-gated HTTP surface, async dump
  export. Session-aware `/api/generate` merges body answers over
  session answers.

## [2.1.0] — Performance & Observability

### Added
- **Parallel generator execution (5A).** 12 generators run concurrently
  via `Promise.all()`; safe because `generate()` is pure.
- **Request context isolation (5B).** `AsyncLocalStorage` context per
  Express request carrying `requestId`, authenticated user, and
  timing. Downstream code calls `getRequestContext()` without
  parameter threading.
- **OpenTelemetry instrumentation (5C).** Optional instrumentation
  behind `EMBEDIQ_OTEL_ENABLED=true`. Per-request HTTP spans, per-
  generator child spans, three metrics (`embediq.files_generated`,
  `embediq.generation_runs`, `embediq.validations`). OTLP HTTP export.

## [2.0.0] — Enterprise Foundation

### Added
- **Test infrastructure (1A).** Vitest with v8 coverage.
- **Output validation (1B).** `OutputValidator` with eight check
  categories across universal and domain-specific rules.
- **Configuration versioning & drift detection (1C).** Diff analysis
  with conflict detection between EmbedIQ-managed and user-modified
  files.
- **Wizard audit trail (2A).** JSONL audit logging with seven event
  types, auto-enriched with request context.
- **Authentication & RBAC (2B).** Pluggable auth strategies (Basic,
  OIDC, Proxy Header). Roles: `wizard-user`, `wizard-admin`.
- **Rate limiting & TLS (2C).** Per-route rate limits; TLS via
  `EMBEDIQ_TLS_CERT` / `EMBEDIQ_TLS_KEY`.
- **Session persistence (2D).** Client-side AES-256-GCM encrypted
  checkpoints.
- **Configuration templates (2E).** Three shipped profile templates:
  `hipaa-healthcare`, `pci-finance`, `soc2-saas`.
- **Deployment (2F).** Production deployment via Docker, docker-
  compose, and Kubernetes with health/readiness probes.
- **Domain pack plugin architecture (3A–3C).** `DomainPack` typed
  interface, external plugin loading from a configurable directory,
  full three-layer integration (questions → QuestionBank, priorities
  → PriorityAnalyzer, DLP patterns and rule templates → hooks / rules
  / ignore / validation generators with deduplication).
- **Domain pack implementations (4A–4C).** Three built-in packs:
  healthcare (HIPAA / HITECH / 42 CFR Part 2), finance (PCI-DSS /
  SOX / GLBA / AML-BSA), education (FERPA / COPPA). Collectively:
  17 questions, 10 compliance frameworks, 18 DLP patterns, 8 rule
  templates, 20 ignore patterns, 13 validation checks.

[Unreleased]: https://github.com/asq-sheriff/embediq/compare/v3.6.1...HEAD
[3.6.1]: https://github.com/asq-sheriff/embediq/compare/v3.6.0...v3.6.1
[3.6.0]: https://github.com/asq-sheriff/embediq/compare/v3.5.0...v3.6.0
[3.5.0]: https://github.com/asq-sheriff/embediq/compare/v3.4.0...v3.5.0
[3.4.0]: https://github.com/asq-sheriff/embediq/compare/v3.3.1...v3.4.0
[3.3.1]: https://github.com/asq-sheriff/embediq/compare/v3.3.0...v3.3.1
[3.2.0]: https://github.com/asq-sheriff/embediq/releases/tag/v3.2.0
[3.1.0]: https://github.com/asq-sheriff/embediq/releases/tag/v3.1.0
[3.0.0]: https://github.com/asq-sheriff/embediq/releases/tag/v3.0.0
[2.1.0]: https://github.com/asq-sheriff/embediq/releases/tag/v2.1.0
[2.0.0]: https://github.com/asq-sheriff/embediq/releases/tag/v2.0.0
