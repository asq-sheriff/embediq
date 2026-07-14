import type { Question, GeneratedFile, UserProfile } from '../types/index.js';
import type { EligibilityContribution } from '../synthesizer/policy/types.js';

export interface DomainPack {
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
  /**
   * Regulated-class eligibility rules this pack contributes to the routing
   * policy (the PDP). Composed by `buildRoutingPolicy` when the pack's framework
   * is selected or the profile's industry implies it — so adding a vertical's
   * egress policy is pack data, not an edit to the eligibility core.
   */
  eligibilityContributions?: readonly EligibilityContribution[];
}

export interface ComplianceFrameworkDef {
  key: string;
  label: string;
  description: string;
}

export interface DlpPatternDef {
  name: string;
  pattern: string;
  severity: 'HIGH' | 'CRITICAL';
  description: string;
  requiresFramework?: string;
}

export interface RuleTemplateDef {
  filename: string;
  pathScope: string[];
  content: string;
  requiresFramework?: string;
}

export interface DomainValidationCheck {
  name: string;
  severity: 'error' | 'warning';
  check: (files: GeneratedFile[], profile: UserProfile) => boolean;
  failureMessage: string;
  requiresFramework?: string;
}
