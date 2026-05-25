import { Dimension, QuestionType, ConditionOperator } from '../../types/index.js';
import type { DomainPack } from '../index.js';

/**
 * v4.0 / 8G — NIST AI Risk Management Framework domain pack.
 *
 * Maps NIST AI RMF 1.0 (Govern / Map / Measure / Manage) and the
 * AI 600-1 Generative AI Profile onto EmbedIQ's domain-pack interface:
 * questions surface AI RMF posture in the wizard, rule templates encode
 * the highest-value RMF expectations as Claude Code rules, and
 * validation checks confirm the generated harness includes the
 * AI-RMF-aligned artifacts.
 *
 * Honest scope boundary: AI RMF governs the WHOLE AI system —
 * organizational accountability, governance roles, system-level
 * measurement, ongoing risk management. EmbedIQ produces the
 * developer-side harness. This pack covers what the harness can
 * reasonably enforce (documentation, intended-use scoping,
 * confabulation reminders for GenAI, risk-tier gating) and
 * deliberately does NOT claim to address governance roles or
 * system-level measurement. Operators bring those from the broader
 * RMF program; the harness is one input.
 *
 * Composition: this pack is NOT industry-driven. Operators compose
 * it with their industry pack (healthcare + nist-ai-rmf, finance +
 * nist-ai-rmf) via `domainPackRegistry.composeFromPacks(...)` to get
 * the combined surface.
 */
