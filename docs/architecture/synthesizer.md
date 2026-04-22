<!-- audience: public -->

# Architecture — synthesizer (Layer 3)

The synthesizer turns a `UserProfile` into the final configuration.
It's the only layer that writes to disk or opens PRs. Everything
upstream is data; everything downstream is output.

**Source**: [`src/synthesizer/`](../../src/synthesizer/) — 17 generator
files under `generators/`, plus the orchestrator, validator,
stamper, target-format enum, and diff analyzer.

## `ConfigGenerator` — the interface

```ts
interface ConfigGenerator {
  name: string;
  target: TargetFormat;
  generate(config: SetupConfig): GeneratedFile[] | Promise<GeneratedFile[]>;
}

interface GeneratedFile {
  relativePath: string;
  content: string;
  description: string;
}
```

Every generator is **pure** — takes a `SetupConfig`, returns
`GeneratedFile[]`. No I/O, no mutation, no event-bus emits. The
orchestrator is the only piece with side effects.

## The 17 generators

| Generator | Target | Emits |
|---|---|---|
| ClaudeMdGenerator | `claude` | `CLAUDE.md` |
| SettingsJsonGenerator | `claude` | `.claude/settings.json` |
| SettingsLocalGenerator | `claude` | `.claude/settings.local.json` |
| RulesGenerator | `claude` | `.claude/rules/*.md` |
| CommandsGenerator | `claude` | `.claude/commands/*.md` |
| AgentsGenerator | `claude` | `.claude/agents/*.md` |
| SkillsGenerator | `claude` | `.claude/skills/*.md` |
| HooksGenerator | `claude` | `.claude/hooks/*.py` |
| IgnoreGenerator | `claude` | `.claudeignore` + `.claude/.claude_ignore` |
| McpJsonGenerator | `claude` | `.mcp.json.template` |
| AssociationMapGenerator | `claude` | `.claude/association_map.yaml` |
| DocumentStateGenerator | `claude` | `.claude/document_state.yaml` |
| AgentsMdGenerator | `agents-md` | `AGENTS.md` |
| CursorRulesGenerator | `cursor` | `.cursor/rules/*.mdc` |
| CopilotInstructionsGenerator | `copilot` | `.github/copilot-instructions.md` + `.github/instructions/*.instructions.md` |
| GeminiMdGenerator | `gemini` | `GEMINI.md` |
| WindsurfRulesGenerator | `windsurf` | `.windsurfrules` |

Canonical path list per target: see
[reference/generated-files.md](../reference/generated-files.md).

## Orchestrator — parallel execution + target filtering

```ts
class SynthesizerOrchestrator {
  async generate(config: SetupConfig): Promise<GeneratedFile[]>;
  async generateWithValidation(config: SetupConfig): Promise<GenerationResult>;
}
```

The orchestrator:

1. **Filters by target.** `config.targets` (defaults to
   `[TargetFormat.CLAUDE]`) is the active target set. Generators
   whose `target` isn't in the set are skipped.
2. **Filters by role.** For non-technical roles (`ba`, `pm`,
   `executive`), the Claude `hooks` and `association-map`
   generators are skipped. The overlay writes a coworker-shaped
   `CLAUDE.md` in their place.
3. **Runs the surviving generators in parallel** via
   `Promise.all()` — safe because every generator is pure.
4. **Emits bus events** per file and per phase
   (`generation:started`, `file:generated`,
   `validation:completed`).
5. **Validates the output** (when `generateWithValidation` is
   called) via `OutputValidator`.
6. **Stamps each file** with the EmbedIQ version, schema number,
   and timestamp — see `src/synthesizer/generation-header.ts`.

## `OutputValidator` — pre-write compliance checks

Runs two families of checks over the `GeneratedFile[]`:

- **Universal**: `CLAUDE.md` present, `.claude/settings.json`
  present, `command-guard.py` present for technical roles, etc.
- **Framework-specific**: HIPAA DLP scanner presence, HIPAA SSN /
  MRN pattern presence, PCI-DSS cardholder rule, SOC2 audit
  logging, GDPR data-subject rule.

Checks declared by domain packs (`DomainPack.validationChecks`) run
after the universal set. Each check returns `true` on pass; a failure
with `severity: 'error'` fails the generation result.

The validator is **advisory** at the synthesizer level — the caller
decides what to do with failures. CLI prints the failures and
continues; web server logs them and returns them in the response.
Evaluation mode skips the validator when Claude isn't a target
(nothing to validate).

## `TargetFormat` + multi-agent filtering

```ts
enum TargetFormat {
  CLAUDE = 'claude',
  AGENTS_MD = 'agents-md',
  CURSOR = 'cursor',
  COPILOT = 'copilot',
  GEMINI = 'gemini',
  WINDSURF = 'windsurf',
}
```

`parseTargets(input)` normalizes comma/space-separated strings, the
`all` alias, and case variations. `parseTargetsFromEnv()` reads
`EMBEDIQ_OUTPUT_TARGETS`. Default = `[CLAUDE]`.

Each generator's `target` field is the single source of truth for
filtering. Adding a new target is:

1. Add the enum value.
2. Implement the generator(s) with `target: TargetFormat.<NEW>`.
3. Register in the orchestrator's constructor array.
4. Update `src/evaluation/archetype-registry.ts` so the evaluator
   categorizes the new files.

## `analyzeDiffs` — pre-write conflict detection

The web server's `/api/diff` endpoint calls `analyzeDiffs(files,
targetDir)` which compares the generated set against what's on disk:

- `new` — file doesn't exist at target.
- `unchanged` — content matches (stamp-aware).
- `modified` — stamp present, content differs.
- `conflict` — no stamp, content differs (user-authored file).

This is a lighter-weight variant of the drift detector (see
[evaluation.md](evaluation.md)); it only considers files the
synthesizer would emit, not the full managed subtree.

## Generation-header stamping

Each file gets a first-line (or JSON-nested) stamp:

```
<!-- Generated by EmbedIQ v3.2.0 | schema:2 | 2026-04-21T12:34:56Z -->
```

Format varies by file type (see
[reference/generated-files.md](../reference/generated-files.md)). The
drift detector strips the stamp before content comparison so a
fresh timestamp never looks like drift.

## Git-PR output mode

When called from `openPrForGeneration` (see
[integrations.md](integrations.md)), the synthesizer's output lands
as a branch + commit + PR rather than disk writes. The orchestrator
itself doesn't know this — the caller decides where to put the
`GeneratedFile[]` it receives.

## Why pure generators?

- **Parallel by construction.** Pure functions have no race
  conditions.
- **Testable.** Unit tests call `generate()` with a canned config
  and assert on the returned files.
- **Target composition.** Multiple targets emitting files in one run
  is a filter + concat, not a coordination problem.
- **Replay and benchmarking.** The evaluation framework calls
  `generate()` directly, no HTTP/CLI needed.

## See also

- [Generators reference](../reference/generated-files.md) — exact
  per-file catalog
- [Multi-agent targets](../user-guide/05-multi-agent-targets.md)
- [Evaluation](evaluation.md) — how generator output is scored
- [Integrations](integrations.md) — git PR output mode
