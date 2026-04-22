<!-- audience: public -->

# Evaluation methodology

How to score EmbedIQ's output — and the output of any competing tool —
against a common set of golden references. This is the procedure an
enterprise evaluator runs when they want data rather than qualitative
opinion about configuration quality.

## The core idea

EmbedIQ ships a **golden-config replay harness**. For a handful of
named archetype profiles (HIPAA developer, minimal developer,
AGENTS.md-only developer, etc.), we carry an `answers.yaml` plus an
`expected/` tree of the configuration that profile should produce.
The scoring engine then:

1. Runs EmbedIQ with the archetype's answers → gets a candidate tree.
2. Compares the candidate against `expected/` using a stamp-aware
   diff scorer.
3. Produces per-file, per-dimension, and per-generator scores, plus
   an overall weighted mean.

The scoring engine is **tool-agnostic** — point it at any candidate
directory (Claude Code `/init` output, Agent Rules Builder output,
hand-authored config, a fork of EmbedIQ) and it scores the same way.

For the user-facing command reference, see
[user-guide/06-evaluation-and-drift.md](../user-guide/06-evaluation-and-drift.md).
This doc is the evaluator-facing walkthrough.

## Step 1 — Establish the baseline

First, confirm EmbedIQ's own output scores 100% against its goldens.
This is the control — the scorer works correctly.

```bash
git clone https://github.com/asq-sheriff/embediq
cd embediq
npm ci
npm run evaluate -- --no-color
```

Expected output:

```
EmbedIQ Evaluation Report
  Overall: PASS  100.00%  (threshold 75.00%)
  Archetypes: 3  Duration: 19ms
  …
```

Every archetype scores 100% because the goldens are regenerated
from EmbedIQ's own generators. That's the **baseline** — anything
lower is drift, and anything comparable from a competitor says
meaningful things about that competitor.

## Step 2 — Benchmark a competing tool

`npm run benchmark` scores any candidate tree against the same
goldens. Two layouts are supported:

- **`per-archetype`** (default): `<candidate>/<archetypeId>/<files>` —
  one candidate per archetype.
- **`flat`**: `<candidate>/<files>` — one tree scored against every
  archetype (useful when the competing tool doesn't vary by profile).

### Example — benchmark Claude Code's `/init`

```bash
# 1. Produce the candidate output — replicate the wizard's answer set
#    in whatever way the other tool supports. For /init, that's the
#    interactive prompt flow; for a static generator, it might be
#    a CLI flag.
mkdir -p /tmp/claude-init-bench/minimal-developer
cd /tmp/claude-init-bench/minimal-developer
claude /init                  # answer its prompts the same way our archetype does

# Repeat for every archetype you want to score (or stick to one).

# 2. Run EmbedIQ's benchmark harness against the candidate tree.
cd -   # back to the embediq repo
npm run benchmark -- \
  --candidate /tmp/claude-init-bench \
  --candidate-label claude-init \
  --format json --out /tmp/claude-init-bench.json \
  --no-color
```

### Example — flat-layout benchmark

If the competing tool doesn't distinguish between archetypes (it
just produces one kind of config regardless of input), use the flat
layout so the same tree scores against every archetype:

```bash
npm run benchmark -- \
  --candidate /path/to/one-size-fits-all-output \
  --candidate-label agent-rules-builder \
  --candidate-layout flat \
  --no-color
```

### Reading the report

```
PASS  minimal-developer  71.42%  [benchmark]
    dimensions:
      - Strategic Intent: 100.00%  (3 checks)
      - Operational Reality: 82.35%  (23 checks)
      - Regulatory Compliance: 0.00%  (1 check)
      - Technology Requirements: 48.71%  (7 checks)
    top failures:
      - critical  .claude/settings.json  Missing key "permissions.allow"  0.00%
      - critical  .claude/rules/testing.md  Missing file  0.00%
      - major    CLAUDE.md  Line-set Jaccard similarity  0.42
```

The dimension breakdown is the most useful view for competitive
analysis. A competitor that scores 100% on Strategic Intent
(basic project description) but 0% on Regulatory Compliance is
saying something real about their scope.

## Step 3 — Author a custom archetype

Built-in archetypes cover the common profiles. For your specific
vertical or compliance posture, add an archetype.

### Directory layout

```
tests/fixtures/golden-configs/my-archetype/
├── archetype.yaml            # metadata
├── answers.yaml              # canonical answer map
└── expected/                 # the output EmbedIQ (or the reference
                              # tool) should produce for these answers
    ├── CLAUDE.md
    ├── .claude/
    │   ├── settings.json
    │   └── rules/
    │       └── my-rule.md
    └── …
```

### `archetype.yaml`

```yaml
id: legaltech-developer
title: Legaltech developer (privilege-aware)
description: >
  Developer profile for a legal-tech product with ABA Model Rule 1.6
  obligations. Exercises the legaltech domain pack end-to-end.
minimumFloor: 14
targets:
  - claude
```

