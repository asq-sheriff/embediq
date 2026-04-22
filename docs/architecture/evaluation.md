<!-- audience: public -->

# Architecture — evaluation framework

The evaluation framework replays recorded answer sets through the
full pipeline, scores the output against golden references, and
produces reports suitable for CI gating and competitive benchmarking.
Same machinery powers the drift detector at the opposite end
(compare on-disk state against freshly-generated expected output).

**Source**: [`src/evaluation/`](../../src/evaluation/) (replay +
scoring) and [`src/autopilot/drift-detector.ts`](../../src/autopilot/drift-detector.ts) (drift).

For the user-facing commands, see
[user-guide/06-evaluation-and-drift.md](../user-guide/06-evaluation-and-drift.md).
For the evaluator-facing playbook, see
[evaluators/evaluation-methodology.md](../evaluators/evaluation-methodology.md).

## Components

```
┌────────────────────────────────────────────────────────────────┐
│  Evaluator          Benchmark             Drift                │
│  (engine-driven)    (benchmark mode)      (compare to disk)    │
│        │                │                    │                 │
│        └────────┬───────┴────────┬───────────┘                 │
│                 ▼                ▼                             │
│            Scorer           (consumes same ScoreInput)         │
│                 ▲                                              │
│   ┌─────────────┴──────────────┐                               │
│   │                            │                               │
│  Comparators              Normalizers                          │
│  (per file-type)          (strip stamps,                       │
│  markdown/JSON/YAML/       parse JSON/YAML,                    │
│  text/binary)              LF normalize)                       │
└────────────────────────────────────────────────────────────────┘
```

`ArchetypeRegistry` maps file paths → generator names + dimensions
so the scorer can bucket per-generator and per-dimension without
re-deriving from content.

## Golden-config layout

```
tests/fixtures/golden-configs/<archetype-id>/
├── archetype.yaml        # id, title, minimumFloor, description, optional targets
├── answers.yaml          # canonical answer map
├── expected/             # reference file tree
├── weights.yaml          # (optional) per-archetype weight overrides
└── golden-meta.yaml      # (optional) reviewer provenance
```

`Evaluator` discovers every archetype, loads it, runs the archetype's
answers through `SynthesizerOrchestrator`, and scores the produced
files against the `expected/` tree.

## `ScoreInput` and comparators

```ts
interface ScoreInput {
  generated: GeneratedFile[];
  expected: GeneratedFile[];
  weights: Weights;
}
```

The scorer iterates over the union of `expected + generated` paths.
Per-path routing:

| Case | Classification |
|---|---|
| Both sides present, content matches (stamp-normalized) | `matched` |
| Expected present, generated absent | `missing` |
| Generated present, expected absent | `extra` |
| Both present, content differs | per-file-type comparator |

Per-file-type comparators:

| File type | Checks |
|---|---|
| **Markdown** | (a) expected headings present, (b) line-set Jaccard similarity, (c) heading order preserved. |
| **JSON/YAML** | Structural walk — leaf-by-leaf matching. Unordered-set semantics for known permission arrays (`permissions.allow/deny/ask`). |
| **Text** | Line-set Jaccard. |
| **Binary** | SHA-256 hash equality. |

Each check emits a `ScoredCheck` with `category`, `severity`, raw
`score` in `[0, 1]`, and an `effectiveWeight` derived from the
`Weights` struct.

## `Weights` — configurable scoring

```ts
interface Weights {
  byCategory: Record<CheckCategory, number>;
  bySeverity: Record<Severity, number>;
  byFile?: Record<string, number>;  // per-path override multiplier
  missingFilePenalty: number;       // score for a missing file (default 0)
  extraFilePenalty: number;         // score for an extra file (default 0 — no penalty)
}
```

The **effective weight** of a check is
`categoryWeight × severityWeight × fileOverride`. The final archetype
score is the weighted mean of every check's score.

## Normalization

