export enum Dimension {
  STRATEGIC_INTENT = 'Strategic Intent',
  PROBLEM_DEFINITION = 'Problem Definition',
  OPERATIONAL_REALITY = 'Operational Reality',
  TECHNOLOGY_REQUIREMENTS = 'Technology Requirements',
  REGULATORY_COMPLIANCE = 'Regulatory Compliance',
  FINANCIAL_CONSTRAINTS = 'Financial Constraints',
  INNOVATION_FUTURE = 'Innovation & Future-Proofing',
}

export const DIMENSION_ORDER: Dimension[] = [
  Dimension.STRATEGIC_INTENT,
  Dimension.PROBLEM_DEFINITION,
  Dimension.OPERATIONAL_REALITY,
  Dimension.TECHNOLOGY_REQUIREMENTS,
  Dimension.REGULATORY_COMPLIANCE,
  Dimension.FINANCIAL_CONSTRAINTS,
  Dimension.INNOVATION_FUTURE,
];

export enum QuestionType {
  FREE_TEXT = 'free_text',
  SINGLE_CHOICE = 'single_choice',
  MULTI_CHOICE = 'multi_choice',
  SCALE = 'scale',
  YES_NO = 'yes_no',
}

export enum ConditionOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  ANY_OF = 'any_of',
  NONE_OF = 'none_of',
  ANSWERED = 'answered',
  NOT_ANSWERED = 'not_answered',
  GT = 'gt',
  LT = 'lt',
}

export interface AnswerOption {
  key: string;
  label: string;
  description?: string;
  /**
   * Optional list of upstream answer values that make this option relevant.
   * When set, the option is shown only if at least one referenced value is
   * present in the upstream answer. Format: `<questionId>:<value>`, e.g.,
   * `TECH_001:python` for "show this option if TECH_001 contains 'python'".
   * Empty/missing field means always show.
   */
  relevantFor?: string[];
}

export interface Condition {
  questionId: string;
  operator: ConditionOperator;
  value?: string | string[] | number | boolean;
}

export interface Question {
  id: string;
  dimension: Dimension;
  text: string;
  /**
   * Team-framed variant of `text`, shown when the operator is a Coding Agent
   * Admin (STRAT_000b === 'admin') configuring the harness for a team rather
   * than for themselves. Falls back to `text` when absent.
   */
  adminText?: string;
  /** Context shown to every user — plain-language explanation of the question. */
  helpText?: string;
  /** Team-framed variant of `helpText` for Coding Agent Admins. Falls back to `helpText`. */
  adminHelpText?: string;
  /**
   * Short description of what the app will infer if this (optional) question
   * is skipped, e.g. "a test framework per language". When present, the skip
   * control reads "Skip — we'll infer: <inferredNote>". Only meaningful on
   * `required: false` questions whose value the profile-builder can infer.
   */
  inferredNote?: string;
  /**
   * Admin-only explanation of *why* this question is asked — what the answer
   * drives in the generated harness. Only rendered when the user has
   * identified as a Coding Agent Admin (STRAT_000b === 'admin').
   */
  purposeText?: string;
  /**
   * Who is best positioned to answer this question — drives the three-role
   * delegation model (Admin / Team Lead / Individual):
   *   - `admin`      — central policy / governance / infra standards
   *   - `lead`       — team lived-experience (pain points, real stack, ops reality, data flows)
   *   - `individual` — per-seat preference (IDE, local-model hardware, concurrent sessions)
   *   - `any`        — shown to every role (the default when omitted)
   * Orthogonal to `showConditions` (which gates *visibility*); this gates
   * *ownership* for role-scoped delegation. Absent ⇒ treated as `any`.
   */
  respondent?: Respondent;
  type: QuestionType;
  options?: AnswerOption[];
  required: boolean;
  order: number;
  showConditions: Condition[];
  tags: string[];
}

export interface Answer {
  questionId: string;
  value: string | string[] | number | boolean;
  timestamp: Date;
}

export interface DevOpsProfile {
  ide: string[];
  buildTools: string[];
  testFrameworks: string[];
  cicd: string;
  monitoring: string[];
  containerization: string[];
  /** Primary cloud / deployment target (TECH_022): azure | aws | gcp | on_premises | hybrid | other | '' / undefined when unanswered. */
  cloudTarget?: string;
  /** Free-text cloud target when cloudTarget === 'other' (TECH_022_other). Empty otherwise. */
  cloudTargetOther?: string;
  /**
   * Coding-agent isolation posture (TECH_023): managed_endpoint | dev_container |
   * vdi | ephemeral_cloud | ci_only | none | other | '' / undefined when unanswered.
   * Drives the OS-sandbox enforcement layer (managed-settings.json, .devcontainer).
   */
  isolationModel?: string;
  /** Free-text isolation posture when isolationModel === 'other' (TECH_023_other). Empty otherwise. */
  isolationModelOther?: string;
}

export interface Priority {
  name: string;
  confidence: number;
  derivedFrom: string[];
}

