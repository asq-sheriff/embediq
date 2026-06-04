<!-- audience: public -->

# Generated files reference

Every file EmbedIQ's synthesizer can emit, grouped by target family.
Each entry notes the path, the generator responsible, the role in the
target agent's config model, and any conditional-generation rules.

File generation is **target-aware** (see
[user-guide/05-multi-agent-targets.md](../user-guide/05-multi-agent-targets.md)).
A target that isn't in `EMBEDIQ_OUTPUT_TARGETS` / `--targets` emits
nothing. A target that *is* active may still skip individual files
when the profile's role or compliance posture makes them unnecessary
(e.g. non-technical roles skip hooks).

## Target: `claude` (default)

All files land under the project's `.claude/` subtree or the project
root.

| Path | Generator | Role | Conditional |
|---|---|---|---|
| `CLAUDE.md` | `claude-md` | Root instruction file Claude Code reads every session. | Always. |
| `.claude/settings.json` | `settings.json` | Model selection, hook declarations, feature flags. | Always. |
| `.claude/settings.local.json` | `settings.local.json` | Per-user overrides (permission tier, gitignored). | Always. |
| `.claude/rules/testing.md` | `rules` | Always-on testing rules. | Always for technical roles. |
| `.claude/rules/security.md` | `rules` | Always-on security rules. | Present when `profile.securityConcerns` is non-empty. |
| `.claude/rules/hipaa-compliance.md` | `rules` | HIPAA rules (path-scoped to `src/**`, `tests/**`). | `hipaa` in `complianceFrameworks`. |
| `.claude/rules/pci-compliance.md` | `rules` | PCI-DSS rules. | `pci` in `complianceFrameworks`. |
| `.claude/rules/typescript.md` | `rules` | Language rules (path-scoped). | `typescript` in `languages`. |
| `.claude/rules/python.md` / `javascript.md` / `go.md` / `java.md` / `rust.md` / `csharp.md` / `cpp.md` / `swift.md` / `ruby.md` / `sql.md` / `spark.md` | `rules` | Per-language rules, one per selected language (e.g. SQL → parameterized-query / migration guardrails; C++ → RAII + smart pointers; Spark → DataFrame-over-RDD). | Per-language trigger (`TECH_001`). |
| `.claude/rules/<domain>.md` | `rules` | Domain-pack rule templates. | Domain pack active + `requiresFramework` satisfied. |
| `.claude/commands/<name>.md` | `commands` | Slash-command prompts Claude Code exposes (`/review`, `/plan`, …). | Technical roles. |
| `.claude/agents/security-reviewer.md` | `agents` | Security review agent. | Security concerns present. |
| `.claude/agents/compliance-checker.md` | `agents` | Compliance check agent. | Compliance framework set. |
| `.claude/agents/code-reviewer.md` | `agents` | Generic code review agent. | Technical roles. |
| `.claude/agents/test-writer.md` | `agents` | Test-writing agent. | Technical roles. |
| `.claude/skills/sync-memory.md` | `skills` | Memory synchronization skill. | Technical roles. |
| `.claude/skills/impact-analysis.md` | `skills` | Impact-analysis skill. | Technical roles. |
| `.claude/hooks/command-guard.py` | `hooks` | Destructive-command guard (Python). | Technical roles. |
| `.claude/hooks/dlp-scanner.py` | `hooks` | DLP scanner for PHI/PII/PAN patterns. | DLP pattern coverage required by pack / compliance. |
| `.claude/hooks/audit-logger.py` | `hooks` | Audit-logging hook. | `audit_logging` in `securityConcerns`. |
| `.claude/hooks/egress-guard.py` | `hooks` | Network egress guard. | Strict/lockdown permission tier. |
| `.claudeignore` | `ignore` | Root ignore list (sensitive dirs, generated files). | Always. |
| `.claude/.claude_ignore` | `ignore` | Claude-internal ignore. | Always. |
| `.mcp.json.template` | `mcp-json` | MCP server registry template. Copy to `.mcp.json` and fill secrets. | Technical roles. |
| `.claude/association_map.yaml` | `association-map` | Codebase-entity → agent/skill mapping. | Technical roles. |
| `.claude/document_state.yaml` | `document-state` | Persisted wizard state pointer. | Always. |
| `azure-pipelines.yml` | `ci-pipeline` | Azure DevOps CI pipeline (stack-matched build/test + a compliance security stage). | CI/CD = Azure DevOps. |
| `.editorconfig` | `editorconfig` | Visual Studio code style + Roslyn analyzer severities. | `visual_studio` in IDEs. |
| `.junie/guidelines.md` + `.aiignore` | `jetbrains` | JetBrains (Junie) guidelines + AI ignore list. | `jetbrains` in IDEs. |
| `deploy/claude-code/managed-settings.json` + `README.md` | `managed-settings` | Enterprise managed settings the admin delivers via Intune/Jamf/MDM — requires Claude Code's native OS sandbox fleet-wide (`"sandbox": {"enabled": true}`) and pins a non-wideable deny floor matched to the security tier. Not a project setting. | Isolation posture (`TECH_023`) = managed endpoint / dev container / VDI / ephemeral cloud. |
| `.devcontainer/devcontainer.json` + `README.md` | `devcontainer` | Language-matched dev container that isolates the agent + toolchain + project; the boundary where `--dangerously-skip-permissions` is safe. | Isolation posture (`TECH_023`) = dev container. |
| `SETUP.md` | `setup-instructions` | Per-agent install + activation + verification + troubleshooting guide at the repo root. Content adapts to whichever agents the user picked (Claude, Cursor, Copilot, Gemini, Windsurf, AGENTS.md). Emits whenever any of the six hosted-agent targets is selected — NOT tied to the Claude target specifically. | Any hosted-agent target selected. |

