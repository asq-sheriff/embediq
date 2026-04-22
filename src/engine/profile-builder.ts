import type { Answer, UserProfile, TeamSize, BudgetTier, DevOpsProfile, UserRole, TechnicalProficiency } from '../types/index.js';
import { createEmptyProfile } from '../types/index.js';
import { getEventBus, type EventBus } from '../events/bus.js';

export class ProfileBuilder {
  private bus: EventBus;

  constructor(bus: EventBus = getEventBus()) {
    this.bus = bus;
  }

  build(answers: Map<string, Answer>): UserProfile {
    const profile = createEmptyProfile();
    profile.answers = answers;

    profile.role = (this.getString(answers, 'STRAT_000') || 'developer') as UserRole;
    profile.technicalProficiency = (this.getString(answers, 'STRAT_000a') || 'intermediate') as TechnicalProficiency;
    profile.businessDomain = this.getString(answers, 'STRAT_001');
    profile.industry = this.resolveIndustry(answers);
    profile.teamSize = this.resolveTeamSize(answers);
    profile.problemAreas = this.getStringArray(answers, 'PROB_001');
    profile.languages = this.getStringArray(answers, 'TECH_001');
    profile.techStack = this.buildTechStack(answers);
    profile.devOps = this.buildDevOpsProfile(answers);
    profile.complianceFrameworks = this.resolveCompliance(answers);
    profile.budgetTier = this.resolveBudget(answers);
    profile.securityConcerns = this.resolveSecurityConcerns(answers);
    profile.hardwareProfile = this.resolveHardware(answers);

    this.bus.emit('profile:built', {
      profileSummary: {
        role: profile.role,
        industry: profile.industry,
        teamSize: profile.teamSize,
        complianceFrameworks: profile.complianceFrameworks,
        securityLevel: profile.securityConcerns.includes('strict_permissions') ? 'strict' : 'standard',
        fileCount: 0,
      },
    });

    return profile;
  }

  private resolveIndustry(answers: Map<string, Answer>): string {
    const industry = this.getString(answers, 'STRAT_002');
    if (industry === 'other') {
      return this.getString(answers, 'STRAT_003') || 'Other';
    }
    return industry;
  }

  private resolveTeamSize(answers: Map<string, Answer>): TeamSize {
    const size = this.getString(answers, 'OPS_001');
    if (['solo', 'small', 'medium', 'large'].includes(size)) return size as TeamSize;
    return 'solo';
  }

  private buildTechStack(answers: Map<string, Answer>): string[] {
    const stack: string[] = [];
    stack.push(...this.getStringArray(answers, 'TECH_001'));
    const additional = this.getString(answers, 'TECH_002');
    if (additional) stack.push(additional);
    const frameworks = this.getString(answers, 'TECH_003');
    if (frameworks) stack.push(frameworks);
    return stack;
  }

  private buildDevOpsProfile(answers: Map<string, Answer>): DevOpsProfile {
    return {
      ide: this.getStringArray(answers, 'TECH_004'),
      buildTools: this.getStringArray(answers, 'TECH_005'),
      testFrameworks: this.getStringArray(answers, 'TECH_006'),
      cicd: this.getString(answers, 'TECH_007'),
      monitoring: this.getStringArray(answers, 'TECH_009'),
      containerization: this.getStringArray(answers, 'TECH_008'),
    };
  }

  private resolveCompliance(answers: Map<string, Answer>): string[] {
    const hasSensitiveData = this.getBool(answers, 'REG_001');
    if (!hasSensitiveData) return [];
    const frameworks = this.getStringArray(answers, 'REG_002');
    return frameworks.filter(f => f !== 'none');
  }

  private resolveBudget(answers: Map<string, Answer>): BudgetTier {
    const budget = this.getString(answers, 'FIN_001');
    if (['minimal', 'moderate', 'enterprise'].includes(budget)) return budget as BudgetTier;
    return 'moderate';
  }

  private resolveSecurityConcerns(answers: Map<string, Answer>): string[] {
    const concerns: string[] = [];
    if (this.getBool(answers, 'REG_001')) concerns.push('sensitive_data');
    if (this.getBool(answers, 'REG_003')) concerns.push('phi');
    if (this.getBool(answers, 'REG_004')) concerns.push('pii');
    if (this.getBool(answers, 'REG_005')) concerns.push('audit_logging');
    if (this.getBool(answers, 'REG_007')) concerns.push('secret_scanning');
    if (this.getBool(answers, 'REG_009')) concerns.push('protected_files');

    const permLevel = this.getString(answers, 'REG_008');
    if (permLevel === 'strict' || permLevel === 'lockdown') {
      concerns.push('strict_permissions');
    }

    // CISO-level concerns
    if (this.getBool(answers, 'REG_011')) concerns.push('data_classification');
    if (this.getBool(answers, 'REG_012')) concerns.push('dlp');
    if (this.getBool(answers, 'REG_013')) concerns.push('context_sanitization');
    if (this.getBool(answers, 'REG_014')) concerns.push('session_audit_trail');
    if (this.getBool(answers, 'REG_015')) concerns.push('output_review');

    return concerns;
  }

  private resolveHardware(answers: Map<string, Answer>): Record<string, string> {
    const wantsLocal = this.getBool(answers, 'TECH_013');
    if (!wantsLocal) return {};
    return { ram: this.getString(answers, 'TECH_014') };
  }

  private getString(answers: Map<string, Answer>, id: string): string {
    const a = answers.get(id);
    return a ? String(a.value) : '';
  }

  private getStringArray(answers: Map<string, Answer>, id: string): string[] {
    const a = answers.get(id);
    if (!a) return [];
    return Array.isArray(a.value) ? a.value : [String(a.value)];
  }

  private getBool(answers: Map<string, Answer>, id: string): boolean {
    const a = answers.get(id);
    return a?.value === true;
  }
}
