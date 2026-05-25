# Claims adjudication services


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

## Your Role Focus

- Architectural decisions live in ADRs — reference `.claude/rules/security.md` and any domain-specific rule files when proposing them
- Cross-cutting concerns (auth, audit, observability) are the lead's ownership zone — review every PR that touches them
- Coordinate code review across the team; agent teams (`.claude/agents/`) accelerate this when 3-5 parallel workstreams are active
- Bridge product requirements and technical implementation: validate that each story has clear acceptance criteria, edge cases, and rollback plan
- Technical-debt register: surface it in standups and roadmap discussions, not in a forgotten file

## Additional Context

- Path-scoped rules: .claude/rules/*.md (auto-loaded when editing matching files)
- Security hooks: .claude/hooks/ (enforce PHI/PII/secret scanning)