`minimumFloor` is the minimum number of questions needed to reach a
valid profile — the efficiency metric scores how close the wizard
stays to that floor. `targets` is optional and restricts the
evaluator's regeneration to specific output targets.

### `answers.yaml`

The canonical answer map keyed on question IDs. Array values are
YAML arrays; primitives pass through.

```yaml
STRAT_000: developer
STRAT_000a: advanced
STRAT_001: Privilege-aware contracts platform
STRAT_002: legaltech
OPS_001: medium
TECH_001:
  - typescript
FIN_001: enterprise
REG_001: true
REG_002:
  - aba_1_6
LEGAL_001: true
```

### Regenerating `expected/`

After authoring the archetype, generate the expected tree from
EmbedIQ's current output:

```bash
npx tsx scripts/regenerate-golden-configs.ts
```

The script walks every archetype under
`tests/fixtures/golden-configs/` and writes a fresh `expected/` tree.
Commit both `archetype.yaml`/`answers.yaml` and the regenerated
`expected/` tree.

### Verifying

```bash
npm run evaluate -- --archetype legaltech-developer --no-color
```

Should score 100% — you just regenerated the goldens from the same
code that would produce the candidate.

## Step 4 — Publish results

For competitive analysis you can publish:

```bash
npm run benchmark -- \
  --candidate ./competitor-output \
  --candidate-label competitor \
  --format json --out benchmark-report.json
```

The JSON report contains everything a reader needs to reproduce the
run: the archetype definitions, the scoring methodology, every
per-file score. Include your EmbedIQ version (`package.json version`)
and the git SHA for reproducibility.

Sample publishing format:

```md
## Configuration Quality Benchmark

**Date**: 2026-04-21  
**EmbedIQ version**: 3.2.0 (commit abcd1234)  
**Archetype**: hipaa-developer-strict

| Tool | Overall | Strategic Intent | Ops Reality | Compliance | Tech Req |
|------|--------:|-----------------:|------------:|-----------:|---------:|
| EmbedIQ | 100.00% | 100.00% | 100.00% | 100.00% | 100.00% |
| claude-init | 71.42% | 100.00% | 82.35% | 0.00% | 48.71% |
| agent-rules-builder | 44.12% | 67.00% | 41.00% | 0.00% | 35.00% |

Raw reports: [embediq.json](./embediq.json), [claude-init.json](./claude-init.json), …
```

## Step 5 — Regression detection

Once you have a baseline report, compare against it to detect
regressions:

```bash
# Today
npm run evaluate -- --format json --out /tmp/today.json

# Compared against last week's run
npm run evaluate -- \
  --baseline /path/to/last-week.json \
  --no-color
```

The report includes a baseline-regression section listing every
archetype whose score dropped since the baseline. In CI, fail on
any non-zero regression count.

## Scoring details

Weights ship as defaults in
[`src/evaluation/weights.ts`](../../src/evaluation/weights.ts). Each
check has a category (`structural`, `content`, `security`,
`compliance`, `configuration`, `style`) and a severity (`critical`,
`major`, `minor`). The final weight is
`categoryWeight × severityWeight × fileOverride` — per-file weight
overrides (to emphasize `CLAUDE.md` over a helper file, say) live in
`weights.yaml` inside the archetype directory.

Comparators by file type:

| File type | Comparator | Metric |
|---|---|---|
| Markdown | Heading structure + Jaccard similarity + heading order | Three checks |
| JSON | Structural walk (recursive); unordered sets for `permissions.allow/deny/ask` | One check per leaf |
| YAML | Same walk as JSON | One check per leaf |
| Text | Line-set Jaccard | One check |
| Binary | SHA-256 equality | One check |

Details: [architecture/evaluation.md](../architecture/evaluation.md).

## Caveats

- **Archetypes are opinionated.** The score measures alignment to
  EmbedIQ's own output. A tool whose philosophy differs from
  EmbedIQ's will score low — that's accurate data, not bias, but
  don't read it as "EmbedIQ is better" unless you agree with the
  archetype's premises.
- **Benchmark candidates vary in format.** If the competing tool
  emits `.cursorrules` instead of `.claude/rules/`, the scorer will
  mark most EmbedIQ files as missing. For a fair comparison, either
  use archetype `targets` that match the competing tool's target
  family, or write archetype goldens that match the competing tool's
  format.
- **Determinism is a scoring input.** A tool that produces
  non-deterministic output (LLM-powered) will score inconsistently
  across runs. That inconsistency itself is data — track variance
  across three runs.

## See also

- [User-facing evaluation + drift guide](../user-guide/06-evaluation-and-drift.md)
- [Evaluation architecture](../architecture/evaluation.md) — scoring
  math
- [Competitive comparison](competitive-comparison.md)
- [Writing golden configs](../extension-guide/writing-templates.md)
