import chalk from 'chalk';
import type { UserProfile, Priority } from '../types/index.js';
import { ConsoleUI } from './console.js';

export class PlaybackRenderer {
  private ui: ConsoleUI;

  constructor(ui: ConsoleUI) {
    this.ui = ui;
  }

  render(profile: UserProfile): void {
    this.ui.heading('Understanding Summary');

    console.log(chalk.dim('  Based on your answers, here is what we understand:\n'));

    this.ui.keyValue('ROLE', this.formatRole(profile.role));
    this.ui.keyValue('PROFICIENCY', this.formatProficiency(profile.technicalProficiency));
    this.ui.keyValue('DOMAIN', profile.businessDomain || '(not specified)');
    this.ui.keyValue('INDUSTRY', this.formatIndustry(profile.industry));
    this.ui.keyValue('TEAM', this.formatTeamSize(profile.teamSize));
    this.ui.keyValue('LANGUAGES', profile.languages.join(', ') || '(not specified)');
    this.ui.keyValue('TECH STACK', profile.techStack.join(', ') || '(not specified)');

    this.ui.blank();
    this.ui.keyValue('IDE', profile.devOps.ide.join(', ') || '(not specified)');
    this.ui.keyValue('BUILD TOOLS', profile.devOps.buildTools.join(', ') || '(not specified)');
    this.ui.keyValue('TEST FRAMEWORKS', profile.devOps.testFrameworks.join(', ') || '(not specified)');
    this.ui.keyValue('CI/CD', profile.devOps.cicd || '(none)');
    this.ui.keyValue('MONITORING', profile.devOps.monitoring.join(', ') || '(none)');
    this.ui.keyValue('CONTAINERS', profile.devOps.containerization.join(', ') || '(none)');

    if (profile.complianceFrameworks.length > 0) {
      this.ui.blank();
      this.ui.keyValue('COMPLIANCE', profile.complianceFrameworks.map(f => f.toUpperCase()).join(', '));
    }

    if (profile.securityConcerns.length > 0) {
      this.ui.blank();
      this.ui.keyValue('SECURITY CONCERNS', '');
      this.ui.list(profile.securityConcerns.map(c => this.formatSecurityConcern(c)));
    }

    this.ui.keyValue('BUDGET TIER', this.formatBudget(profile.budgetTier));

    if (profile.priorities.length > 0) {
      this.ui.blank();
      console.log(chalk.bold.white('  INTERPRETED PRIORITIES:'));
      console.log('');
      for (let i = 0; i < profile.priorities.length; i++) {
        const p = profile.priorities[i];
        const pct = Math.round(p.confidence * 100);
        const bar = this.confidenceBar(p.confidence);
        console.log(`    ${chalk.yellow(`${i + 1}.`)} ${chalk.bold(p.name)} ${bar} ${chalk.dim(`${pct}%`)}`);
      }
    }

    this.ui.blank();
  }

  private formatIndustry(industry: string): string {
    const map: Record<string, string> = {
      healthcare: 'Healthcare / Life Sciences',
      finance: 'Financial Services / Fintech',
      ecommerce: 'E-Commerce / Retail',
      saas: 'SaaS / Enterprise Software',
      education: 'Education / EdTech',
      government: 'Government / Public Sector',
      manufacturing: 'Manufacturing / IoT',
      media: 'Media / Entertainment / Gaming',
    };
    return map[industry] || industry || '(not specified)';
  }

  private formatTeamSize(size: string): string {
    const map: Record<string, string> = {
      solo: 'Solo developer',
      small: 'Small team (2-5 developers)',
      medium: 'Medium team (6-15 developers)',
      large: 'Large team (15+ developers)',
    };
    return map[size] || size;
  }

  private formatBudget(tier: string): string {
    const map: Record<string, string> = {
      minimal: 'Very cost-sensitive (< $5/day)',
      moderate: 'Moderate ($5-20/day)',
      enterprise: 'Enterprise (cost not primary concern)',
    };
    return map[tier] || tier;
  }

  private formatSecurityConcern(concern: string): string {
    const map: Record<string, string> = {
      sensitive_data: 'Handles sensitive/regulated data',
      phi: 'Protected Health Information (PHI)',
      pii: 'Personally Identifiable Information (PII)',
      audit_logging: 'Audit logging required',
      secret_scanning: 'Secret/credential scanning',
      protected_files: 'Safety-critical file protection',
      strict_permissions: 'Strict permission controls',
      data_classification: 'Data classification labeling',
      dlp: 'Data Loss Prevention (DLP) controls',
      context_sanitization: 'Context sanitization before API',
      session_audit_trail: 'Full session audit trail',
      output_review: 'Output review controls',
    };
    return map[concern] || concern;
  }

  private formatRole(role: string): string {
    const map: Record<string, string> = {
      developer: 'Software Developer / Engineer',
      devops: 'DevOps / Platform / SRE',
      lead: 'Tech Lead / Architect',
      ba: 'Business Analyst',
      pm: 'Product Manager',
      executive: 'Executive / Director',
      qa: 'QA / Test Engineer',
      data: 'Data Analyst / Data Scientist',
    };
    return map[role] || role;
  }

  private formatProficiency(level: string): string {
    const map: Record<string, string> = {
      beginner: 'Beginner',
      intermediate: 'Intermediate',
      advanced: 'Advanced',
      non_technical: 'Non-technical',
    };
    return map[level] || level;
  }

  private confidenceBar(confidence: number): string {
    const filled = Math.round(confidence * 10);
    return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(10 - filled));
  }
}
