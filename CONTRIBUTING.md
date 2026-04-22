<!-- audience: public -->

# Contributing to EmbedIQ

Thanks for your interest in improving EmbedIQ. This document covers local
setup, the tests and docs expectations every pull request has to meet, and
the release process.

## Local setup

```bash
git clone <this-repo>
cd embediq
npm install
make check          # type-check + 731+ tests (the CI baseline)
make start          # CLI wizard
make start-web      # web server on :3000
```

Node 18+ is required (we rely on global `fetch` and `AbortController`).
See [`Makefile`](Makefile) for every target, or [`package.json`](package.json)
for the raw `npm` scripts.

## Project layout

```
src/
├── bank/                   # Layer 1 — question registry + query interface
├── engine/                 # Layer 2 — adaptive Q&A loop + profile building
├── synthesizer/            # Layer 3 — generators + orchestrator + validation
├── types/                  # Shared TypeScript interfaces
├── domain-packs/           # Built-in industry packs + plugin loader
├── skills/                 # Composable skills + SKILL.md loader + registry
├── evaluation/             # Golden-config replay + scoring + CLI
├── autopilot/              # Drift detection + scheduled runs + store
├── events/                 # In-memory event bus + subscribers
├── integrations/           # git, webhooks, compliance adapters
├── observability/          # OpenTelemetry instrumentation
├── context/                # AsyncLocalStorage request context
├── ui/                     # CLI prompts + playback renderer
├── util/                   # Markdown builder, YAML writer, audit log, file output
├── web/                    # Express server, sessions, auth, routes, frontend
└── index.ts                # CLI entrypoint
tests/
├── unit/                   # Per-module unit tests
├── integration/            # Cross-module + HTTP route tests
└── fixtures/               # Answer maps, profiles, golden configs
docs/                       # User / operator / reference / architecture guides
```

## Development workflow

### 1. Pick an issue or open one

Issues tagged `good-first-issue` are meant to be self-contained.
For larger changes, please open a proposal issue first — especially if
you're adding a new generator, domain pack, skill, or integration
surface.

### 2. Write the change with a test

Every feature PR must include tests. The bar:

- **New generator** → unit test asserting each file it emits under
  representative profiles.
- **New subsystem** (like 6E autopilot) → unit tests for pure logic
  plus at least one integration test that exercises the HTTP route
  end-to-end.
- **Bug fix** → a regression test that fails against `master` and
  passes with the fix.

Golden-config fixtures are **byte-identical** — if your change alters
generated output intentionally, regenerate them via
`npx tsx scripts/regenerate-golden-configs.ts` and include the diff in
your PR.

Run `make check` before you push. It type-checks and runs the full
Vitest suite (731+ tests today).

### 3. Update docs as part of the PR

The PR template enforces this. Any of the following requires a docs
change in the same PR:

| Change | Docs that must update |
|---|---|
| New env var read by the code | `docs/reference/configuration.md` |
| New HTTP route | `docs/reference/rest-api.md` |
| New CLI flag | `docs/reference/cli-reference.md` |
| New generator | `docs/reference/generated-files.md` + user-guide entry |
| New user-visible feature | `docs/user-guide/NN-*.md` (new module or amend existing) |
| Any release-shipping change | `CHANGELOG.md` under `## [Unreleased]` |

User-guide modules follow the structure established by
[`docs/user-guide/08-autopilot.md`](docs/user-guide/08-autopilot.md):
*What it is · Enable it · Commands · REST API · Worked example ·
Troubleshooting · See also.*

### 4. Audience frontmatter

Every markdown file in `docs/` or the repo root must open with an
audience directive:

```md
<!-- audience: public -->
```

or

```md
<!-- audience: private -->
```

Public docs ship to the public `embediq` repo. Private docs (`docs/
ROADMAP.md`, `docs/STATUS.md`, `docs/internal/*`) stay in the private
working repo only. See the [release checklist](#release-checklist)
for the overlay process.

### 5. Open the PR

- Keep the PR focused — one shipping priority per PR when feasible.
- Write a description that explains the **why**, not just the
  **what**; the CHANGELOG line is a good seed.
- Tag the affected subsystem (`[6E autopilot]`, `[6H git]`, `[docs]`,
  etc.) in the title.

## Coding style

- **TypeScript strict mode** is on. No `any` — use `unknown` plus a
  type guard when you need to narrow.
- Comments explain the **why**, never the **what**. A well-named
  identifier beats a paragraph-long docstring.
- No premature abstractions. Three similar lines are better than a
  speculative helper.
- Keep generators **pure** (`generate(config) → files`); I/O lives in
  the orchestrator and the output manager.
- Keep event-bus handlers **fire-and-forget**; a slow subscriber must
  never block the wizard.

## Tests

The suite uses [Vitest](https://vitest.dev). Run:

```bash
npm test                  # one-shot
npm run test:watch        # watch mode
npm run test:coverage     # with v8 coverage
```

Integration tests stand up the full Express app via
[`supertest`](https://github.com/ladjs/supertest) and inject stub
session / autopilot backends (see
[`tests/integration/autopilot.test.ts`](tests/integration/autopilot.test.ts)
for the pattern).

## Release checklist

When cutting a release, the release author:

1. Moves `CHANGELOG.md` entries under `## [Unreleased]` into a new
   dated section.
2. Bumps `version` in `package.json` per SemVer.
3. Runs `make check` one last time.
4. Tags the commit (`git tag v3.2.0`) and publishes release notes
   from the CHANGELOG entry.

## Responsible disclosure

Security-sensitive reports go to the address listed in
[`SECURITY.md`](SECURITY.md). Please don't open a public GitHub issue
for security bugs.

## License

By contributing, you agree that your contributions will be licensed
under the [MIT License](LICENSE) that covers this project.
