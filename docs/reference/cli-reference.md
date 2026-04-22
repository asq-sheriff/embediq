<!-- audience: public -->

# CLI reference

Every command EmbedIQ ships, with the full flag list, env vars each
reads, exit codes, and representative examples. For the web server,
see [deployment](../operator-guide/deployment.md) and
[rest-api](rest-api.md).

## Makefile shortcuts

```bash
make help                # Show every target with one-line descriptions
make check               # Type-check + 731+ tests (CI equivalent)
make build               # Type-check + test + compile to dist/
make start               # Run CLI wizard
make start-web           # Run web server (port 3000)
make dev                 # Watch mode for CLI
make dev-web             # Watch mode for web server
make otel-dev            # Web server with OpenTelemetry enabled
make evaluate            # Run evaluation harness
make benchmark           # Benchmark another tool's output
make drift               # Detect drift between a target and expected output
make sanitize-public     # Dry-run the public-release overlay (writes nothing)
make test                # Run test suite (vitest)
make test-coverage       # Coverage report
make docker              # Build Docker image
make docker-up           # Start with docker-compose
make clean               # Remove build artifacts
```

Every target is a one-line wrapper around the underlying `npm run`
script. Use the raw scripts when chaining multiple flags.

---

## `npm start` — interactive CLI wizard

```bash
npm start [-- --targets <list>] [-- --git-pr]
```

| Flag | Purpose |
|---|---|
| `--targets <list>` | Comma/space-separated output targets (overrides `EMBEDIQ_OUTPUT_TARGETS`). Valid: `claude`, `agents-md`, `cursor`, `copilot`, `gemini`, `windsurf`, `all`. |
| `--git-pr` | After writing files, open a GitHub pull request. Requires `EMBEDIQ_GIT_REPO` + `EMBEDIQ_GIT_TOKEN`. |

Env vars read:

| Env var | Effect |
|---|---|
| `EMBEDIQ_OUTPUT_TARGETS` | Default target list when `--targets` is absent. |
| `EMBEDIQ_GIT_PROVIDER`, `EMBEDIQ_GIT_REPO`, `EMBEDIQ_GIT_TOKEN`, `EMBEDIQ_GIT_BASE_BRANCH`, `EMBEDIQ_GIT_API_BASE_URL` | Consumed when `--git-pr` is active. |
| `EMBEDIQ_AUDIT_LOG` | JSONL audit log path. Writer is a no-op when unset. |
| `EMBEDIQ_PLUGINS_DIR` / `EMBEDIQ_SKILLS_DIR` / `EMBEDIQ_TEMPLATES_DIR` | External domain-pack / skill / template discovery. |

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Wizard completed; files written successfully. |
| 1 | Fatal error (unhandled exception, validation failure surfaced to the user). |
| 130 | User force-closed the prompt (Ctrl+C). The CLI prints a friendly goodbye. |

---

## `npm run start:web` — web server

```bash
npm run start:web
```

No flags — everything is driven by env vars. See
[configuration](configuration.md) for the full matrix.

Typical minimum for a production deployment:

```bash
PORT=3000 \
  EMBEDIQ_AUTH_STRATEGY=oidc \
  EMBEDIQ_OIDC_ISSUER=… \
  EMBEDIQ_OIDC_CLIENT_ID=… \
  EMBEDIQ_OIDC_CLIENT_SECRET=… \
  EMBEDIQ_SESSION_BACKEND=database \
  EMBEDIQ_SESSION_DB_DRIVER=sqlite \
  EMBEDIQ_SESSION_DB_URL=/var/lib/embediq/sessions.db \
  EMBEDIQ_SESSION_COOKIE_SECRET=$(openssl rand -hex 32) \
  EMBEDIQ_SESSION_DATA_KEY=$(openssl rand -hex 32) \
  EMBEDIQ_AUDIT_LOG=/var/log/embediq/audit.jsonl \
  EMBEDIQ_OTEL_ENABLED=true \
  OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318 \
  npm run start:web
```

---

## `npm run evaluate` — replay + score archetypes

```bash
npm run evaluate -- [options]
```

| Flag | Default | Purpose |
|---|---|---|
| `--mode evaluate\|benchmark` | `evaluate` | Run mode. `benchmark` is also exposed via the dedicated `npm run benchmark` script. |
| `--archetypes-root <path>` | `tests/fixtures/golden-configs` | Directory holding archetype subdirectories. |
| `--archetype <id>` | — | Restrict to a specific archetype (repeatable). |
| `--threshold <0..1>` | `0.75` | Pass threshold per archetype. |
| `--baseline <path>` | — | Prior JSON report — adds a regression section comparing deltas. |
| `--format text\|json` | `text` | Output format. |
| `--out <path>` | — | Write the report to a file instead of stdout. |
| `--show-failures` | false | Include the worst failing checks per archetype in the text report. |
| `--failure-limit <n>` | `10` | Cap on failures shown per archetype. |
| `--no-color` | false | Disable ANSI color (useful in CI). |
| `-h, --help` | — | Print help + exit. |

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Run completed and every archetype met `--threshold`. |
| 1 | Run completed but at least one archetype scored below threshold. |
| 2 | Configuration error (bad flags, missing fixtures, malformed YAML). |

Examples:

```bash
# Full evaluation, human-readable
npm run evaluate -- --no-color

# JSON report, save to disk, show top failures
npm run evaluate -- --format json --out /tmp/eval.json --show-failures

# Restrict to one archetype, lower threshold for iteration
npm run evaluate -- --archetype minimal-developer --threshold 0.5

# Regression detection against a prior report
npm run evaluate -- --baseline /tmp/prior.json --no-color
```