export const nistAiRmfPack: DomainPack = {
  id: 'nist-ai-rmf',
  name: 'NIST AI Risk Management Framework + AI 600-1 GenAI Profile',
  version: '1.0.0',
  description:
    'Domain pack mapping NIST AI RMF 1.0 (Govern / Map / Measure / Manage) and the AI 600-1 '
    + 'Generative AI Profile onto the EmbedIQ wizard + harness. Surfaces AI-RMF-specific questions, '
    + 'four path-scoped rule templates (one per RMF function), and validation checks confirming the '
    + 'harness includes the expected RMF artifacts. Composable with industry packs (healthcare, '
    + 'finance, education, etc.) for combined coverage.',

  questions: [
    {
      id: 'AI_001',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Has your organization documented its AI risk tolerance and acceptable-use policy for this system?',
      helpText:
        'NIST AI RMF — Govern function. A documented risk tolerance (which AI uses are in-scope, '
        + 'which are out, what residual risk is acceptable) is the foundation of every other RMF '
        + 'activity. The harness can remind the agent of these constraints, but the document itself '
        + 'is operator-supplied.',
      type: QuestionType.YES_NO,
      required: true,
      order: 300,
      showConditions: [
        { questionId: 'REG_002', operator: ConditionOperator.CONTAINS, value: 'nist-ai-rmf' },
      ],
      tags: ['nist-ai-rmf', 'govern', 'risk-tolerance'],
    },
    {
      id: 'AI_002',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Which AI RMF risk tier does this system fall into?',
      helpText:
        'NIST AI RMF — Map function. The risk tier shapes the rigor of the controls the harness '
        + 'enforces. EmbedIQ does not assign the tier — your AI Governance Board or equivalent does.',
      type: QuestionType.SINGLE_CHOICE,
      options: [
        { key: 'low', label: 'Low — internal tooling, no external impact, reversible decisions' },
        { key: 'limited', label: 'Limited — internal automation with documented review gates' },
        { key: 'elevated', label: 'Elevated — workforce-facing AI with bias / accuracy / privacy stakes' },
        { key: 'high', label: 'High — consequential decisions, regulated outputs, or vulnerable populations' },
      ],
      required: true,
      order: 301,
      showConditions: [
        { questionId: 'REG_002', operator: ConditionOperator.CONTAINS, value: 'nist-ai-rmf' },
      ],
      tags: ['nist-ai-rmf', 'map', 'risk-tier'],
    },
    {
      id: 'AI_003',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Is this system in scope for the AI 600-1 Generative AI Profile?',
      helpText:
        'Coding agents that produce generative outputs (code, documentation, agent instructions) '
        + 'are in scope. If yes, the harness will include confabulation-mitigation reminders, '
        + 'data-leakage hooks, and value-chain integrity guidance per AI 600-1.',
      type: QuestionType.YES_NO,
      required: true,
      order: 302,
      showConditions: [
        { questionId: 'REG_002', operator: ConditionOperator.CONTAINS, value: 'nist-ai-rmf' },
      ],
      tags: ['nist-ai-rmf', 'ai-600-1', 'generative-ai'],
    },
    {
      id: 'AI_004',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'How does your team monitor AI system trustworthiness over time?',
      helpText:
        'NIST AI RMF — Measure function. The harness records artifact provenance + audit trail; '
        + 'the operator owns the broader monitoring program (model drift, performance regression, '
        + 'bias measurement, incident reporting).',
      type: QuestionType.MULTI_CHOICE,
      options: [
        { key: 'audit-log', label: 'Audit log review (cadence: monthly or better)' },
        { key: 'drift-monitoring', label: 'Model / output drift monitoring' },
        { key: 'bias-testing', label: 'Periodic bias / fairness testing' },
        { key: 'incident-reporting', label: 'AI incident reporting channel' },
        { key: 'human-review', label: 'Human review of high-stakes outputs' },
        { key: 'none', label: 'No formal monitoring program yet' },
      ],
      required: false,
      order: 303,
      showConditions: [
        { questionId: 'REG_002', operator: ConditionOperator.CONTAINS, value: 'nist-ai-rmf' },
      ],
      tags: ['nist-ai-rmf', 'measure', 'monitoring'],
    },
    {
      id: 'AI_005',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Who has authority to suspend or restrict the AI system in response to a discovered risk?',
      helpText:
        'NIST AI RMF — Manage function. A named authority + escalation path is required. The '
        + 'harness emits this in the generated runbook so the agent and reviewers know the chain.',
      type: QuestionType.FREE_TEXT,
      required: false,
      order: 304,
      showConditions: [
        { questionId: 'REG_002', operator: ConditionOperator.CONTAINS, value: 'nist-ai-rmf' },
      ],
      tags: ['nist-ai-rmf', 'manage', 'escalation'],
    },
    {
      id: 'AI_006',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Has the AI system received an external assessment (third-party audit, red-team exercise, certification)?',
      helpText:
        'AI RMF encourages independent assessment for elevated- and high-risk tiers. Operators '
        + 'record the assessment reference in the harness so the agent does not undercut its '
        + 'conclusions.',
      type: QuestionType.SINGLE_CHOICE,
      options: [
        { key: 'none', label: 'No external assessment' },
        { key: 'red-team', label: 'Red-team exercise completed' },
        { key: 'third-party-audit', label: 'Third-party audit' },
        { key: 'certification', label: 'ISO 42001 / equivalent certification' },
        { key: 'multiple', label: 'Multiple of the above' },
      ],
      required: false,
      order: 305,
      showConditions: [
        { questionId: 'REG_002', operator: ConditionOperator.CONTAINS, value: 'nist-ai-rmf' },
      ],
      tags: ['nist-ai-rmf', 'assessment', 'third-party'],
    },
  ],

  complianceFrameworks: [
    {
      key: 'nist-ai-rmf',
      label: 'NIST AI Risk Management Framework 1.0',
      description:
        'Voluntary US-federal framework for managing AI-system risks across four functions: '
        + 'Govern (org accountability + policy), Map (context + risk identification), Measure '
        + '(trustworthiness assessment), Manage (risk-tier-appropriate response). NIST AI 100-1.',
    },
    {
      key: 'nist-ai-600-1',
      label: 'NIST AI 600-1 Generative AI Profile',
      description:
        'Companion profile to AI RMF that catalogs generative-AI-specific risks (confabulation, '
        + 'dangerous content, value-chain integrity, IP / data-leakage, environmental impact) and '
        + 'recommends mitigations. Applies to coding agents whose outputs are generative.',
    },
  ],

  priorityCategories: {
    'AI Governance': ['nist-ai-rmf', 'govern', 'risk-tolerance', 'ai-policy', 'escalation'],
    'AI Trustworthiness': ['measure', 'monitoring', 'drift-monitoring', 'bias-testing', 'human-review'],
    'AI Risk Documentation': ['risk-tier', 'assessment', 'third-party', 'incident-reporting'],
    'Generative AI Safety': ['generative-ai', 'ai-600-1', 'confabulation'],
  },

  dlpPatterns: [
    // AI RMF is not primarily a data-classification framework — the
    // pack ships zero DLP patterns. Operators compose with an industry
    // pack (healthcare/finance/education) when they need data-class
    // DLP. Documented in the pack's description.
  ],

  ruleTemplates: [
    {
      filename: 'nist-ai-rmf-govern.md',
      pathScope: [],
      requiresFramework: 'nist-ai-rmf',
      content: `# NIST AI RMF — Govern Function

## Purpose
Workforce-tooling AI systems must operate within a documented governance
program: who is accountable, what risks are acceptable, what
escalation path applies when a risk is observed. The harness cannot
SUBSTITUTE for organizational governance — it serves as a reminder
and a recording mechanism.

## What the agent should do

### Honor the documented risk tolerance
- When asked to perform an action that intersects the operator's
  documented AI policy, surface the policy clause explicitly and
  ask for confirmation before proceeding.
- If no documented policy applies, ask the user to escalate rather
  than assuming an acceptable level of risk.

### Record the chain of accountability
- Every audit-log entry the agent produces must carry the userId of
  the authorized actor.
- Generated artifacts that change AI behavior (prompts, hooks,
  rules, agent definitions) should reference the named authority who
  approved the change.

### Maintain the policy boundary
- Do not generate code that bypasses access controls, logging hooks,
  or DLP scanners on the grounds of "efficiency" or "convenience" —
  those controls exist for governance reasons the agent does not
  see.
- When the user requests a change that appears to weaken governance,
  surface the implication explicitly and let the user decide.

## What this rule does NOT cover
- Organizational policy creation. Operators bring the policy; the
  agent honors it.
- Roles and responsibilities assignment. Operators name the
  accountable authority; the agent records it.
- Incident response procedures. The harness provides hooks; the
  procedure itself is operator-owned.
`,
    },
    {
      filename: 'nist-ai-rmf-map.md',
      pathScope: [],
      requiresFramework: 'nist-ai-rmf',
      content: `# NIST AI RMF — Map Function

## Purpose
Before responding to a generative request, the agent must understand
the request's context: what system is this, what is the intended
use, what risk tier applies, what data is in scope. The harness
records the answers to those questions in the wizard profile; this
rule asks the agent to honor them.

## What the agent should do

### Scope to the intended use
- Reject requests that fall outside the system's documented intended
  use (per the harness's CLAUDE.md / system-card / equivalent
  documentation).
- When intent is ambiguous, ask the user to clarify rather than
  guessing. Confabulation under ambiguous intent is the AI 600-1
  failure mode this rule prevents.

### Respect the risk tier
- For systems in the elevated- or high-risk tier, default to
  requiring human review before applying changes to:
  - Prompt templates that affect end-user-facing outputs
  - Hooks that modify access-control behavior
  - Validation logic that gates compliance-relevant decisions

### Track context
- Record the user-provided business domain, industry, and
  compliance frameworks in every generated artifact's header so
  downstream reviewers can trace the context the work was done in.
- The provenance trace (v4.0 / 8E) is the structured form of this
  expectation; the rule is a reminder for the agent.
`,
    },
    {
      filename: 'nist-ai-rmf-measure.md',
      pathScope: [],
      requiresFramework: 'nist-ai-rmf',
      content: `# NIST AI RMF — Measure Function

## Purpose
Trustworthiness is not a static property. The harness should support
the operator's ongoing measurement program rather than substituting
for it.

## What the agent should do

### Preserve measurable signals
- Do not suppress or normalize errors that downstream monitoring
  depends on (raw error rates, latency distributions,
  user-correction signals).
- When refactoring agent code, preserve the existing instrumentation
  surface unless the user explicitly asks to change it.

### Surface what was changed
- Every generated artifact carries a generation-header stamp (file
  + EmbedIQ version + profile fingerprint). When the agent modifies
  an existing artifact, update the stamp rather than silently
  overwriting it.
- Audit-log entries (audit.jsonl) are the canonical record of what
  changed when. Do not delete or rewrite past entries — the v4.0 /
  8F audit chain catches that anyway, but the rule sets the
  expectation up front.

### Document confidence
- When generating code that involves uncertain reasoning (heuristic
  decisions, statistical thresholds, model outputs), surface the
  uncertainty explicitly in comments. Do not present a guess as a
  certain answer — that's confabulation under the AI 600-1 profile.
`,
    },
    {
      filename: 'nist-ai-rmf-manage.md',
      pathScope: [],
      requiresFramework: 'nist-ai-rmf',
      content: `# NIST AI RMF — Manage Function

## Purpose
When a risk materializes (an unexpected output, a discovered bias, a
data-leakage signal), the response must be proportional, traceable,
and respect the documented escalation path.

## What the agent should do

### Halt before harm
- If the agent detects that a requested change would violate the
  documented risk tolerance (per the operator's AI policy, captured
  in the wizard profile), stop and surface the conflict — do not
  proceed under the assumption that the user's request overrides
  policy.

### Honor the escalation path
- Surface the named escalation authority (captured via AI_005 in
  the wizard) when:
  - The user asks for a change that affects access controls
  - The user requests removal of an audit, DLP, or logging hook
  - The user asks the agent to circumvent a compliance check

### Cooperate with rollback
- Generated configuration is byte-identical when re-run with the
  same profile. When the operator needs to roll back, re-running
  the wizard produces the same artifacts — do not introduce
  irreversible side effects in agent-generated code (filesystem
  writes outside the project root, network calls with persistent
  state, etc.) without an explicit user confirmation.

### Document the response
- Any agent action taken in response to a risk signal (refused
  request, surfaced conflict, escalated to user) should produce an
  audit-log entry with the relevant context.
`,
    },
  ],

  ignorePatterns: [
    // AI RMF is not primarily a data-classification framework — the
    // pack ships zero ignore patterns. Industry packs cover the
    // data-class-specific ignore lines.
  ],

  validationChecks: [
    {
      name: 'AI RMF Govern rule template generated',
      severity: 'error',
      requiresFramework: 'nist-ai-rmf',
      failureMessage:
        'A NIST AI RMF Govern rule file (nist-ai-rmf-govern.md) must be generated when the '
        + 'nist-ai-rmf framework is active.',
      check: (files, _profile) => files.some((f) => f.relativePath.includes('nist-ai-rmf-govern')),
    },
    {
      name: 'AI RMF Map rule template generated',
      severity: 'error',
      requiresFramework: 'nist-ai-rmf',
      failureMessage:
        'A NIST AI RMF Map rule file (nist-ai-rmf-map.md) must be generated when the '
        + 'nist-ai-rmf framework is active.',
      check: (files, _profile) => files.some((f) => f.relativePath.includes('nist-ai-rmf-map')),
    },
    {
      name: 'AI RMF Measure rule template generated',
      severity: 'error',
      requiresFramework: 'nist-ai-rmf',
      failureMessage:
        'A NIST AI RMF Measure rule file (nist-ai-rmf-measure.md) must be generated when the '
        + 'nist-ai-rmf framework is active.',
      check: (files, _profile) => files.some((f) => f.relativePath.includes('nist-ai-rmf-measure')),
    },
    {
      name: 'AI RMF Manage rule template generated',
      severity: 'error',
      requiresFramework: 'nist-ai-rmf',
      failureMessage:
        'A NIST AI RMF Manage rule file (nist-ai-rmf-manage.md) must be generated when the '
        + 'nist-ai-rmf framework is active.',
      check: (files, _profile) => files.some((f) => f.relativePath.includes('nist-ai-rmf-manage')),
    },
  ],
};
