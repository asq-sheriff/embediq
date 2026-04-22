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
| `.claude/rules/python.md` / `go.md` / `java.md` / `rust.md` | `rules` | Per-language rules. | Per-language trigger. |
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
```

Anything else (your application source, test fixtures, build output)
is your domain.

## File stamps

Every generated file carries a stamp like:

```
<!-- Generated by EmbedIQ v3.2.0 | schema:2 | 2026-04-21T12:34:56Z -->
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
