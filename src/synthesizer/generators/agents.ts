import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { SetupConfig, GeneratedFile } from '../../types/index.js';
import { MarkdownBuilder } from '../../util/markdown-builder.js';

export class AgentsGenerator implements ConfigGenerator {
  name = 'agents';
  target = TargetFormat.CLAUDE;

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    const files: GeneratedFile[] = [];
    const wantsAgents = profile.answers.get('INNOV_007')?.value === true;

    if (!wantsAgents) return files;

    // Security reviewer agent
    if (profile.securityConcerns.length > 0) {
      const md = new MarkdownBuilder();
      md.frontmatter({
        name: 'security-reviewer',
        description: 'Reviews code for security vulnerabilities and sensitive data exposure',
        model: 'opus',
        effort: 'high',
        'allowed-tools': ['Read', 'Grep', 'Glob', 'Bash'],
      });
      md.h1('Security Reviewer');
      md.paragraph('You are a security-focused code reviewer. Your job is to identify security vulnerabilities, sensitive data exposure, and compliance violations.');
      md.h2('Checks');
      md.bullet('OWASP Top 10 vulnerabilities');
      md.bullet('Hardcoded secrets, API keys, passwords');
      md.bullet('SQL injection, command injection, XSS');
      md.bullet('Insecure cryptographic practices');
      if (profile.securityConcerns.includes('phi')) {
        md.bullet('PHI exposure in code, comments, test data, or logs');
      }
      if (profile.securityConcerns.includes('pii')) {
        md.bullet('PII exposure in code, comments, test data, or logs');
      }
      md.h2('Output');
      md.paragraph('Report findings with severity (CRITICAL, HIGH, MEDIUM, LOW) and specific remediation steps.');

      files.push({
        relativePath: '.claude/agents/security-reviewer.md',
        content: md.build(),
        description: 'Security reviewer agent (read-only, opus)',
      });
    }

    // Compliance checker agent
    if (profile.complianceFrameworks.length > 0) {
      const frameworks = profile.complianceFrameworks.join(', ').toUpperCase();
      const md = new MarkdownBuilder();
      md.frontmatter({
        name: 'compliance-checker',
        description: `Validates ${frameworks} compliance`,
        model: 'opus',
        effort: 'high',
        'allowed-tools': ['Read', 'Grep', 'Glob'],
      });
      md.h1('Compliance Checker');
      md.paragraph(`You validate code against ${frameworks} requirements.`);
      md.h2('Checks');
      for (const fw of profile.complianceFrameworks) {
        switch (fw) {
          case 'hipaa':
            md.bullet('PHI handling: encryption, access logging, minimum necessary');
            md.bullet('Audit trail completeness');
            md.bullet('Data at rest and in transit encryption');
            break;
          case 'soc2':
            md.bullet('Access control implementation');
            md.bullet('Change management processes');
            md.bullet('Monitoring and alerting');
            break;
          case 'pci':
            md.bullet('Cardholder data protection');
            md.bullet('No CVV storage');
            md.bullet('Tokenization for card numbers');
            break;
          case 'gdpr':
            md.bullet('Data subject rights implementation');
            md.bullet('Consent management');
            md.bullet('Data minimization');
            break;
        }
      }

      files.push({
        relativePath: '.claude/agents/compliance-checker.md',
        content: md.build(),
        description: `Compliance checker agent (${frameworks})`,
      });
    }

    // Code reviewer agent (for teams)
    if (profile.teamSize !== 'solo') {
      const md = new MarkdownBuilder();
      md.frontmatter({
        name: 'code-reviewer',
        description: 'Automated code review with project-specific standards',
        model: 'sonnet',
        effort: 'high',
        'allowed-tools': ['Read', 'Grep', 'Glob'],
      });
      md.h1('Code Reviewer');
      md.paragraph('Review code changes against project conventions and quality standards.');
      md.h2('Focus Areas');
      md.bullet('Code consistency with project patterns');
      md.bullet('Test coverage for new code');
      md.bullet('Documentation completeness');
      md.bullet('Error handling');
      md.bullet('Performance implications');

      files.push({
        relativePath: '.claude/agents/code-reviewer.md',
        content: md.build(),
        description: 'Code reviewer agent (sonnet)',
      });
    }

    // Test writer agent
    if (profile.problemAreas.includes('test_gaps')) {
      const md = new MarkdownBuilder();
      md.frontmatter({
        name: 'test-writer',
        description: 'Generates tests for uncovered code',
        model: 'sonnet',
        effort: 'high',
        'allowed-tools': ['Read', 'Grep', 'Glob', 'Write', 'Edit'],
        isolation: 'worktree',
      });
      md.h1('Test Writer');
      md.paragraph('Generate comprehensive tests for source files that lack coverage.');
      md.h2('Guidelines');
      md.bullet('Write tests that verify behavior, not implementation');
      md.bullet('Use descriptive test names');
      md.bullet('Include edge cases and error scenarios');
      md.bullet('Follow existing test patterns in the project');

      files.push({
        relativePath: '.claude/agents/test-writer.md',
        content: md.build(),
        description: 'Test writer agent (sonnet, worktree isolation)',
      });
    }

    return files;
  }
}
