<!-- audience: public -->

# Writing a configuration template

**Configuration templates** are pre-built answer sets that short-
circuit the wizard for known organizational patterns. Operators ship
one, users pick it from a selection screen, and the wizard skips (or
locks) the questions the template already answers. Three templates
ship today:

| ID | File | Purpose |
|---|---|---|
| `hipaa-healthcare` | `templates/hipaa-healthcare.yaml` | Full PHI handling stack for HIPAA-covered healthcare projects. |
| `pci-finance` | `templates/pci-finance.yaml` | Cardholder-data protection for PCI-DSS scope. |
| `soc2-saas` | `templates/soc2-saas.yaml` | SOC 2 Type II controls for a typical SaaS. |

Templates live under `EMBEDIQ_TEMPLATES_DIR` (default `./templates`)
as YAML files. The web UI surfaces them via `GET /api/templates`.

## When to write a template

- Your org runs dozens of teams with near-identical compliance
  baselines. A template locks the compliance decisions so every team
  answers only the project-specific questions.
- You want to enforce opinionated defaults without rewriting
  generators (permission tier, audit logging, specific languages).
- You need to hide a decision from end users entirely — lock the
  question so the Edit phase can't override it.

Templates are **pure configuration**: no executable code, no
conditional logic beyond the existing wizard branching. If you need
code, write a [domain pack](writing-domain-packs.md) or a
[skill](writing-skills.md) instead.

## Template schema

```yaml
id: my-template                    # unique identifier (kebab-case recommended)
name: My Organization Baseline     # shown in the selection UI
description: >
  One-paragraph summary of what the template opts into.
version: "1.0.0"                   # semver; shown in the UI
organization: Acme Corp            # optional, shown in the UI

# Optional — auto-activate a domain pack when the template is used.
domainPackId: healthcare

# Pre-fill answers. Keys are question IDs; values are the canonical
# answer shape (primitive, array of strings, boolean, or number).
prefilledAnswers:
  STRAT_002:
    value: healthcare
  REG_001:
    value: true
  REG_002:
    value:
      - hipaa
      - soc2
  REG_008:
    value: strict

# Questions the Edit phase cannot override.
lockedQuestions:
  - REG_001
  - REG_002
  - REG_008

# Questions the wizard must show even when branching would hide them.
# Useful when the template pre-fills an answer that normally unlocks
# a follow-up question that the user must still confirm.
forcedQuestions:
  - REG_012
```

Required fields: `id`, `name`, `description`, `version`.
`prefilledAnswers` is empty by default (a template with no pre-fills
is useless — but legal).

## Field guide

### `prefilledAnswers`

A map from question ID to `{ value }`. The value type must match the
question's declared `QuestionType`:

| Question type | Value |
|---|---|
| `free_text` | string |
| `single_choice` | string (the option `key`) |
| `multi_choice` | array of strings (option keys) |
| `scale` | number (1–5) |
| `yes_no` | boolean |

Check `src/bank/question-registry.ts` for the canonical type of every
built-in question ID.

### `lockedQuestions`

List of question IDs the user cannot override in the Edit phase. Pair
with `prefilledAnswers` for every ID you lock — locking without pre-
filling means the question is shown without any answer and the user
can't proceed.

### `forcedQuestions`

List of question IDs the wizard **always** shows, even when normal
branching logic would hide them. Use when a pre-filled answer unlocks
a chain of follow-up questions that the wizard logic would otherwise
skip.

### `domainPackId`

Optional. When set, the template explicitly activates the named pack
at wizard start rather than waiting for the user to pick an industry.
Pair with a `prefilledAnswers` entry for `STRAT_002` that matches.

## Worked example — "Internal Staging App" template

A template for a common internal tool shape: TypeScript + Node, no
regulated data, moderate budget, no custom permissions.

```yaml
id: internal-staging
name: Internal Staging App
description: >
  Default answer set for internal TypeScript services on staging
  infrastructure — developer role, moderate budget, no regulated data.
version: "0.1.0"
organization: Acme Platform Team

prefilledAnswers:
  STRAT_000:
    value: developer
  STRAT_000a:
    value: intermediate
  STRAT_002:
    value: saas
  OPS_001:
    value: small
  TECH_001:
    value:
      - typescript
  TECH_005:
    value:
      - npm
  TECH_006:
    value:
      - jest
  FIN_001:
    value: moderate
  REG_001:
    value: false

# Freeze the non-negotiable answers.
lockedQuestions:
  - STRAT_002
  - TECH_001
  - REG_001
```

Users who pick this template only answer the genuinely per-project
questions (business domain, which MCP servers, which commands).

## Testing a template locally

```bash
# 1. Drop the file
cp my-template.yaml templates/

# 2. Restart the server
npm run start:web

# 3. Verify the template is registered
curl http://localhost:3000/api/templates | jq '.[] | select(.id == "my-template")'

# 4. Run the wizard — the template appears in the selection screen
open http://localhost:3000
```

For CLI, templates appear at startup when `templates/` contains at
least one file.

## Organization patterns

- **One template per org per deployment shape.** Platform +
  production + staging might warrant three templates, each locking
  its context.
- **Keep templates small.** If you're pre-filling 40+ questions,
  you're probably trying to encode a domain pack — switch to one.
- **Version templates.** The `version` field is surfaced in the UI.
  Bump it when you change `lockedQuestions` — locked questions the
  user could previously edit being forcibly locked is a behavior
  change they should notice.
- **Source-control templates in an ops repo.** Every change is a PR
  with review. Deploy by syncing the `.yaml` files into the target
  `templates/` directory and restarting the server.

## Caveats

- **Templates don't override domain-pack-added questions.** A
  domain pack adds new questions (e.g. `HC_001` in healthcare). The
  template can pre-fill and lock those IDs, but only if the pack is
  loaded at registry startup. External packs loaded via
  `EMBEDIQ_PLUGINS_DIR` work with template pre-fills as long as they
  register before template loading (the registry already orders this
  correctly).
- **Pre-filled answers don't skip the full wizard.** They skip the
  specific questions you pre-fill. All other questions still run. To
  generate without any user interaction, call `/api/generate`
  directly with a pre-built answer map.
- **No code / no conditions.** Templates can't encode "if X then Y"
  branching logic. That's what the question bank's `showConditions`
  are for — templates can only pre-fill leaf values.

## See also

- [Writing domain packs](writing-domain-packs.md) — when a template
  isn't enough
- [Writing skills](writing-skills.md) — mix-and-match composition
- [Question registry source](../../src/bank/question-registry.ts) —
  canonical question IDs and types
- [Template loader source](../../src/bank/profile-templates.ts) —
  parsing + validation rules
