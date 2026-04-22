<!-- audience: public -->

# EmbedIQ Configuration Templates

Drop directory for organizational baseline templates. Templates pre-answer
compliance and security questions so individual projects only configure
project-specific parts.

> **Authoring guide:** for the full template schema, locking semantics,
> recipes for org-specific baselines, and testing instructions, see
> [`docs/extension-guide/writing-templates.md`](../docs/extension-guide/writing-templates.md).

## Using Templates

Place `.yaml` files in this directory (or set `EMBEDIQ_TEMPLATES_DIR` to a custom path). Templates are loaded automatically at startup.

### Web UI
Templates appear as a selection screen before the Q&A phase. Selecting a template pre-fills answers and locks non-negotiable settings.

### CLI
The CLI offers template selection at startup when templates are available.

## Template Format

```yaml
id: my-template                    # Unique identifier
name: My Organization Baseline     # Display name
description: Short description     # Shown in selection UI
version: "1.0.0"                   # Semantic version
organization: Acme Corp            # Optional organization name
domainPackId: healthcare           # Optional domain pack to activate

prefilledAnswers:
  STRAT_002:                       # Question ID
    value: healthcare              # Pre-filled value
  REG_001:
    value: true
  REG_002:
    value:                         # Array values
      - hipaa
      - soc2

lockedQuestions:                    # Cannot be overridden in Edit phase
  - REG_001
  - REG_002

forcedQuestions:                    # Always shown even if branching would hide
  - REG_012
```

## Included Templates

| Template | File | Description |
|----------|------|-------------|
| HIPAA Healthcare | `hipaa-healthcare.yaml` | PHI detection, audit logging, strict security |
| PCI-DSS Finance | `pci-finance.yaml` | Cardholder data protection, strict security |
| SOC2 SaaS | `soc2-saas.yaml` | Audit logging, balanced security |

## Creating Custom Templates

1. Copy an existing template as a starting point
2. Set a unique `id`
3. Add `prefilledAnswers` for your organization's standards
4. Add `lockedQuestions` for non-negotiable settings
5. Place in this directory and restart EmbedIQ
