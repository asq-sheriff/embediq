<!-- audience: public -->

# Evaluation and drift detection

EmbedIQ ships three CLIs for measuring configuration quality:

| Command | Purpose |
|---|---|
| `npm run evaluate` | Replay recorded answer sets through the full pipeline and score the output against golden references. |
| `npm run benchmark` | Score an *externally-produced* configuration tree (Claude `/init`, Agent Rules Builder, a hand-authored setup) against the same golden references. |
| `npm run drift` | Compare a target project's files against what EmbedIQ would regenerate right now. |

All three share a common scoring core (per-file / per-dimension /
per-generator) and emit text or JSON. Exit codes are designed for CI:
`0` clean, `1` score below threshold or drift detected, `2`
configuration error.

## The golden-config concept

A **golden reference** is a directory that contains the expected output
for a specific profile archetype. The scorer normalizes both sides
(strips generation stamps, normalizes whitespace, unordered
permission-array sets, etc.) and emits a weighted score. Built-in
archetypes live in [`tests/fixtures/golden-configs/`](../../tests/fixtures/golden-configs/):

```
tests/fixtures/golden-configs/
├── minimal-developer/
│   ├── archetype.yaml
│   ├── answers.yaml
│   └── expected/
│       ├── CLAUDE.md
│       ├── .claude/settings.json
│       └── …
├── hipaa-developer-strict/
│   └── …
└── agents-md-developer/
    └── …
```

Each archetype directory holds:

| File | Purpose |
|---|---|
| `archetype.yaml` | Metadata (`id`, `title`, `minimumFloor`, optional `description` and `targets`). |
| `answers.yaml` | The answer map that should produce `expected/`. |
| `weights.yaml` (optional) | Partial `Weights` override — defaults come from `DEFAULT_WEIGHTS`. |
| `golden-meta.yaml` (optional) | Reviewer provenance (reviewed-at, generator SHA). |
| `expected/` | The reference file tree. |

Adding your own archetype is as simple as dropping a new directory in
place. See [writing golden configs](../extension-guide/writing-templates.md)
for conventions.

## `npm run evaluate`

Re-runs the full profile-builder → synthesizer pipeline for every
archetype it discovers, then scores the output against `expected/`.

```bash
npm run evaluate -- --no-color
```

Output (abridged):

```
EmbedIQ Evaluation Report
  Overall: PASS  100.00%  (threshold 75.00%)
  Archetypes: 3  Duration: 19ms

  PASS  hipaa-developer-strict  100.00%  [engine-driven]
      validator: 15 pass  0 fail  0 warn
      efficiency: presented=66  answered=18  floor=18  score=27.27%
      dimensions:
        - Operational Reality: 100.00%  (41 checks)
        - Regulatory Compliance: 100.00%  (7 checks)
        - Strategic Intent: 100.00%  (3 checks)
```

Common flags:

| Flag | Purpose |
|---|---|
| `--archetype <id>` | Restrict the run to a single archetype (repeatable). |
| `--threshold <0..1>` | Fail the run if any archetype scores below this. Default 0.75. |
| `--baseline <path>` | Path to a prior JSON report — adds a baseline-regression section showing deltas. |
| `--format text\|json` | Output format (default: `text`). |
| `--out <path>` | Write the report to a file instead of stdout. |
| `--show-failures` | List the worst failing checks per archetype. |
| `--failure-limit <n>` | Cap the failures list at `n` entries (default 10). |
| `--no-color` | Disable ANSI color — useful in CI logs. |

### Interpreting scores

- **Overall score** — weighted mean of every archetype's `overallScore`.
- **Archetype score** — weighted mean across all file-level checks
  (structural, content, security, compliance, configuration, style).
- **Dimension breakdown** — per-dimension bucket for every check.
  Regulatory Compliance scores low → missing HIPAA / PCI content.
  Technology Requirements scores low → language rules wrong.
- **Efficiency** — engine-driven mode only. Correlates questions
  presented vs. questions actually answered. `efficiencyScore =
  overallScore × (floor / presented)`. An archetype that solves the
  problem in fewer questions scores higher.

