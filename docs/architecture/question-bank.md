<!-- audience: public -->

# Architecture — question bank (Layer 1)

The question bank is the static knowledge EmbedIQ ships. 71 questions
across 7 dimensions, 40 of them gated by conditional branching.

**Source**: [`src/bank/`](../../src/bank/) —
`question-registry.ts` (static data), `question-bank.ts` (query
interface), `profile-templates.ts` (baseline template loader).

## Dimensions

Seven canonical dimensions, evaluated in this order:

1. **Strategic Intent** — role, industry, business domain.
2. **Problem Definition** — what the team is trying to solve.
3. **Operational Reality** — team size, tooling, CI/CD posture.
4. **Technology Requirements** — languages, frameworks, build tools.
5. **Regulatory Compliance** — frameworks, DLP, audit.
6. **Financial Constraints** — budget tier.
7. **Innovation & Future-Proofing** — research-adjacent tooling.

Dimensions are ordered for user flow, not dependency. The wizard
walks them in order, but branching can enable questions in later
dimensions based on earlier answers.

## `Question` shape

```ts
// src/types/index.ts
interface Question {
  id: string;                    // dimension-prefixed, e.g. STRAT_002
  dimension: Dimension;
  text: string;
  helpText?: string;
  type: QuestionType;            // single_choice | multi_choice | free_text | yes_no | scale
  options?: AnswerOption[];
  required: boolean;
  order: number;                 // intra-dimension ordering
  showConditions: Condition[];   // AND-joined
  tags: string[];                // drive priority analysis
}
```

## Conditional branching

```ts
interface Condition {
  questionId: string;
  operator: ConditionOperator;   // equals | not_equals | contains | any_of | none_of | answered | not_answered | gt | lt
  value?: string | string[] | number | boolean;
}
```

Every condition in `showConditions` must evaluate true for the
question to appear — the operator is AND. `BranchEvaluator`
(Layer 2) is stateless and takes a condition + the current answers
map.

## Domain-pack extension

A loaded domain pack's `questions[]` are merged into the bank at
`QuestionBank` construction time. The bank also **extends the REG_002
compliance-framework option list** with the pack's
`complianceFrameworks[]` so the user sees those options without
having to answer a domain-specific question first.

After merging, the bank re-sorts by dimension order + intra-dimension
order so external questions interleave correctly.

## Skill extension

Composable skills (via `SkillComposer`) produce a payload that
includes additional questions. The `DomainPackRegistry.composeFromSkills()`
API materializes that into a DomainPack-shaped object, which then
merges into a `QuestionBank` the same way a full pack does.

## Query interface

```ts
class QuestionBank {
  constructor(activePack?: DomainPack);
  getAll(): Question[];
  getById(id: string): Question | undefined;
  getByDimension(d: Dimension): Question[];
  getVisibleQuestions(d: Dimension, answers: Map<string, Answer>): Question[];
  getDimensions(): Dimension[];
  getTotalByDimension(d: Dimension): number;
}
```

`getVisibleQuestions` delegates visibility to `BranchEvaluator`.
Callers iterate through dimensions and call `getVisibleQuestions`
each time — the adaptive engine re-evaluates after every answer
since a new answer may unlock later questions in the same dimension.

## Profile templates

Templates under `templates/*.yaml` pre-fill answers and can lock
questions from later edits. They're loaded separately from the
question bank but feed the same `Map<string, Answer>` shape. See
[extension-guide/writing-templates.md](../extension-guide/writing-templates.md).

## Performance

The bank is small (71 + extension entries) and fully in-memory. All
queries are O(N) linear scans. No indexing is needed at this scale;
if it ever does, it'll live in `QuestionBank` without changing the
interface.

## Why static data + conditions rather than an LLM?

- **Auditable.** Every branching decision is a readable TypeScript
  `showConditions` array.
- **Reproducible.** Same answers → same visible questions.
- **Fast.** No API round-trip per question.
- **Offline.** See [evaluators/security-model.md](../evaluators/security-model.md).

## See also

- [Adaptive engine](adaptive-engine.md) — the consumer of
  `getVisibleQuestions`
- [Domain packs & skills](domain-packs-and-skills.md) — where
  additional questions come from
- [`src/bank/question-registry.ts`](../../src/bank/question-registry.ts) —
  every question, every branch, source of truth
