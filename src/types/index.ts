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
  helpText?: string;
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
}

export interface Priority {
  name: string;
  confidence: number;
  derivedFrom: string[];
}

export type TeamSize = 'solo' | 'small' | 'medium' | 'large';
export type BudgetTier = 'minimal' | 'moderate' | 'enterprise';
export type UserRole = 'developer' | 'devops' | 'lead' | 'ba' | 'pm' | 'executive' | 'qa' | 'data';
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
}

export interface SetupConfig {
  profile: UserProfile;
  targetDir: string;
  domainPack?: import('../domain-packs/index.js').DomainPack;
  /**
   * Output targets to generate for (e.g. Claude Code, Cursor, Copilot).
   * Omitted means "Claude only" — preserves the v2.x default.
   */
  targets?: import('../synthesizer/target-format.js').TargetFormat[];
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
    },
    complianceFrameworks: [],
    budgetTier: 'moderate',
    securityConcerns: [],
    hardwareProfile: {},
    priorities: [],
  };
}
