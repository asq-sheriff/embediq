# Enterprise services platform


## Tech Stack

- Languages: csharp
- Build: dotnet
- Testing: xunit
- CI/CD: github_actions

## Build & Test

- Install: `dotnet restore`
- Build: `dotnet build`
- Test: `dotnet test`

## Code Conventions

- Follow Microsoft C# coding conventions (PascalCase for types/methods, camelCase for locals)
- Use nullable reference types and `record` for value types
- Run `dotnet format` before commits

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