The normalizer strips EmbedIQ's generation-header stamp before
comparison — so a fresh generation with a new timestamp doesn't
register as drift. JSON files have their top-level `_embediq`
metadata key removed. YAML goes through the same stamp-strip + YAML
parse. Markdown and text files go through a line-set LF
normalization.

This is why a re-generation of the goldens produces byte-identical
output **after** the stamp line — `git diff` sees only the stamp
change, and the scorer ignores it.

## Evaluation modes

`EvaluationMode = 'engine-driven' | 'direct' | 'benchmark'`:

- **`engine-driven`** (default `evaluate`): run the full pipeline
  (profile builder → orchestrator) for every archetype. Efficiency
  metrics compare presented vs. answered vs. `minimumFloor` — the
  efficiency score collapses if quality collapses.
- **`direct`** (reserved): bypass the engine, score a pre-built
  `GeneratedFile[]` directly. Used by tests.
- **`benchmark`**: score an external candidate tree against the same
  goldens. Used by `npm run benchmark`.

## Benchmark mode specifics

`Benchmark.run()` reads a candidate directory, treats it as an
EmbedIQ-shaped file tree, and scores it against the goldens. Two
layouts: `per-archetype` (nested subdir per archetype id) and `flat`
(single tree scored against every archetype).

For a walkthrough benchmarking Claude Code's `/init`, see
[evaluators/evaluation-methodology.md](../evaluators/evaluation-methodology.md).

## Drift detector — the inverse operation

`detectDrift({ targetDir, answers, targets })` in
`src/autopilot/drift-detector.ts` is the mirror: instead of
replaying answers through the orchestrator and comparing to a
golden, it regenerates the expected set **right now** and compares
against what's on disk at `targetDir`.

Drift classifications:

| Status | Meaning |
|---|---|
| `match` | On-disk content matches expected (stamp-normalized). |
| `missing` | Expected file absent from target. |
| `modified-by-user` | Present at target, no EmbedIQ stamp. |
| `modified-stale-stamp` | Present with a stamp; content diverged since generation. |
| `version-mismatch` | Stamp version differs from current EmbedIQ version. |
| `extra` | Under a managed subtree but EmbedIQ wouldn't generate it. |

Managed subtrees (the only paths ever flagged) are listed in
`MANAGED_TREES` — see
[reference/generated-files.md](../reference/generated-files.md).

## Reports

`EvaluationReport` is the canonical output:

```ts
interface EvaluationReport {
  reportVersion: 1;
  runId: string;
  startedAt: string;
  durationMs: number;
  threshold: number;
  overallScore: number;
  passed: boolean;
  archetypes: ArchetypeScore[];
  baseline?: BaselineRegression;   // when --baseline is supplied
  meta: { node: string; platform: string; commitSha?: string };
}
```

Text rendering (human) and JSON rendering (machine / CI) both read
from this canonical structure. The renderer is in
`src/evaluation/reporter.ts`.

## Baseline regression detection

`Evaluator.evaluateRoot({ baselinePath })` loads a prior report,
compares each archetype's `overallScore` against its baseline, and
surfaces any negative delta as a regression entry. CI can fail on
non-zero regressions.

## Performance

All three built-in archetypes evaluate in well under one second.
Per-archetype cost is dominated by the synthesizer (12–17 generators
in parallel). The scorer itself is O(files × characters) — fine for
dozens of files per archetype.

## Why not just a golden-file hash check?

- **Graceful on stamp differences.** Byte-equal checks would require
  freezing timestamps. The scorer normalizes stamps out.
- **Per-dimension / per-generator visibility.** A single pass/fail
  bit hides the interesting data. The report answers "where did
  you lose quality?"
- **Works with external tools.** Benchmark mode scores any
  competitor's output. Byte-equal would only work with tools that
  match EmbedIQ's exact stamping convention.

## See also

- [Drift & evaluation user guide](../user-guide/06-evaluation-and-drift.md)
- [Evaluator methodology](../evaluators/evaluation-methodology.md)
- [`src/evaluation/`](../../src/evaluation/) — source of truth