Non-technical roles (Business Analyst / Product Manager / Executive):

- The orchestrator overlays a **coworker-shaped** `CLAUDE.md` in
  place of the technical one.
- `hooks/` and `association_map.yaml` are skipped.
- The remaining files emit role-appropriate content (research-focused
  rules, non-code-oriented commands).

## Target: `agents-md`

| Path | Generator | Role | Conditional |
|---|---|---|---|
| `AGENTS.md` | `AGENTS.md` | Cross-agent universal format (Codex, Cursor, Copilot agents, Aider, others). Sections: Project, Stack, Commands, Boundaries, Rules, Terminology. | Always. |

## Target: `cursor`

Cursor uses MDC files with YAML frontmatter. Always-on files use
`alwaysApply: true`; language / testing / domain files use
`globs: [...]`.

| Path | Generator | Role | Conditional |
|---|---|---|---|
| `.cursor/rules/project.mdc` | `cursor-rules` | Project-wide always-apply rule. | Always. |
| `.cursor/rules/security.mdc` | `cursor-rules` | Security always-apply rule. | Security concerns present. |
| `.cursor/rules/hipaa-compliance.mdc` | `cursor-rules` | HIPAA always-apply. | `hipaa` in compliance frameworks. |
| `.cursor/rules/pci-compliance.mdc` | `cursor-rules` | PCI always-apply. | `pci`. |
| `.cursor/rules/ferpa-compliance.mdc` | `cursor-rules` | FERPA always-apply. | `ferpa`. |
| `.cursor/rules/testing.mdc` | `cursor-rules` | Glob-scoped to test paths. | Always. |
| `.cursor/rules/typescript.mdc` / `python.mdc` / `go.mdc` / `java.mdc` / `rust.mdc` | `cursor-rules` | Glob-scoped language rules. | Per-language. |
| `.cursor/rules/<domain>.mdc` | `cursor-rules` | Domain-pack rule (always-apply or path-scoped based on the template's `pathScope`). | Domain pack active. |

For non-technical roles, only `project.mdc` is emitted — carrying the
coworker framing.

## Target: `copilot`

Copilot reads a project-wide instruction file plus optionally scoped
per-concern files.

| Path | Generator | Role | Conditional |
|---|---|---|---|
| `.github/copilot-instructions.md` | `copilot-instructions` | Project-wide instructions. | Always. |
| `.github/instructions/typescript.instructions.md` | `copilot-instructions` | Scoped to `**/*.ts,**/*.tsx`. | `typescript`. |
| `.github/instructions/python.instructions.md` | `copilot-instructions` | Scoped to `**/*.py`. | `python`. |
| `.github/instructions/go.instructions.md` | `copilot-instructions` | Scoped to `**/*.go`. | `go`. |
| `.github/instructions/java.instructions.md` | `copilot-instructions` | Scoped to `**/*.java,**/*.kt`. | `java`. |
| `.github/instructions/rust.instructions.md` | `copilot-instructions` | Scoped to `**/*.rs`. | `rust`. |
| `.github/instructions/tests.instructions.md` | `copilot-instructions` | Scoped to test paths. | Technical roles. |
| `.github/instructions/security.instructions.md` | `copilot-instructions` | Scoped to `**`. | Security concerns or compliance present. |

Non-technical roles emit only `.github/copilot-instructions.md`.

## Target: `gemini`

| Path | Generator | Role | Conditional |
|---|---|---|---|
| `GEMINI.md` | `GEMINI.md` | Gemini CLI / Antigravity project-context file. Same section shape as AGENTS.md with an additional "About this project" preamble. | Always. |

## Target: `windsurf`

| Path | Generator | Role | Conditional |
|---|---|---|---|
| `.windsurfrules` | `windsurf-rules` | Single plain-markdown rules file at the project root. No frontmatter, no scoping. | Always. |

## v3.3 Local-AI integration targets

These targets are opt-in (`--targets continue-dev,aider,…`) and auto-included when the user opts into the wizard's local-AI branch (`TECH_013 == true`).

### Target: `continue-dev`

| Path | Generator | Role | Conditional |
|---|---|---|---|
| `.continue/config.json` | `continue-dev` | Continue.dev (VS Code / JetBrains extension) config pointing at the user's Ollama models from TECH_016 with the default selected at TECH_018. | Local AI enabled + Continue.dev in TECH_017. |

### Target: `aider`

| Path | Generator | Role | Conditional |
|---|---|---|---|
| `.aider.conf.yml` | `aider` | Aider terminal pair-programmer config — model name, edit format, auto-commits, dark mode toggles. | Local AI enabled + Aider in TECH_017. |
| `.aiderignore` | `aider` | Aider-specific ignore list mirroring `.claudeignore` for the same project. | Local AI enabled + Aider in TECH_017. |

### Target: `zed-ai`

| Path | Generator | Role | Conditional |
|---|---|---|---|
| `.zed/settings.json` | `zed-ai` | Zed editor AI settings — assistant provider (Ollama), default model, slash command toggles. | Local AI enabled + Zed AI in TECH_017. |

### Target: `ollama`

| Path | Generator | Role | Conditional |
|---|---|---|---|
| `OLLAMA_SETUP.md` | `ollama-setup` | Ollama install + model-pull runbook. Lists each model from TECH_016 with its `ollama pull` command, approximate RAM footprint, and recommended use (autocomplete vs chat vs embeddings). | Local AI enabled. |

### Target: `rag-scaffold`

Runnable RAG starter — not just config. The chunker is FHIR-aware for healthcare profiles, plain-text otherwise.

| Path | Generator | Role | Conditional |
|---|---|---|---|
| `rag/README.md` | `rag-scaffold` | Overview + smoke test. | Local AI enabled + opted in. |
| `rag/pyproject.toml` | `rag-scaffold` | Dependencies + run scripts. | Same. |
| `rag/.env.example` | `rag-scaffold` | Env-var template for the RAG service. | Same. |
| `rag/src/chunker.py` | `rag-scaffold` | FHIR-aware chunker (healthcare) or plain-text chunker (other industries). | Same. |
| `rag/src/embedder.py` | `rag-scaffold` | Ollama-embeddings wrapper. | Same. |
| `rag/src/store.py` | `rag-scaffold` | SQLite-VSS vector store. | Same. |
| `rag/src/audit.py` | `rag-scaffold` | Retrieval audit log. | Same. |
| `rag/src/cli.py` | `rag-scaffold` | Index + query CLI. | Same. |
| `RAG_RUNBOOK.md` | `rag-scaffold` | Setup, smoke test, compliance notes at the repo root. | Same. |
| `.claude/rules/rag-hipaa-compliance.md` | `rag-scaffold` | HIPAA RAG rule (path-scoped to `rag/**`). | Healthcare profile. |
| `.claude/rules/rag-pci-compliance.md` | `rag-scaffold` | PCI RAG rule. | PCI in compliance frameworks. |
| `.claude/rules/rag-soc2-compliance.md` | `rag-scaffold` | SOC 2 RAG rule. | SOC 2 in compliance frameworks. |
| `.claude/rules/rag-ferpa-compliance.md` | `rag-scaffold` | FERPA RAG rule. | FERPA in compliance frameworks. |

### Target: `local-router`

Runnable PHI-safe dispatch service — Express server that routes simple requests to a local model, escalates complex requests to a hosted LLM after optional redaction.

| Path | Generator | Role | Conditional |
|---|---|---|---|
| `router/package.json` | `local-router` | Dependencies + run scripts. | Local AI enabled + router opted in (TECH_019). |
| `router/.env.example` | `local-router` | Env-var template for credentials, model selection, redaction toggle. | Same. |
| `router/README.md` | `local-router` | Overview + smoke test. | Same. |
| `router/src/server.ts` | `local-router` | Express entrypoint. | Same. |
| `router/src/classifier.ts` | `local-router` | Request classifier (rule-based or local-LLM, per FIN_003). | Same. |
| `router/src/local-client.ts` | `local-router` | Ollama client. | Same. |
| `router/src/hosted-client.ts` | `local-router` | Hosted-LLM client (Anthropic / OpenAI, per TECH_020). | Same. |
| `router/src/audit.ts` | `local-router` | Routing audit log. | Same. |
| `router/src/redactor.ts` | `local-router` | PHI redactor — strips MRN / SSN / DOB / etc. before any escalation. | Healthcare profile (auto-included). |
| `router/src/confidence.ts` | `local-router` | Confidence-based escalation module — local model self-rates, escalates when below threshold. | Confidence escalation opted in (TECH_021). |
| `ROUTER_RUNBOOK.md` | `local-router` | Setup, smoke test, hardening notes at the repo root. | Same. |
| `.claude/rules/router-conventions.md` | `local-router` | Router conventions rule (path-scoped to `router/**`). | Same. |

## v4.0 governance-output targets

These four targets are opt-in only (`--targets oscal-component,cyclonedx-aibom,…`) so existing goldens regenerate byte-identically when not requested. Each runs as a **post-pass** step in the orchestrator after the regular parallel batch — order matters because each output's manifest names every other file emitted in the run.

### Target: `cyclonedx-aibom`

| Path | Generator | Role | Conditional |
|---|---|---|---|
| `.embediq/cyclonedx/aibom.json` | `cyclonedx-aibom` | CycloneDX 1.6 ML-BOM enumerating every AI component the harness invokes — Ollama local models, hosted-API providers (Anthropic / OpenAI), IDE-resident agents (Continue.dev, Aider, Zed AI), the local-router service. EO 14110-aligned. | Opt-in via `--targets cyclonedx-aibom`. |

### Target: `oscal-component`

| Path | Generator | Role | Conditional |
|---|---|---|---|
| `.embediq/oscal/component-definition.json` | `oscal-component` | OSCAL 1.1.2 Component Definition — the product-level claim describing the EmbedIQ-generated harness as a system component, citing the active compliance frameworks as control sources, with the artifact manifest naming every file emitted in this run. Drop into Drata / Vanta / FedRAMP audit pipelines. | Opt-in via `--targets oscal-component`. |

### Target: `oscal-ssp-fragment`

Operator-tunable via three env vars: `EMBEDIQ_OSCAL_SSP_PROFILE_HREF` (OSCAL profile reference), `EMBEDIQ_OSCAL_SSP_SYSTEM_NAME` (system name + metadata title), `EMBEDIQ_OSCAL_SSP_SENSITIVITY` (FIPS-199 level — `fips-199-low` / `fips-199-moderate` / `fips-199-high`).

| Path | Generator | Role | Conditional |
|---|---|---|---|
| `.embediq/oscal/ssp-fragment.json` | `oscal-ssp-fragment` | OSCAL 1.1.2 System Security Plan **fragment** — control-implementation + harness-component sections only. Stamped `document-completion-status=fragment` so reviewers know it's a starter, not a standalone SSP. | Opt-in via `--targets oscal-ssp-fragment`. |

### Target: `provenance`

| Path | Generator | Role | Conditional |
|---|---|---|---|
| `.embediq/provenance/manifest.json` | `provenance-trace` | Per-file traceability — every file in the generated harness mapped to its generator, target format, domain pack, and skill. Fires LAST so the manifest covers every other output (including the v4.0 governance outputs above) plus itself. | Opt-in via `--targets provenance`. |

## Layout diagrams

### Claude Code only (default)

```
/
├── CLAUDE.md
├── .claudeignore
├── .mcp.json.template
└── .claude/
    ├── settings.json
    ├── settings.local.json
    ├── .claude_ignore
    ├── rules/
    │   ├── testing.md
    │   ├── security.md
    │   ├── hipaa-compliance.md
    │   ├── typescript.md
    │   └── …
    ├── commands/
    ├── agents/
    ├── skills/
    ├── hooks/
    │   ├── command-guard.py
    │   ├── dlp-scanner.py
    │   ├── audit-logger.py
    │   └── egress-guard.py
    ├── association_map.yaml
    └── document_state.yaml
```

### `claude,agents-md,cursor` (mixed team)

```
/
├── AGENTS.md                    ← cross-agent
├── CLAUDE.md                    ← claude
├── .claudeignore
├── .mcp.json.template
├── .claude/                     ← claude subtree (as above)
└── .cursor/
    └── rules/
        ├── project.mdc
        ├── security.mdc
        ├── hipaa-compliance.mdc
        ├── testing.mdc
        └── typescript.mdc
```

### `all` (every target)

Adds `.github/copilot-instructions.md` + `.github/instructions/`,
`GEMINI.md`, and `.windsurfrules` alongside the above.

## Managed subtrees (drift scope)

The [drift detector](../user-guide/06-evaluation-and-drift.md) scans
only these paths — files outside are considered user-owned and never
flagged:

```
.claude/
.cursor/
.github/copilot-instructions.md
.github/instructions/
.claudeignore
CLAUDE.md
AGENTS.md
GEMINI.md
.windsurfrules
.mcp.json.template
SETUP.md
.continue/
.aider.conf.yml
.aiderignore
.zed/
OLLAMA_SETUP.md
rag/
RAG_RUNBOOK.md
router/
ROUTER_RUNBOOK.md
.embediq/
```

Anything else (your application source, test fixtures, build output)
is your domain.

## File stamps

Every generated file carries a stamp like:

```
<!-- Generated by EmbedIQ v4.0.0 | schema:2 | 2026-05-26T12:34:56Z -->
```

The stamp format varies by file type:

| File type | Stamp syntax |
|---|---|
| Markdown (`.md`, `.mdc`) | `<!-- Generated by EmbedIQ … -->` on the first line. |
| JSON (`.json`) | Top-level `_embediq: { version, schema, generatedAt }` key. |
| Python (`.py`) | `# Generated by EmbedIQ …` header comment. |
| YAML (`.yaml`, `.yml`) | `# Generated by EmbedIQ …` header comment. |
| Other | Best-effort `#` comment header. |

The drift detector strips the stamp before comparing content, so a
freshly-regenerated file doesn't register as drift purely because
its timestamp advanced.

## See also

- [Multi-agent targets](../user-guide/05-multi-agent-targets.md)
- [Drift detection](../user-guide/06-evaluation-and-drift.md)
- [Synthesizer architecture](../architecture/synthesizer.md)
