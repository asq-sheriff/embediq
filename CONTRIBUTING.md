# Contributing to EmbedIQ

Thank you for your interest in contributing to EmbedIQ.

## Getting Started

```bash
git clone https://github.com/asq-sheriff/embediq.git
cd embediq
npm install
npm test          # Run the test suite (213 tests)
npm run dev:web   # Start the web UI in watch mode
```

## Development Workflow

1. Fork the repo and create a feature branch
2. Make your changes
3. Run `npx tsc --noEmit` to verify types
4. Run `npm test` to verify all tests pass
5. If you changed generators, update snapshots with `npm run test:snapshots`
6. Submit a pull request

## Project Structure

EmbedIQ has a three-layer architecture. See [CLAUDE.md](CLAUDE.md) for a complete module reference.

- **Layer 1** (`src/bank/`) — Question definitions and filtering
- **Layer 2** (`src/engine/`) — Adaptive logic, branching, profile building
- **Layer 3** (`src/synthesizer/`) — File generation, validation, versioning

## Adding a Domain Pack

1. Create a new file in `src/domain-packs/built-in/` implementing the `DomainPack` interface
2. Register it in `src/domain-packs/registry.ts`
3. Add the industry-to-pack mapping in the `INDUSTRY_TO_PACK` map in `registry.ts`
4. Add integration tests in `tests/integration/domain-packs.test.ts`

## Adding Questions

1. Add a `Question` object to `src/bank/question-registry.ts` with a dimension-prefixed ID (e.g., `TECH_015`)
2. If the question maps to a profile field, update `src/engine/profile-builder.ts`
3. Add tags for priority analysis
4. Add unit tests

## Code Style

- TypeScript strict mode
- No `any` — use `unknown` and narrow
- Name things by their actual purpose
- No phase/version labels in code
- Tests required for all new functionality

## Reporting Issues

Please use [GitHub Issues](https://github.com/asq-sheriff/embediq/issues) to report bugs or request features.