---

## `npm run benchmark` — score external configs

```bash
npm run benchmark -- --candidate <path> --candidate-label <name> [options]
```

| Flag | Default | Purpose |
|---|---|---|
| `--candidate <path>` | — | **Required.** Directory holding the candidate configuration(s). |
| `--candidate-label <name>` | — | **Required.** Label shown in the report (e.g. `claude-init`). |
| `--candidate-layout flat\|per-archetype` | `per-archetype` | `per-archetype`: `<candidate>/<archetypeId>/<files>`. `flat`: one tree scored against every archetype. |
| `--archetypes-root <path>` | `tests/fixtures/golden-configs` | Same as `evaluate`. |
| `--archetype <id>` | — | Restrict (repeatable). |
| `--threshold <0..1>` | `0.75` | Pass threshold per archetype. |
| `--format text\|json` | `text` | Output format. |
| `--out <path>` | — | Write report to file. |
| `--show-failures` | false | Include top failures. |
| `--failure-limit <n>` | `10` | Cap. |
| `--no-color` | false | Disable ANSI color. |

Exit codes: same as `npm run evaluate`.

Example:

```bash
npm run benchmark -- \
  --candidate ./claude-init-output \
  --candidate-label claude-init \
  --format json --out /tmp/benchmark.json \
  --no-color
```

See [evaluation methodology](../evaluators/evaluation-methodology.md)
for a step-by-step "benchmark Claude Code `/init`" recipe.

---

## `npm run drift` — drift detection

```bash
npm run drift -- --target <path> (--answers <yaml> | --archetype <id>) [options]
```

| Flag | Default | Purpose |
|---|---|---|
| `--target <path>` | — | **Required.** Project directory whose managed subtrees are scanned. |
| `--answers <path>` | — | Path to an `answers.yaml`. |
| `--archetype <id>` | — | Shorthand — loads `tests/fixtures/golden-configs/<id>/answers.yaml`. Mutually exclusive with `--answers`. |
| `--targets <list>` | `claude` | Output-target filter (same syntax as `EMBEDIQ_OUTPUT_TARGETS`). |
| `--format text\|json` | `text` | Output format. |
| `--out <path>` | — | Write to file. |
| `--show-content` | false | Include full expected/on-disk content per entry in text output. |
| `--no-color` | false | Disable ANSI color. |
| `-h, --help` | — | Print help + exit. |

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Target is in sync with expected generation (clean). |
| 1 | Drift detected. |
| 2 | Configuration error (bad flags, missing files, malformed YAML). |

Examples:

```bash
# Against a shipped archetype
npm run drift -- --target ./my-project --archetype minimal-developer

# Against an ops-owned answer set
npm run drift -- \
  --target /srv/patient-portal \
  --answers /ops/answers/hipaa.yaml \
  --format json --out /tmp/drift.json

# In CI (concise, colorless)
npm run drift -- --target . --archetype hipaa-developer-strict --no-color
```

See [evaluation and drift](../user-guide/06-evaluation-and-drift.md)
for scoring interpretation and a CI snippet.

---

## `npm run sanitize-public` — public-release overlay

```bash
npm run sanitize-public -- [options]
```

Walks the source tree, classifies every markdown file by its
`<!-- audience: public | private -->` directive, and either
prints what would happen (dry-run) or writes the public-safe
subset to an output directory. Also runs a leak-marker scan over
every public-tagged markdown file — a hit is a defect. The marker
list is defined in `scripts/sanitize-for-public.ts` and kept in
private documentation so the public surface never enumerates the
strings it scans for.

| Flag | Default | Purpose |
|---|---|---|
| `--source <path>` | `.` | Source repository root. |
| `--out <path>` | — | Output directory. **Required when not dry-run.** Writes the sanitized tree here. |
| `--dry-run` | true (default) | Walk + scan + report; write nothing. |
| `--strict` | false | Exit 1 on unclassified-markdown warnings, not just leaks. |
| `--no-color` | false | Disable ANSI color in the report. |
| `-h, --help` | — | Print help + exit. |

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Clean. The dry-run reported no leaks (and `--strict` saw no unclassified files). |
| 1 | Leak markers found in public-tagged content (or `--strict` + unclassified files). |
| 2 | Configuration error (bad flags, missing source dir, missing `--out` outside dry-run). |

Examples:

```bash
# Dry-run against the live tree (CI-friendly)
npm run sanitize-public -- --no-color

# Materialize the sanitized tree
npm run sanitize-public -- --out /tmp/embediq-public --no-color

# Strict mode in CI — fail on unclassified markdown too
npm run sanitize-public -- --strict --no-color
```

The full release-overlay flow lives in
[`docs/internal/contributor-handbook.md`](../internal/contributor-handbook.md)
(private repo). The script is the engine that flow drives.

---

## Developer commands

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies. |
| `npm run build` | `tsc` → `dist/`. |
| `npm run dev` | Watch mode for the CLI wizard (`tsx watch`). |
| `npm run dev:web` | Watch mode for the web server. |
| `npm test` | Run the Vitest suite. |
| `npm run test:watch` | Watch mode. |
| `npm run test:coverage` | v8 coverage report. |
| `npx tsc --noEmit` | Type-check without emitting — fast feedback during development. |

## See also

- [REST API](rest-api.md)
- [Configuration reference](configuration.md)
- [Getting started](../getting-started.md)
- [Contributing](../../CONTRIBUTING.md) — release flow + test
  expectations
