<!-- audience: public -->

# EmbedIQ External Domain Packs

Drop directory for custom domain packs. Place `.js` or `.mjs` files
here (or set `EMBEDIQ_PLUGINS_DIR` to a different path) and they are
loaded automatically at startup.

> **Authoring guide:** for the full `DomainPack` interface, the
> three built-in packs as worked examples, testing recipe, and
> publish-on-npm guidance, see
> [`docs/extension-guide/writing-domain-packs.md`](../docs/extension-guide/writing-domain-packs.md).

Minimal shape:

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

Interface source of truth: [`src/domain-packs/index.ts`](../src/domain-packs/index.ts).
