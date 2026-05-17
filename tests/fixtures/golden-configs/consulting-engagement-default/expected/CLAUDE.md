# Client engagement platform


## Tech Stack

- Languages: typescript
- Build: npm
- CI/CD: github_actions

## Build & Test

- Install: `npm install`
- Build: `npm run build`

## Code Conventions

- Use TypeScript strict mode
- Prefer `const` over `let`, avoid `var`
- Use explicit return types on exported functions

## Security Requirements

- Never commit secrets, API keys, or credentials
- Follow OWASP Top 10 guidelines for all user-facing code

## Compliance

- SOC2 compliance is mandatory

## Workflow

- Run tests before committing: see Build & Test section above
- Use /clear between unrelated tasks to manage context

## Additional Context

- Path-scoped rules: .claude/rules/*.md (auto-loaded when editing matching files)
- Security hooks: .claude/hooks/ (enforce PHI/PII/secret scanning)
