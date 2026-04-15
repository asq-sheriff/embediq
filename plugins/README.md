# EmbedIQ External Domain Packs

Place custom domain pack files (`.js` or `.mjs`) in this directory. They are loaded automatically at startup.

Each file must export a default object conforming to the `DomainPack` interface:

```javascript
export default {
  id: 'my-domain',
  name: 'My Domain Pack',
  version: '1.0.0',
  description: 'Custom domain-specific rules',
  questions: [],
  complianceFrameworks: [],
  priorityCategories: {},
  dlpPatterns: [],
  ruleTemplates: [],
  ignorePatterns: [],
  validationChecks: [],
};
```

Override the plugin directory with `EMBEDIQ_PLUGINS_DIR` env var.

See `src/domain-packs/index.ts` for the full interface definition.
