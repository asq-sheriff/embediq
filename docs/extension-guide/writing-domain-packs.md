<!-- audience: public -->

# Writing a domain pack

A **domain pack** is the coarse-grained extension point for an entire
industry vertical — it adds questions, compliance frameworks, DLP
patterns, rule templates, ignore patterns, and validation checks in
one bundle. The three built-in packs (Healthcare, Finance, Education)
are domain packs; so is anything you drop into `EMBEDIQ_PLUGINS_DIR`.

For finer-grained composition (mix-and-match), see
[writing-skills.md](writing-skills.md). Skills are the lower-level
primitive domain packs compose.

## When to write a domain pack

- You operate in a vertical not covered by the built-ins (legal tech,
  manufacturing with ISO 13485, aerospace with DO-178C, etc.).
- You need to extend an existing pack with organization-specific DLP
  patterns or rule templates (e.g. "HIPAA + our internal PHI hash
  pattern").
- You want the whole bundle auto-activated from the industry answer
  (STRAT_002) without asking the user to configure it manually.

## The `DomainPack` interface

```ts
// src/domain-packs/index.ts
export interface DomainPack {
  id: string;                                        // unique
  name: string;                                      // human label
  version: string;                                   // semver
  description: string;                               // one paragraph
  questions: Question[];                             // injected into the bank
  complianceFrameworks: ComplianceFrameworkDef[];    // extends REG_002 options
  priorityCategories: Record<string, string[]>;      // priority tag map
  dlpPatterns: DlpPatternDef[];                      // injected into hooks
  ruleTemplates: RuleTemplateDef[];                  // injected into rules
  ignorePatterns: string[];                          // injected into ignore file
  validationChecks: DomainValidationCheck[];         // run post-generation
}
```

Every field is required in the type but empty arrays / objects are
acceptable for a minimal pack (e.g. one that only adds DLP patterns).

## Anatomy — worked example

Drop this into `EMBEDIQ_PLUGINS_DIR/legaltech.mjs`:

```js
export default {
  id: 'legaltech',
  name: 'Legal Tech',
  version: '0.1.0',
  description:
    'Domain pack for legal-tech software subject to attorney-client '
    + 'privilege, ABA Model Rules, and state bar eDiscovery guidelines.',

  // Additional wizard questions shown when industry=legal
  questions: [
    {
      id: 'LEGAL_001',
      dimension: 'Regulatory Compliance',
      text: 'Does your system handle attorney-client privileged communications?',
      helpText:
        'Privileged communications require additional access controls and '
        + 'documented retention / destruction policies.',
      type: 'yes_no',
      required: true,
      order: 300,
      showConditions: [
        { questionId: 'STRAT_002', operator: 'any_of', value: ['legal', 'legaltech'] },
      ],
      tags: ['legaltech', 'privilege', 'access_control'],
    },
  ],

  complianceFrameworks: [
    {
      key: 'aba_1_6',
      label: 'ABA Model Rule 1.6 (Confidentiality)',
      description: 'Client information confidentiality obligations.',
    },
  ],

  priorityCategories: {
    'Privilege Protection': ['privilege', 'confidentiality', 'access_control'],
  },

  dlpPatterns: [
    {
      name: 'Bar number (CA)',
      pattern: '\\bCA\\s*Bar\\s*#?\\s*\\d{5,6}\\b',
      severity: 'HIGH',
      description: 'Detects California bar numbers in code or test data.',
    },
  ],

  ruleTemplates: [
    {
      filename: 'privilege-handling.md',
      pathScope: ['src/**', 'tests/**'],
      requiresFramework: 'aba_1_6',
      content:
        '# Attorney-Client Privilege\n\n'
        + '- Never log privileged content in plaintext.\n'
        + '- Use separate storage for privileged items with role-gated access.\n'
        + '- Test fixtures must use synthetic content — no real client data.\n',
    },
  ],

  ignorePatterns: [
    '# Legal Tech — privileged content and case data',
    'case_files/',
    'privileged/',
    '*.ediscovery',
  ],

  validationChecks: [
    {
      name: 'Privilege rule template present when ABA 1.6 selected',
      severity: 'error',
      requiresFramework: 'aba_1_6',
      failureMessage:
        'Projects handling privileged communications must include the privilege-handling rule template.',
      check: (files) =>
        files.some((f) => f.relativePath.includes('privilege-handling')),
    },
  ],
};
```

Run `npm start`; the wizard loads the pack at boot, surfaces LEGAL_001
when the user picks a legal-tech industry, and emits
`privilege-handling.md` into `.claude/rules/` if the user selects
`aba_1_6` from the extended REG_002 options.

## Field-by-field

### `questions[]`

Each question follows the same shape as the built-in bank (see
[`src/types/index.ts`](../../src/types/index.ts)). Conventions:

- **ID prefix** — use a short uppercase prefix unique to your pack
  (e.g. `LEGAL_`, `AERO_`, `ISO_`).
- **Order** — start at 200+ to avoid clashing with built-in orders.
- **Dimension** — pick one of the seven canonical dimensions.
- **`showConditions`** — AND-joined; use `any_of` against STRAT_002
  (industry) to gate on the active industry.

### `complianceFrameworks[]`

Extends the options shown for REG_002. Use a lowercase
underscore-separated key (e.g. `aba_1_6`) and a friendly label. If you
later want the DLP patterns / rule templates to only fire when the
user selects the framework, set `requiresFramework` on those items.

### `priorityCategories`

Map of category name → tags. When the user's answers contain any of
those tags, the priority analyzer boosts the category in the derived
profile priorities. Good names align with the built-ins
(`Security & Compliance`, `Developer Productivity`, etc.) — use a new
name only when it's genuinely distinct.

### `dlpPatterns[]`

Passed into the DLP scanner hook. Each entry:

```ts
{
  name: string;
  pattern: string;                        // Python-flavored regex
  severity: 'HIGH' | 'CRITICAL';
  description: string;
  requiresFramework?: string;             // gate on REG_002 selection
}
```

`severity: 'CRITICAL'` makes DLP match block a tool invocation;
`'HIGH'` warns without blocking.

### `ruleTemplates[]`

Markdown files emitted into `.claude/rules/` (and equivalent paths
for other targets). Each entry:

```ts
{
  filename: string;                       // e.g. 'privilege-handling.md'
  pathScope: string[];                    // glob list; empty = always-apply
  content: string;                        // full markdown body
  requiresFramework?: string;
}
```

Cursor's target turns `pathScope` into MDC `globs`; Copilot's target
turns it into `applyTo`. Claude Code uses `pathScope` for path-scoped
rule loading.

### `ignorePatterns[]`

Plain-text lines appended to `.claudeignore`. Start with a comment
line (`# <Domain name> — reason`) so operators know which pack added
them.

### `validationChecks[]`

Post-generation compliance checks. Each entry:

```ts
{
  name: string;
  severity: 'error' | 'warning';
  failureMessage: string;
  requiresFramework?: string;
  check: (files: GeneratedFile[], profile: UserProfile) => boolean;
}
```

`check()` returns `true` on pass. Return `false` to fail the
validator (`error` severity fails the generation; `warning` just
logs).

## Loading mechanics

- External packs live under `EMBEDIQ_PLUGINS_DIR` (default
  `./plugins`). Every `.js` and `.mjs` file is loaded; subdirectories
  are ignored.
- Each file must default-export a value that satisfies `DomainPack`
  (duck-typed at load — the registry checks `id`, `name`, `version`,
  and the four array fields).
- Packs are loaded at app startup, after the built-ins. A duplicate
  `id` logs a warning and the first registration wins.
- Auto-activation is keyed on the industry answer (STRAT_002). The
  built-in industry → pack map lives in
  [`src/domain-packs/registry.ts`](../../src/domain-packs/registry.ts)
  under `INDUSTRY_TO_PACK`. External packs can declare their own
  industry keys; the user just needs to pick that industry in the
  wizard.

## Testing a custom pack locally

```bash
# 1. Drop your pack file
mkdir -p plugins
cp my-pack.mjs plugins/

# 2. Confirm registration
curl http://localhost:3000/api/domain-packs | jq '.[] | select(.id == "my-pack")'

# 3. Run the wizard — your questions should appear when the industry matches
npm start
```

## Publishing

There's no central registry yet. Recommended patterns:

- **Internal repos**: vendor the `.mjs` file into your ops repo and
  distribute via a config-management tool (Ansible, Chef, Kustomize
  overlays). Point `EMBEDIQ_PLUGINS_DIR` at the checked-out path.
- **npm**: publish as a regular npm package with a default export,
  install alongside EmbedIQ, and symlink into `plugins/` as part of
  your deploy.
- **OCI image**: bake the pack into a custom EmbedIQ image layered on
  top of the official Dockerfile.

Versioning — use standard SemVer. The `version` field lands in the
`/api/domain-packs` response and in generated file stamps for
traceability.

## Tips + caveats

- **Keep `check()` pure.** Validation runs synchronously against the
  generated `GeneratedFile[]`. No I/O, no network calls.
- **DLP patterns are shell-safe regex.** They're interpolated into
  Python code — avoid characters that need escaping in the emitted
  string.
- **Don't duplicate across packs.** The composer dedups identical DLP
  pattern names and identical ignore-pattern lines; other fields
  (rule filenames) collide and the first wins.
- **Honor `requiresFramework` consistently.** A pattern or rule
  guarded by a framework key only fires when the user selects it; a
  pattern without the guard always fires. Mix unguarded baseline
  coverage with framework-guarded specialties.

## See also

- [Writing skills](writing-skills.md) — finer-grained composition
- [Writing templates](writing-templates.md) — pre-filled answer sets
  that pair with a domain pack
- [Domain packs architecture](../architecture/domain-packs-and-skills.md)
- [Source](../../src/domain-packs/built-in/) — the three built-in
  packs are the best reference
