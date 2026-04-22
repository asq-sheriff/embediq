---
description: Security rules for all code
---

# Security Rules

- Never hardcode secrets, API keys, passwords, or tokens
- Never log sensitive data (PII, PHI, credentials)
- Validate all user input at system boundaries
- Use parameterized queries for all database operations
- Follow OWASP Top 10 guidelines
- CRITICAL: No PHI in code, comments, test data, or logs
- CRITICAL: No PII in code, comments, test data, or logs
- DLP hooks are active — all edits are scanned for sensitive patterns