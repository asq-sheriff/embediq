<!-- audience: public -->

# Architecture — overview

EmbedIQ is a **three-layer pipeline** with independent responsibilities.
Understanding the layer boundary is the shortest path to contributing
without breaking everything downstream.

```
┌────────────────────────────────────────────────────────────────┐
│  Layer 1 — Universal Question Bank   src/bank/                 │
│  71 questions · 7 dimensions · 40 with conditional branching   │
├────────────────────────────────────────────────────────────────┤
│  Layer 2 — Adaptive Logic Engine     src/engine/               │
│  Branch evaluation · profile building · priority analysis      │
├────────────────────────────────────────────────────────────────┤
│  Layer 3 — Unified Synthesizer       src/synthesizer/          │
│  Target-aware generators · validation · stamping · PR integr.  │
└────────────────────────────────────────────────────────────────┘
        ▲                                                 │
        │                                                 ▼
    Extension surfaces                           Output target(s)
    (plugins, skills,                         (Claude, Cursor, Copilot,
     templates)                                 Gemini, Windsurf,
                                                AGENTS.md)
```

Orthogonal concerns plug into the pipeline via a **typed event bus**
(`src/events/`) and an **integrations layer** (`src/integrations/`):

- **Event bus**: five default subscribers (audit, metrics, status,
  OTel, WebSocket) + the opt-in outbound-webhook subscriber. Every
  subsystem emits events; subscribers consume them independently.
- **Integrations**: git PR flow (GitHub adapter), outbound webhook
  formatters (Slack/Teams/generic), inbound compliance adapters
  (Drata/Vanta/generic).
- **Autopilot**: a scheduled + webhook-driven runner that uses the
  same evaluation/drift machinery as the CLI.

## Design tenets (what stays true regardless of feature additions)

1. **Stateless by default.** The web API holds no session state
   unless an operator opts in. The browser is the authoritative
   answer store.
2. **Deterministic output.** Same answers → byte-identical files
   (modulo a single generation-stamp line the drift detector strips
   before comparison).
3. **No LLM in the pipeline.** Generators are pure TypeScript.
   Audit reproducibility and air-gap compatibility follow from this.
4. **Role adaptation.** Eight roles, generators branch on role,
   non-technical roles get coworker-shaped output variants.
5. **Pluggable everywhere.** Question bank via domain packs / skills,
   templates, webhook formatters, compliance adapters — all
   extensible without forking the core.
6. **Opt-in outbound.** Every external call (OTel export, git PR,
   webhook dispatch, compliance webhook inbound) is off until an env
   var or flag turns it on.
7. **Fire-and-forget event bus.** A slow subscriber never blocks
   the wizard. The bus catches subscriber errors, logs, and
   continues.

See [SECURITY.md](../../SECURITY.md) for the security-specific
formulation of these tenets.

## Where features live

| Feature | Code path | Architecture chapter |
|---|---|---|
| Question bank | `src/bank/` | [question-bank.md](question-bank.md) |
| Q&A loop + profile + priorities | `src/engine/` | [adaptive-engine.md](adaptive-engine.md) |
| Generators + orchestration + validation | `src/synthesizer/` | [synthesizer.md](synthesizer.md) |
| Domain packs + skills | `src/domain-packs/`, `src/skills/` | [domain-packs-and-skills.md](domain-packs-and-skills.md) |
| Server-side sessions | `src/web/sessions/` | [sessions.md](sessions.md) |
| Evaluation framework + drift | `src/evaluation/` + `src/autopilot/drift-*.ts` | [evaluation.md](evaluation.md) |
| Scheduled autopilot | `src/autopilot/` | [autopilot.md](autopilot.md) |
| Git PR, outbound webhooks, compliance webhooks | `src/integrations/` | [integrations.md](integrations.md) |
| Event bus + subscribers | `src/events/` | [event-bus.md](event-bus.md) |

## Data flow — a typical wizard run

```
User opens /                                 (index.html / index.ts)
    ↓
Frontend mounts session from URL / storage   (optional 6C)
    ↓
POST /api/questions (per dimension)          (Q&A loop)
    ↓
POST /api/profile                            (profile + priorities)
    ↓
POST /api/generate                           (orchestrator → generators)
    ↓
[per generator, in parallel]
    ClaudeMdGenerator   ──▶  CLAUDE.md
    SettingsJsonGen     ──▶  .claude/settings.json
    RulesGenerator      ──▶  .claude/rules/*.md
    …                        (12 Claude generators + 5 multi-agent)
    ↓
OutputValidator                              (pass/fail per compliance check)
    ↓
stampGeneratedFile (per file)                (adds generator version + timestamp)
    ↓
FileOutputManager.writeAll                   (or openPrForGeneration when --git-pr)
    ↓
Event bus emits session:completed            (all subscribers see it)
```

Every step runs synchronously on the request thread except:

- Per-generator work runs concurrently via `Promise.all()` (safe
  because every generator is pure).
- Event bus subscribers run via `queueMicrotask` — decoupled from
  the request lifecycle.

## The dual-interface principle

Both CLI (`src/index.ts`) and web server (`src/web/server.ts`) drive
the **same core**:

- The question bank, adaptive engine, synthesizer, domain packs,
  skills, and integrations are shared.
- CLI differences: `@inquirer/prompts` for input, synchronous flow,
  runs in the user's shell with their filesystem permissions.
- Web differences: Express routes, optional auth, optional session
  persistence, WebSocket event stream for live progress, runs
  long-lived behind a reverse proxy.

A feature added to the core is available on both surfaces
automatically. A feature that changes the interface (a new CLI flag,
a new HTTP endpoint) needs explicit wiring in the relevant entry
point.

## Type system as contract

The shared type surface in [`src/types/index.ts`](../../src/types/index.ts)
is load-bearing:

- `Question`, `Answer`, `Condition`, `UserProfile`, `DevOpsProfile`,
  `SetupConfig`, `GeneratedFile`, `ValidationResult`,
  `GenerationResult`, `Priority`, `DimensionProgress`.
- Enums: `Dimension` (7 values), `QuestionType` (5), `ConditionOperator`
  (10).
- Type aliases: `UserRole` (8 roles), `TeamSize`, `BudgetTier`,
  `TechnicalProficiency`.

Changes to these types ripple to every layer. When touching them,
bump the `EMBEDIQ_SCHEMA_VERSION` in `src/synthesizer/generation-header.ts`
so the drift detector can distinguish output produced by old schemas.

## Runtime topology

- **Single process** by default (CLI = one long-lived process per
  invocation; web server = one Express app).
- **Parallel internally** (generators run concurrently; event bus
  dispatches via microtasks).
- **Single-node persistence** for session backends (JSON file or
  SQLite) and autopilot store (JSON file). Multi-node story is a
  roadmap item and requires an external adapter.

## Further reading

- [CHANGELOG.md](../../CHANGELOG.md) — what shipped when.
- Per-subsystem chapters linked in the table above.
- [Extension guides](../extension-guide/) — how to plug into the
  architecture without forking.
