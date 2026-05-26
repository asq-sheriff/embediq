---
description: TypeScript conventions
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript Conventions

- Use strict mode
- Explicit return types on exported functions
- Prefer `interface` over `type` for object shapes
- Use `const` by default, `let` only when reassignment is needed
- No `any` — use `unknown` and narrow with type guards