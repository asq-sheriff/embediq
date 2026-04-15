import type { Question, GeneratedFile, UserProfile } from '../types/index.js';

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
