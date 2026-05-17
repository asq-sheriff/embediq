import type { Skill } from '../skill.js';

/**
 * v3.3 / 6L — Healthcare RAG pipeline skill (family member).
 *
 * The Option-B design (industry-agnostic RAG scaffold with industry-
 * aware content) means the path-scoped rule file and the runbook are
 * emitted by the `rag-scaffold` generator directly, not via skill
 * composition. This skill exists as a discoverable marker — the
 * healthcare member of a planned family (`finance.rag`,
 * `education.rag`, etc.) that future composability work will
 * auto-compose against a profile.
 *
 * Today the skill carries DLP and ignore patterns specific to
 * healthcare-RAG. They are not auto-composed yet — wire-up is a
 * follow-on item. The skill is registered for the `/api/skills`
 * surface and to keep the family structure visible.
 */
export const healthcareRagSkill: Skill = {
  id: 'healthcare.rag',
  name: 'Healthcare RAG Pipeline',
  version: '1.0.0',
  description:
    'HIPAA-aware retrieval-augmented generation enforcement. Companion ' +
    'to the rag-scaffold generator; carries vector-dump DLP patterns ' +
    'and RAG-runtime ignore patterns for healthcare profiles.',
  tags: ['healthcare', 'hipaa', 'rag', 'phi', 'compliance', 'local-ai'],
  source: 'built-in',
  requires: ['healthcare.full'],

  dlpPatterns: [
    {
      name: 'rag-vector-dump-committed',
      pattern: '(\\.embeddings\\.bin|\\bvectors?\\.dump\\b|\\bvectors?\\.bin\\b)',
      severity: 'CRITICAL',
      description:
        'Vector dumps may contain reconstructable embeddings of PHI. ' +
        'Never commit raw vector files; regenerate on each deploy.',
      requiresFramework: 'hipaa',
    },
    {
      name: 'rag-embedding-cache-committed',
      pattern: '(\\/model-cache\\/|\\/embedding-cache\\/|\\.embedding-cache\\b)',
      severity: 'HIGH',
      description:
        'Embedding caches can leak both model weights and PHI-derived ' +
        'representations. Keep them out of source control.',
      requiresFramework: 'hipaa',
    },
  ],

  ignorePatterns: [
    '.embeddings/',
    '.vectors/',
    'model-cache/',
    'embedding-cache/',
    '*.embeddings.bin',
    '*.vectors.dump',
    'rag/.env',
    'rag/data/',
  ],
};
