<!-- audience: public -->

# Architecture — adaptive engine (Layer 2)

The adaptive engine runs the Q&A loop, turns the collected answers
into a `UserProfile`, and computes priorities. It's the bridge between
the static question bank (Layer 1) and the deterministic synthesizer
(Layer 3).

**Source**: [`src/engine/`](../../src/engine/) —
`adaptive-engine.ts`, `branch-evaluator.ts`, `dimension-tracker.ts`,
`profile-builder.ts`, `priority-analyzer.ts`.

## `AdaptiveEngine` — the Q&A loop

Walks dimensions in order, asks visible questions one at a time,
re-evaluates visibility after every answer (so new questions can
unlock inside the same dimension), emits bus events for observers.

```
for each dimension in DIMENSION_ORDER:
  visible = bank.getVisibleQuestions(dimension, answers)
  for each question in visible:
    emit question:presented
    answer = ui.askQuestion(question)
    answers.set(question.id, answer)
    emit answer:received
    visible = bank.getVisibleQuestions(dimension, answers)   ← re-eval
  emit dimension:completed

profile = ProfileBuilder.build(answers)
profile.priorities = PriorityAnalyzer.analyze(answers, bank.getAll())
return profile
```

The CLI drives it with `@inquirer/prompts`; the web server drives it
by calling `QuestionBank.getVisibleQuestions` directly per request
(no long-lived engine instance — the web API is stateless).

## `BranchEvaluator` — stateless condition matching

Ten operators (`EQUALS`, `NOT_EQUALS`, `CONTAINS`, `NOT_CONTAINS`,
`ANY_OF`, `NONE_OF`, `ANSWERED`, `NOT_ANSWERED`, `GT`, `LT`). Each
`Condition` in a question's `showConditions[]` is evaluated
independently; results are AND-joined. Missing answers match only
`NOT_ANSWERED`.

`BranchEvaluator.shouldShow(conditions, answers)` is a pure function
— the canonical place to test new conditional logic is a unit test
against this.

## `ProfileBuilder` — turn answers into `UserProfile`

Maps a `Map<string, Answer>` to the full `UserProfile` struct. The
mapping is hand-coded per question ID (answers for role, industry,
team size, technical proficiency, tech stack, etc. have different
destination fields). Non-destructive: answers the builder doesn't
know about stay in the profile's `answers` map and are still
available to generators.

Emits `profile:built` on the event bus so subscribers (audit,
metrics, WS hub) see the derived profile summary.

## `PriorityAnalyzer` — tag-weighted scoring

Every answer option carries tags (e.g. `hipaa`, `phi`, `tdd`,
`devtools`). The analyzer maps tags to eight priority categories:

- Security & Compliance
- Cost Optimization
- Code Quality
- Developer Productivity
- Team Coordination
- CI/CD & Automation
- Monitoring & Observability
- Documentation & Knowledge

For each category, the analyzer sums tag hits weighted by the
question's own weight, then normalizes to a 0..1 confidence score.
Categories that don't meet a minimum threshold are dropped. Domain
packs can register additional categories via `priorityCategories`.

Output: `Priority[]`, ordered by confidence. The profile's
`priorities` field becomes part of the generated `CLAUDE.md` /
`AGENTS.md` body.

## `DimensionTracker` — progress UI state

Minimal bookkeeping for CLI progress bars and web UI sidebars —
answered/skipped counts per dimension. Not load-bearing; can be
ignored by headless integrations.

## Interrupt-and-resume considerations

The CLI engine is driven by the UI (blocks on `await
ui.askQuestion(…)`). Serialization/deserialization of mid-flight
engine state isn't part of the CLI — the web server provides
resume via server-side sessions (see [sessions.md](sessions.md)).

The engine still exposes `serialize()` / `restore()` for headless
replay:

```ts
const snapshot = engine.serialize();
// persist snapshot → later…
engine.restore(snapshot);
```

This is what the evaluation framework (headless replay of archetype
answer sets) uses.

## Re-evaluation semantics

After every answer, the engine re-queries `getVisibleQuestions` for
the current dimension. This means:

- A conditional question earlier in the dimension can become visible
  mid-flow.
- A conditional question that was already answered doesn't
  re-surface — the UI tracks it as answered and moves on.
- Cross-dimension dependencies work because dimensions are walked
  in order — a REG_001 answer unlocks REG_003 in the same dimension,
  not two dimensions later.

## Testing the engine

Unit tests live under
[`tests/unit/adaptive-engine.test.ts`](../../tests/unit/adaptive-engine.test.ts)
and use a scripted UI that returns canned answers. For end-to-end
flows see the integration tests.

## See also

- [Question bank](question-bank.md)
- [Synthesizer](synthesizer.md) — consumer of the built profile
- [Event bus](event-bus.md)
- [Domain packs & skills](domain-packs-and-skills.md) — priority
  category extension
