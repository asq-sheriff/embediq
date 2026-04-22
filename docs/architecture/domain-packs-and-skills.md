<!-- audience: public -->

# Architecture — domain packs & skills

Two related extensibility surfaces. **Domain packs** are the
coarse-grained bundle (one per industry vertical). **Skills** are the
fine-grained primitive domain packs compose from — you can mix-and-
match skills directly without going through a pack.

**Source**:
[`src/domain-packs/`](../../src/domain-packs/) and
[`src/skills/`](../../src/skills/).

For the user / author view, see
[extension-guide/writing-domain-packs.md](../extension-guide/writing-domain-packs.md)
and [extension-guide/writing-skills.md](../extension-guide/writing-skills.md).

## The relationship

```
          skills                         domain packs
         (fine-grained)                 (coarse-grained)
       ┌───────────┐                    ┌─────────────────┐
       │ hipaa.phi │                    │  healthcare     │
       │ hipaa.baa │  ────compose────▶  │  (full pack)    │
       │ hipaa.ident│                    └─────────────────┘
       └───────────┘
            ▲
            │  register()
       ┌────┴────┐
       │SkillReg │
       └─────────┘
```

A domain pack's payload can be **composed from skills at registration
time** via `DomainPackRegistry.composeFromSkills()`. New code can
also skip the pack layer entirely and compose skills directly when
building a custom configuration.

## `DomainPack` — the interface

```ts
interface DomainPack {
  id: string;
  name: string;
  version: string;
  description: string;
  questions: Question[];
  complianceFrameworks: ComplianceFrameworkDef[];
  priorityCategories: Record<string, string[]>;
  dlpPatterns: DlpPatternDef[];
  ruleTemplates: RuleTemplateDef[];
  ignorePatterns: string[];
  validationChecks: DomainValidationCheck[];
}
```

Every field is a flat array or map — no functions beyond the one in
`validationChecks[].check`. Packs are pure data + a single
predicate per validation check.

## `DomainPackRegistry` — loading + industry mapping

Singleton registry at
[`src/domain-packs/registry.ts`](../../src/domain-packs/registry.ts).
Responsibilities:

- Register built-in packs (healthcare, finance, education).
- Load external packs from `EMBEDIQ_PLUGINS_DIR` (ESM files whose
  default export satisfies `DomainPack`).
- Map industry keys to pack IDs via `INDUSTRY_TO_PACK` (the
  healthcare pack fires for `healthcare`, `health_tech`, `pharma`;
  the finance pack for `finance`, `fintech`, `banking`,
  `insurance`, `ecommerce`; the education pack for `education`,
  `edtech`, `k12`, `higher_ed`).
- Expose `composeFromSkills(skillIds, meta)` for skill-aware code.

## `Skill` — the interface

```ts
interface Skill {
  id: string;                  // dotted path recommended (healthcare.hipaa-phi)
  name: string;
  version: string;
  description: string;
  tags: readonly string[];
  source?: 'built-in' | 'external' | 'workspace';
  requires?: readonly string[];
  conflicts?: readonly string[];
  // Every payload field optional:
  questions?: readonly Question[];
  complianceFrameworks?: readonly ComplianceFrameworkDef[];
  priorityCategories?: Record<string, readonly string[]>;
  dlpPatterns?: readonly DlpPatternDef[];
  ruleTemplates?: readonly RuleTemplateDef[];
  ignorePatterns?: readonly string[];
  validationChecks?: readonly DomainValidationCheck[];
}
```

Two key differences from `DomainPack`:

1. **Every payload field is optional.** A skill can be DLP-only,
   questions-only, rules-only, whatever.
2. **`requires` / `conflicts`.** The composer enforces dependency +
   exclusion invariants at compose time.

## `SkillRegistry` and `SkillComposer`

Registry: singleton at
[`src/skills/skill-registry.ts`](../../src/skills/skill-registry.ts).
Loads three built-in skills (`healthcare.full`, `finance.full`,
`education.full`) plus external skills from `EMBEDIQ_SKILLS_DIR`.

Composer: pure function at
[`src/skills/skill-composer.ts`](../../src/skills/skill-composer.ts).

```ts
function composeSkills(
  skills: readonly Skill[],
  options?: { allowFirstWins?: boolean }
): ComposedSkillPayload;
```

Order-sensitive: skills earlier in the list win on collisions. The
composer emits warnings for every collision (except identical
ignore-pattern lines, which are silently deduped).

### Invariant checks

1. Every skill in `requires` must be present in the list → throws
   `SkillCompositionError` on missing dependency.
2. No skill in `conflicts` may be present → throws on conflict.

Both fire before any payload merging, so the composer never produces
a partially-merged invalid payload.

### Collision resolution

| Collision | Resolution (`allowFirstWins: true`) | Resolution (`false`) |
|---|---|---|
| Same question `id` | First wins + warning | Throw |
| Same framework `key` | First wins + warning | Throw |
| Same DLP pattern `name` | First wins + warning | Throw |
| Same rule template `filename` | First wins + warning | Throw |
| Same validation `name` | First wins + warning | Throw |
| Identical `ignorePatterns` line | Silently deduped | Silently deduped |
| `priorityCategories` key | Set union of tags | Set union of tags |

The domain-pack composition path (`composeFromSkills`) uses
`allowFirstWins: true` so startup doesn't fail on benign overlap.
Tests can pass `false` to surface every collision as a hard error.

## Loading mechanics — precedence

Order of registration at app start:

1. Built-in domain packs (compiled into the binary, always present).
2. External domain packs from `EMBEDIQ_PLUGINS_DIR` (module load).
3. Built-in skills (compiled, always present).
4. External skills from `EMBEDIQ_SKILLS_DIR` (directory scan).

Each registry rejects duplicate IDs, keeping the first registration
and logging a warning.

## v1 delivery shape

Today each built-in pack ships as a **single bundled skill** with
the same name:

- `healthcare.full` skill = healthcare domain pack
- `finance.full` skill = finance domain pack
- `education.full` skill = education domain pack

The skill-level split (e.g. `healthcare.hipaa-core` +
`healthcare.hitech` + `healthcare.interop` composed into the full
healthcare pack) is a roadmap iteration — the architecture is in
place; the decomposition is pending.

When it lands, existing code that consumes `DomainPack.questions`
etc. will not change because the composed payload still has the same
shape.

## The DomainPack ⇄ Skill symmetry

Both interfaces expose the same payload vocabulary
(`questions`, `complianceFrameworks`, `priorityCategories`,
`dlpPatterns`, `ruleTemplates`, `ignorePatterns`,
`validationChecks`). That intentional symmetry is why
`SkillComposer.compose()` produces a shape that slots directly into
a synthesized `DomainPack`.

Adding a new vocabulary field to one means adding it to the other —
the composer is the enforcement point.

## Why two layers instead of one?

- **Packs** are the mental model for an industry — "I'm in
  healthcare, give me the pack."
- **Skills** are the mental model for fine-grained composition — "I
  want HIPAA's PHI handling + our org's audit checklist + no
  interop rules because we're internal-only."
- Collapsing to just skills would force users to assemble five-ish
  skills manually even for common cases. Collapsing to just packs
  would block fine-grained composition.

## See also

- [Writing domain packs](../extension-guide/writing-domain-packs.md)
- [Writing skills](../extension-guide/writing-skills.md)
- [`src/domain-packs/built-in/`](../../src/domain-packs/built-in/) —
  three reference packs
- [`src/skills/`](../../src/skills/) — skill interface, composer,
  SKILL.md loader
