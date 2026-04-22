# Patient portal


## Tech Stack

- Languages: typescript, python
- Build: npm
- CI/CD: github_actions

## Build & Test

- Install: `npm install`
- Build: `npm run build`

## Code Conventions

- Use TypeScript strict mode
- Prefer `const` over `let`, avoid `var`
- Use explicit return types on exported functions
- Follow PEP 8 style guide
- Use type hints on all function signatures

## Security Requirements

- Never commit secrets, API keys, or credentials
- NEVER include PHI in any form: code, comments, test fixtures, logs
- NEVER include PII in any form: code, comments, test fixtures, logs
- DLP hooks actively scan all edits for sensitive data patterns
- Follow OWASP Top 10 guidelines for all user-facing code

## Compliance

- HIPAA compliance is mandatory
- Never include PHI in code, comments, logs, or test data
- For PHI handling details, see .claude/rules/hipaa-compliance.md
- Never include PII in code, comments, logs, or test data

## Workflow

- Run tests before committing: see Build & Test section above
- Use /clear between unrelated tasks to manage context

## Additional Context

- Path-scoped rules: .claude/rules/*.md (auto-loaded when editing matching files)
- Security hooks: .claude/hooks/ (enforce PHI/PII/secret scanning)
