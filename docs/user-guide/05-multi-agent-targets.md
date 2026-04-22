<!-- audience: public -->

# Multi-agent output targets

The same EmbedIQ interview produces configuration for multiple AI coding
agents from a single answer set. You pick the target list via
`EMBEDIQ_OUTPUT_TARGETS` or the `--targets` CLI flag; every generator
is role-aware (Business Analyst / Product Manager / Executive get
coworker-shaped variants) and participates in the same parallel
synthesis pipeline.

> **When to use this.** You're generating configuration for a team that
> uses more than one AI coding agent — for example, some developers on
> Claude Code, some on Cursor, and a shared cross-agent `AGENTS.md` for
> everyone else.

## Target families

| Target        | Files produced                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------- |
| `claude` (default) | `CLAUDE.md`, `.claude/settings.json`, `.claude/settings.local.json`, `.claude/rules/*`, `.claude/commands/*`, `.claude/agents/*`, `.claude/skills/*`, `.claude/hooks/*` (Python), `.claudeignore`, `.mcp.json.template`, `.claude/association_map.yaml`, `.claude/document_state.yaml` |
| `agents-md`   | `AGENTS.md` — the cross-agent universal format (Codex, Cursor, Copilot agents, Aider, others)  |
| `cursor`      | `.cursor/rules/*.mdc` — Cursor MDC frontmatter with `alwaysApply` / `globs`                    |
| `copilot`     | `.github/copilot-instructions.md` + `.github/instructions/*.instructions.md` (glob-scoped via `applyTo`) |
| `gemini`      | `GEMINI.md` — Gemini CLI / Antigravity project-context file                                    |
| `windsurf`    | `.windsurfrules` — single plain-markdown rules file at the project root                        |

## Enable additional targets

**Environment variable** (applies to every subsequent `npm start` or
`npm run start:web` in the shell):

```bash
export EMBEDIQ_OUTPUT_TARGETS=claude,cursor,agents-md
npm start
```

**CLI flag** (one-off, overrides the env var):

```bash
npm start -- --targets claude,agents-md
```

**Web API body** (per-request):

```bash
curl -X POST http://localhost:3000/api/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "answers": { … },
    "targetDir": "/path/to/project",
    "targets": ["claude", "cursor", "copilot"]
  }'
```

Valid tokens: `claude`, `agents-md`, `cursor`, `copilot`, `gemini`,
`windsurf`, or `all` (expands to every known target). Tokens are
case-insensitive and may be separated by commas or whitespace.

## `AGENTS.md` — universal format

`AGENTS.md` lands at the project root. Its section order follows the
community convention:

```md
# <Project name>

## Stack
- Languages: …
- Frameworks: …
- Build: …
- Testing: …

## Commands
- Install: `npm install`
- Test: `npm test`

## Boundaries
- HIPAA: no PHI in code, comments, logs, or test fixtures.
- DLP scanners run on every tool invocation — matches block the write.

## Rules
- Run tests before committing.
- TypeScript: strict mode; explicit return types on exports.

## Terminology
- PHI: Protected Health Information.
- Patient portal: the product context this repository implements.
```

Non-technical roles (BA / PM / Executive) get a coworker-shaped variant
that replaces Commands with "No build/test commands — this is a
non-technical workspace" and keeps Boundaries, Rules, and Terminology.

## Cursor MDC rules

`.cursor/rules/` is a directory of `.mdc` files with YAML frontmatter:

```md
---
description: "TypeScript conventions"
globs:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript Conventions

- Strict mode is mandatory.
- Explicit return types on exported functions.
- Prefer `interface` over `type` for object shapes.
```

Frontmatter fields EmbedIQ emits:

| Field | When it's used |
|---|---|
| `description` | Always — shown in Cursor's rules UI. |
| `alwaysApply: true` | Security / compliance rules (`security.mdc`, `hipaa-compliance.mdc`, …). These are injected into every request. |
| `globs: […]` | Language rules, testing rules, domain-pack rules that are path-scoped. |

Typical file list for a HIPAA TypeScript developer:

