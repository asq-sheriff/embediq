<!-- audience: public -->

# Writing a skill

A **skill** is EmbedIQ's fine-grained composition primitive — one unit
of focused expertise (HIPAA PHI handling, PCI cardholder data, a
team-specific code-review checklist, a proprietary logging
convention). Skills mix-and-match into any profile; a domain pack is
effectively a bundle of skills.

Two delivery formats:

- **`SKILL.md` directory** — YAML frontmatter + body, plus optional
  sibling files (`dlp.yaml`, `compliance.yaml`, `rules/*.md`,
  `ignore.txt`). Easy to hand-author or generate; validation checks
  can't be expressed this way (they need function bodies).
- **TypeScript module** — a default export that satisfies the `Skill`
  interface. Required when you need to ship validation checks.

## When to write a skill vs. a domain pack

| Choose a **skill** when… | Choose a **domain pack** when… |
|---|---|
| You have one focused concern (a DLP pattern set, a rule file, a priority category). | You're covering an entire industry vertical with coordinated questions, DLP, rules, and validation. |
| You want it composable with other skills. | You want auto-activation keyed on the industry answer. |
| You're iterating on a single team's guardrails. | You're publishing a pack others will reuse unchanged. |

Skills can be composed into new domain packs at runtime via
`DomainPackRegistry.composeFromSkills()` — see
[architecture/domain-packs-and-skills.md](../architecture/domain-packs-and-skills.md).

## The `Skill` interface

```ts
// src/skills/skill.ts
export interface Skill {
  id: string;                          // globally unique (dotted path recommended)
  name: string;                        // human-readable label
  version: string;                     // semver
  description: string;                 // one paragraph
  tags: readonly string[];             // for discovery

  source?: 'built-in' | 'external' | 'workspace';
  requires?: readonly string[];        // skill IDs this depends on
  conflicts?: readonly string[];       // skill IDs that cannot coexist

  questions?: readonly Question[];
  complianceFrameworks?: readonly ComplianceFrameworkDef[];
  priorityCategories?: Record<string, readonly string[]>;
  dlpPatterns?: readonly DlpPatternDef[];
  ruleTemplates?: readonly RuleTemplateDef[];
  ignorePatterns?: readonly string[];
  validationChecks?: readonly DomainValidationCheck[];
}
```

Every payload field is optional — a skill can be DLP-only, rules-only,
or questions-only. `requires` / `conflicts` are enforced by the
composer; missing dependencies or present conflicts throw at
composition time.

## Option A — `SKILL.md` directory

Layout:

```
skills/my-skill/
├── SKILL.md          # required — frontmatter + body
├── dlp.yaml          # optional — DLP patterns
├── compliance.yaml   # optional — frameworks + priorityCategories
├── rules/            # optional — one rule per .md file
│   └── my-rule.md
└── ignore.txt        # optional — newline-separated ignore patterns
```

Set `EMBEDIQ_SKILLS_DIR=./skills` (the default) and the registry
auto-loads every subdirectory containing a `SKILL.md` at startup.

### `SKILL.md` frontmatter

```md
---
id: team.access-control
name: Team Access Control Guardrails
version: 1.2.0
tags:
  - access-control
  - team
  - security
requires:
  - hipaa.core        # optional
conflicts:
  - legacy.open-access
---

This skill encodes our team's MFA / RBAC / session-management
guardrails. Add it to any profile that interacts with user-facing
services.
```

Required fields: `id`, `name`, `version`. `description` falls back to
the body if the frontmatter doesn't set it explicitly.

### `dlp.yaml`

```yaml
- name: Internal Access Token
  pattern: "\\bAT[A-Z0-9]{32}\\b"
  severity: CRITICAL
  description: "Detects internal AT-prefixed access tokens in code or test data."
```

Same shape as `DlpPatternDef`.

### `compliance.yaml`

```yaml
frameworks:
  - key: team_ac_1
    label: "Team AC-1 (Access control)"
    description: "Internal access-control standard."

priorityCategories:
  "Access Control":
    - access-control
    - mfa
    - rbac
```

### `rules/*.md`

One rule template per file; the filename (minus `.md`) becomes the
`filename` field in the emitted `RuleTemplateDef`. No frontmatter —
the whole file body is the rule content.