### Baseline regression

Compare against a prior run:

```bash
# Save today's report
npm run evaluate -- --format json --out /tmp/baseline.json

# Tomorrow: compare
npm run evaluate -- --baseline /tmp/baseline.json
```

Any archetype whose score dropped shows up as a regression entry. Wire
this into CI to catch quality drops automatically.

## `npm run benchmark`

Scores an externally-produced configuration tree — e.g., what Claude
Code's `/init` generated, or what a shallow config generator produced —
against the same golden references:

```bash
npm run benchmark -- \
  --candidate ./other-tool-output \
  --candidate-label claude-init \
  --no-color
```

Candidate layout modes:

| Layout | Structure |
|---|---|
| `per-archetype` (default) | `<candidate>/<archetypeId>/<files>` — compare one candidate per archetype. |
| `flat` | `<candidate>/<files>` — single tree scored against every archetype. |

See [the evaluation-methodology guide](../evaluators/evaluation-methodology.md)
for a step-by-step "benchmark `/init`" recipe suitable for competitive
analysis.

## `npm run drift`

Compares a target project's managed subtrees (`.claude/`, `.cursor/`,
`.github/copilot-instructions.md`, `.github/instructions/`,
`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.windsurfrules`,
`.claudeignore`, `.mcp.json.template`) against what EmbedIQ would
regenerate from a supplied answer set. Files outside those subtrees
are **never** flagged — your application source is safe.

```bash
npm run drift -- \
  --target ./my-project \
  --archetype minimal-developer
```

Or with an explicit answers file:

```bash
npm run drift -- \
  --target /srv/patient-portal \
  --answers /ops/answers/hipaa.yaml \
  --format json \
  --out /tmp/drift.json
```

### Drift classifications

| Status | Meaning |
|---|---|
| `match` | File matches the expected output (generation stamps stripped before comparison). |
| `missing` | Expected file absent from the target. |
| `modified-by-user` | File exists at the target but has no EmbedIQ stamp — hand-authored. |
| `modified-stale-stamp` | File has an EmbedIQ stamp but its content has diverged since generation. |
| `version-mismatch` | File was generated by an older EmbedIQ version (stamp doesn't match current). |
| `extra` | File under a managed subtree that EmbedIQ wouldn't generate. |

### CI integration

```yaml
# .github/workflows/drift.yml
name: Config drift
on: [pull_request]
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run drift -- --target . --answers ./ops/answers.yaml --format json --out drift.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: drift-report
          path: drift.json
```

Exit code `1` fails the job on any drift. Pair with
[autopilot](08-autopilot.md) for scheduled drift scans instead of /
in addition to PR-time checks.

## Troubleshooting

- **"Failed to parse JSON at `.mcp.json.template`".** `.json.template`
  files are treated as JSONC (they contain `//` comments); the scorer
  routes them through the text comparator. If you're seeing this from
  a real JSON file, fix the file — the scorer is telling the truth.
- **Archetype shows `efficiency: score=0`.** This archetype has
  `efficiencyScore = overallScore × ratio` where `ratio = floor /
  presented`. If `presented` is much larger than `floor`, the score
  collapses. Tighten your archetype's `minimumFloor`.
- **Evaluation is too slow.** Pass `--archetype <id>` to restrict the
  run to one archetype while iterating. All three built-in archetypes
  normally evaluate in well under a second.
- **Drift reports stamp-only differences as `match`.** By design —
  EmbedIQ strips generation-header stamps before comparing so that a
  freshly-regenerated file (with a new timestamp) doesn't register as
  drift. If the stamp version differs, you get `version-mismatch`
  instead.

## See also

- [Autopilot](08-autopilot.md) — scheduled drift scans
- [Evaluation methodology](../evaluators/evaluation-methodology.md) —
  benchmark against competing tools
- [Writing golden configs](../extension-guide/writing-templates.md) —
  authoring your own archetypes
- [Evaluation architecture](../architecture/evaluation.md) — scoring
  math and comparator internals