```
.cursor/rules/project.mdc           # alwaysApply
.cursor/rules/security.mdc          # alwaysApply
.cursor/rules/hipaa-compliance.mdc  # alwaysApply
.cursor/rules/typescript.mdc        # globs: **/*.ts, **/*.tsx
.cursor/rules/testing.mdc           # globs: **/*.test.*, tests/**
```

## GitHub Copilot instructions

The `copilot` target emits a project-wide file plus one glob-scoped
file per language or cross-cutting concern:

```
.github/copilot-instructions.md           # project-wide
.github/instructions/typescript.instructions.md
.github/instructions/tests.instructions.md
.github/instructions/security.instructions.md
```

Scoped files carry an `applyTo` frontmatter field with a
comma-separated glob list:

```md
---
applyTo: "**/*.ts,**/*.tsx"
---

# TypeScript conventions

- Strict mode is mandatory.
- Explicit return types on exported functions.
```

## Gemini and Windsurf

- `GEMINI.md` — adds a leading **"About this project"** preamble on top
  of the same Stack / Commands / Rules / Boundaries / Terminology
  layout used by `AGENTS.md`. Gemini reads this directly.
- `.windsurfrules` — single flat markdown file at the project root.
  Windsurf doesn't support frontmatter or scoping, so the file is kept
  intentionally short: Stack, Commands, Rules, Boundaries. No
  Terminology block (Windsurf has no use for it).

## Role adaptation

Every target honors the user's role. For non-technical roles:

- **Claude**: the orchestrator overlays a coworker-shaped `CLAUDE.md`
  and skips `hooks/` and `association_map.yaml`.
- **AGENTS.md / GEMINI.md / Windsurf**: shorter coworker variant —
  "Commands" becomes "No build/test commands", Rules become
  documentation-quality guidelines.
- **Cursor**: emits a single `.cursor/rules/project.mdc` with
  `alwaysApply: true` and the coworker framing.
- **Copilot**: emits only `.github/copilot-instructions.md` — no
  language-scoped instruction files.

## Worked example — claude + cursor + agents-md for a HIPAA project

```bash
export EMBEDIQ_OUTPUT_TARGETS=claude,cursor,agents-md

npm start
# answer: developer, advanced, "Patient portal", healthcare, …
# generate into /srv/patient-portal
```

After generation, `/srv/patient-portal` contains:

```
AGENTS.md                                     # new
CLAUDE.md                                     # claude
.claude/                                      # claude
  settings.json, rules/, hooks/, …
.cursor/                                      # cursor
  rules/
    project.mdc                 # alwaysApply
    security.mdc                # alwaysApply
    hipaa-compliance.mdc        # alwaysApply
    typescript.mdc              # globs: **/*.ts
    testing.mdc                 # globs: **/*.test.*
.claudeignore
.mcp.json.template
```

## Combining with other features

- **Drift + targets**: `npm run drift -- --targets claude,cursor --target ./my-project`
  only flags drift in the subtrees those targets own. Files outside
  the managed subtrees are never flagged regardless of target.
- **Git PR + targets**: `--git-pr` commits every file across every
  active target in a single atomic commit, then opens one PR with
  everything grouped by generator in the PR body.
- **Autopilot + targets**: set `targets` on an `AutopilotSchedule` so
  scheduled drift scans know which subtrees to cover.

## Troubleshooting

- **Unexpected files land in my repo.** You probably set `targets` too
  broadly. Regenerate with the precise list and drift-check to confirm.
- **No `.claude/` directory generated.** You left `claude` out of
  `targets`. To generate Claude Code output alongside other targets,
  include `claude` explicitly — the default is `claude` only, but any
  non-empty target list overrides the default.
- **`EMBEDIQ_OUTPUT_TARGETS=all` isn't producing what I expect.** `all`
  expands to every known target family. If you only want a subset, use
  an explicit comma-separated list.
- **Invalid target error.** Tokens must match the enum exactly; typos
  like `agents.md` (should be `agents-md`) throw at parse time.

## See also

- [Generated files reference](../reference/generated-files.md) — exact
  schema for every file emitted per target
- [Git PR integration](09-git-pr-integration.md) — opens one PR with
  every target's output
- [Drift detection](06-evaluation-and-drift.md) — scopes to the
  managed subtrees of the active targets
- [Synthesizer architecture](../architecture/synthesizer.md) — how
  target filtering works internally
