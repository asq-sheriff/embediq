# Enterprise data platform


## Tech Stack

- Languages: typescript, python
- Build: npm
- Testing: jest, pytest
- CI/CD: github_actions

## Build & Test

- Install: `npm install`
- Build: `npm run build`
- Test: `npm test`
- Test: `pytest`

## Code Conventions

- Use TypeScript strict mode
- Prefer `const` over `let`, avoid `var`
- Use explicit return types on exported functions
- Follow PEP 8 style guide
- Use type hints on all function signatures

## Workflow

- Run tests before committing: see Build & Test section above
- Use /clear between unrelated tasks to manage context

## Your Role Focus

- Build features following the conventions in `.claude/rules/<language>.md` for every language you touch
- Tests-first: write the failing test before the implementation (per TDD enforcement when enabled)
- Run the per-language build + test commands above before every commit
- Keep PRs small and topical — one feature or refactor per branch
- Reference path-scoped rules via `.claude/rules/*.md`; Claude auto-loads them by file pattern

## Additional Context

- Path-scoped rules: .claude/rules/*.md (auto-loaded when editing matching files)