```md
# Team MFA Policy

- Every admin endpoint requires MFA.
- Session TTL ≤ 12 hours for administrative roles.
- Backup codes never stored plaintext.
```

### `ignore.txt`

```
# Team access control — sensitive operational data
secrets/
audit/
*.token
```

Blank lines and lines starting with `#` (in the body — distinct from
YAML frontmatter) are allowed; lines are passed through verbatim.

## Option B — TypeScript module

Use when you need validation checks (they require function bodies).

```ts
// skills/team-access-control.ts
import type { Skill } from 'embediq/skills';

export const teamAccessControlSkill: Skill = {
  id: 'team.access-control',
  name: 'Team Access Control Guardrails',
  version: '1.2.0',
  description: 'Internal access-control standard.',
  tags: ['access-control', 'team', 'security'],

  dlpPatterns: [
    {
      name: 'Internal Access Token',
      pattern: '\\bAT[A-Z0-9]{32}\\b',
      severity: 'CRITICAL',
      description: 'Detects internal AT-prefixed access tokens.',
    },
  ],

  validationChecks: [
    {
      name: 'MFA rule present',
      severity: 'error',
      failureMessage: 'The team-access-control skill requires an MFA rule.',
      check: (files) => files.some((f) => f.content.toLowerCase().includes('mfa')),
    },
  ],
};
```

Register it by adding the import to the built-in skills index (for
internal forks) or by calling `skillRegistry.register(...)` at app
startup in a wrapper.

## Composition — `requires` and `conflicts`

- **`requires`**: every listed skill ID must also be present in the
  composition. The composer throws `SkillCompositionError` if any
  dependency is missing.
- **`conflicts`**: none of the listed skill IDs may be present.
  Mutual conflicts prevent silently incompatible rule sets (e.g.
  `legacy.open-access` vs. `team.access-control`).

When the registry's `getForIndustry(industry)` hits a domain pack that
references this skill, the whole composition runs through
`composeSkills()` — conflicts or missing requirements surface as
startup errors, not silent wizard misbehavior.

### Collision resolution

When two composed skills emit overlapping items:

| Collision | Resolution |
|---|---|
| Same question `id` | First wins, warning recorded in `ComposedSkillPayload.warnings`. |
| Same framework `key` | First wins + warning. |
| Same DLP pattern `name` | First wins + warning. |
| Same rule template `filename` | First wins + warning. |
| Same validation `name` | First wins + warning. |
| Identical `ignorePatterns` lines | Deduplicated silently. |
| Priority category keys | Merged as set union across skills. |

Pass `allowFirstWins: false` to `composeSkills()` when you want
collisions to hard-error instead of merging.

## Loading mechanics

- External skills live under `EMBEDIQ_SKILLS_DIR` (default
  `./skills`). Every subdirectory with a `SKILL.md` becomes one
  skill.
- Malformed skill directories (missing required frontmatter, bad
  YAML) log an error and are skipped — one bad skill never breaks
  the registry boot.
- Duplicate `id` across loaded skills logs a warning; the first
  registration wins.

## Testing a skill locally

```bash
# 1. Drop the directory
mkdir -p skills/team-access-control
# … author SKILL.md + optional siblings

# 2. Restart the server; confirm the skill is visible
curl http://localhost:3000/api/skills/team.access-control

# 3. Exercise it via a domain pack that composes it, or via a test
# (see tests/unit/skill-composer.test.ts for the composer API)
```

## Workspace / org patterns

- Keep all workspace skills in a single ops repo. Sync into
  `EMBEDIQ_SKILLS_DIR` during deploy.
- Version skills with SemVer; publish changes in your internal
  changelog.
- Gate critical skills (security, compliance) behind a code-owned PR
  review so changes need cross-team approval.

## See also

- [Writing domain packs](writing-domain-packs.md) — coarse-grained
  wrapper
- [Writing templates](writing-templates.md) — pre-filled answer sets
- [Skills architecture](../architecture/domain-packs-and-skills.md)
- [`src/skills/skill-md.ts`](../../src/skills/skill-md.ts) — canonical
  SKILL.md loader (source of truth for the format)
- [`src/skills/skill-composer.ts`](../../src/skills/skill-composer.ts) —
  composition + conflict resolution