/** Three-role delegation respondent (plus `any` for shared questions). */
export type Respondent = 'admin' | 'lead' | 'individual' | 'any';

export type TeamSize = 'solo' | 'small' | 'medium' | 'large';
export type BudgetTier = 'minimal' | 'moderate' | 'enterprise';
export type UserRole = 'developer' | 'devops' | 'lead' | 'eng_manager' | 'ba' | 'pm' | 'executive' | 'qa' | 'data';
export type TechnicalProficiency = 'beginner' | 'intermediate' | 'advanced' | 'non_technical';

export interface UserProfile {
  answers: Map<string, Answer>;
  role: UserRole;
  technicalProficiency: TechnicalProficiency;
  businessDomain: string;
  industry: string;
  problemAreas: string[];
  techStack: string[];
  languages: string[];
  teamSize: TeamSize;
  devOps: DevOpsProfile;
  complianceFrameworks: string[];
  budgetTier: BudgetTier;
  securityConcerns: string[];
  hardwareProfile: Record<string, string>;
  priorities: Priority[];
  // v3.3 — local AI integration. All optional; defaulted when unset.
  /** True when the user opted into local AI (TECH_013 yes). */
  localAiEnabled?: boolean;
  /** Ollama model identifiers the user plans to run (TECH_016). */
  ollamaModels?: string[];
  /** IDE-resident assistants to wire up: continue-dev / aider / zed-ai (TECH_017). */
  ideIntegrations?: string[];
  /** Default Ollama model for autocomplete / chat (TECH_018). */
  defaultLocalModel?: string;
  /** True when the user opted into the local-router service (TECH_019 yes). */
  routerEnabled?: boolean;
  /** External LLM APIs available for escalation: anthropic / openai (TECH_020). */
  externalApis?: string[];
  /**
   * External providers the org has a signed BAA/DPA covering its selected
   * compliance frameworks (customer-attested — never inferred). Drives the
   * routing catalog's `covered[]`: a provider not listed here is uncovered,
   * so regulated data classes cannot be routed to it. Empty/undefined means
   * "no covered external destinations" → the generated config is air-gapped.
   */
  coveredProviders?: string[];
  /** True when the router should self-evaluate and escalate below a threshold (TECH_021). */
  confidenceEscalation?: boolean;
  /**
   * Fields whose value was inferred from other answers because the user
   * skipped the (optional) source question — keyed by a human label, value
   * is the inferred option key(s). Surfaced in the profile report as
   * "inferred". Empty when the user answered everything explicitly.
   */
  inferredDefaults?: Record<string, string[]>;
}

/**
 * The pure, generator-facing inputs the orchestrator derives ONCE, before the
 * parallel fan-out. Every field is a function of the answer set — nothing here
 * is client-suppliable, and there is no I/O concern (no `targetDir`). Generators
 * read the fields they need and ignore the rest; an unread field is not a dead
 * parameter, it is an unused field of an object they already receive.
 *
 * Additive by construction: a new derivation phase (e.g. the routing policy)
 * adds a field here, and only the generators that consume it change.
 */
export interface GenerationContext {
  readonly profile: UserProfile;
  readonly domainPack?: import('../domain-packs/index.js').DomainPack;
  /**
   * Output targets to generate for (e.g. Claude Code, Cursor, Copilot).
   * Omitted means "Claude only" — preserves the v2.x default.
   */
  readonly targets?: import('../synthesizer/target-format.js').TargetFormat[];
  /**
   * The routing Policy Decision Point — derived once from the profile via
   * `buildRoutingPolicy()`. Policy-aware generators (router, LLM-gateway,
   * ignore) read this same object so their configs cannot drift apart.
   */
  readonly policy?: import('../synthesizer/policy/types.js').RoutingPolicy;
}

/**
 * The I/O-boundary wrapper the CLI / web layer builds: a {@link GenerationContext}
 * plus the one thing generators must never see — where output is written.
 */
export interface SetupConfig extends GenerationContext {
  targetDir: string;
}

export interface GeneratedFile {
  relativePath: string;
  content: string;
  description: string;
}

export interface DimensionProgress {
  dimension: Dimension;
  total: number;
  answered: number;
  skipped: number;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidationResult {
  passed: boolean;
  checks: ValidationCheck[];
  summary: string;
}

export interface GenerationResult {
  files: GeneratedFile[];
  validation: ValidationResult;
}

export function createEmptyProfile(): UserProfile {
  return {
    answers: new Map(),
    role: 'developer',
    technicalProficiency: 'intermediate',
    businessDomain: '',
    industry: '',
    problemAreas: [],
    techStack: [],
    languages: [],
    teamSize: 'solo',
    devOps: {
      ide: [],
      buildTools: [],
      testFrameworks: [],
      cicd: '',
      monitoring: [],
      containerization: [],
      cloudTarget: '',
      isolationModel: '',
    },
    complianceFrameworks: [],
    budgetTier: 'moderate',
    securityConcerns: [],
    hardwareProfile: {},
    priorities: [],
  };
}
