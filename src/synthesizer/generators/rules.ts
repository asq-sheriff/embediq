import type { ConfigGenerator } from '../generator.js';
import type { SetupConfig, GeneratedFile } from '../../types/index.js';
import { MarkdownBuilder } from '../../util/markdown-builder.js';

export class RulesGenerator implements ConfigGenerator {
  name = 'rules';

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    const files: GeneratedFile[] = [];

    // Testing rules (always-on)
    const testing = new MarkdownBuilder();
    testing.frontmatter({ description: 'Testing standards and requirements' });
    testing.h1('Testing Standards');
    testing.bullet('Every new feature must have corresponding tests');
    testing.bullet('Test files must be co-located or in a mirrored test directory');
    if (profile.answers.get('PROB_007')?.value === true) {
      testing.bullet('TDD: Write tests BEFORE implementation');
    }
    testing.bullet('Use descriptive test names that explain the expected behavior');
    testing.bullet('Never commit code that fails existing tests');
    files.push({
      relativePath: '.claude/rules/testing.md',
      content: testing.build(),
      description: 'Testing standards (always-on)',
    });

    // Security rules (always-on if security concerns exist)
    if (profile.securityConcerns.length > 0) {
      const security = new MarkdownBuilder();
      security.frontmatter({ description: 'Security rules for all code' });
      security.h1('Security Rules');
      security.bullet('Never hardcode secrets, API keys, passwords, or tokens');
      security.bullet('Never log sensitive data (PII, PHI, credentials)');
      security.bullet('Validate all user input at system boundaries');
      security.bullet('Use parameterized queries for all database operations');
      security.bullet('Follow OWASP Top 10 guidelines');
      if (profile.securityConcerns.includes('phi')) {
        security.bullet('CRITICAL: No PHI in code, comments, test data, or logs');
      }
      if (profile.securityConcerns.includes('pii')) {
        security.bullet('CRITICAL: No PII in code, comments, test data, or logs');
      }
      if (profile.securityConcerns.includes('dlp')) {
        security.bullet('DLP hooks are active — all edits are scanned for sensitive patterns');
      }
      files.push({
        relativePath: '.claude/rules/security.md',
        content: security.build(),
        description: 'Security rules (always-on)',
      });
    }

    // HIPAA compliance rules (path-scoped)
    if (profile.complianceFrameworks.includes('hipaa')) {
      const hipaa = new MarkdownBuilder();
      hipaa.frontmatter({
        description: 'HIPAA compliance rules for healthcare data handling',
        paths: ['src/**', 'tests/**'],
      });
      hipaa.h1('HIPAA Compliance');
      hipaa.bullet('All PHI must be encrypted at rest and in transit');
      hipaa.bullet('Access to PHI must be logged and auditable');
      hipaa.bullet('Never include real patient data in test fixtures — use synthetic data only');
      hipaa.bullet('Implement minimum necessary access principle');
      hipaa.bullet('All PHI-handling code must have security review before merge');
      hipaa.bullet('Session audit trail is mandatory for all PHI access');
      files.push({
        relativePath: '.claude/rules/hipaa-compliance.md',
        content: hipaa.build(),
        description: 'HIPAA compliance rules (path-scoped to src/ and tests/)',
      });
    }

    // PCI-DSS rules
    if (profile.complianceFrameworks.includes('pci')) {
      const pci = new MarkdownBuilder();
      pci.frontmatter({
        description: 'PCI-DSS compliance rules for payment data',
        paths: ['src/**'],
      });
      pci.h1('PCI-DSS Compliance');
      pci.bullet('Never store CVV/CVC data');
      pci.bullet('Card numbers must be masked in logs (show last 4 digits only)');
      pci.bullet('All payment processing must use approved tokenization');
      pci.bullet('Encrypt cardholder data in transit and at rest');
      files.push({
        relativePath: '.claude/rules/pci-compliance.md',
        content: pci.build(),
        description: 'PCI-DSS compliance rules',
      });
    }

    // Language-specific rules (path-scoped)
    for (const lang of profile.languages) {
      const rule = this.createLanguageRule(lang);
      if (rule) files.push(rule);
    }

    // Domain pack rule templates
    if (config.domainPack?.ruleTemplates) {
      for (const template of config.domainPack.ruleTemplates) {
        if (
          !template.requiresFramework ||
          profile.complianceFrameworks.includes(template.requiresFramework)
        ) {
          const path = `.claude/rules/${template.filename}`;
          // Deduplicate: skip if a file with same path already exists
          if (!files.some(f => f.relativePath === path)) {
            let content = template.content;
            if (template.pathScope.length > 0) {
              const globs = template.pathScope.map(p => `  - "${p}"`).join('\n');
              content = `---\nglobs:\n${globs}\n---\n\n${content}`;
            }
            files.push({
              relativePath: path,
              content,
              description: `Domain-specific rule: ${template.filename}`,
            });
          }
        }
      }
    }

    return files;
  }

  private createLanguageRule(language: string): GeneratedFile | null {
    const md = new MarkdownBuilder();

    switch (language) {
      case 'typescript': {
        const paths = ['**/*.ts', '**/*.tsx'];
        md.frontmatter({ description: 'TypeScript conventions', paths });
        md.h1('TypeScript Conventions');
        md.bullet('Use strict mode');
        md.bullet('Explicit return types on exported functions');
        md.bullet('Prefer `interface` over `type` for object shapes');
        md.bullet('Use `const` by default, `let` only when reassignment is needed');
        md.bullet('No `any` — use `unknown` and narrow with type guards');
        return { relativePath: '.claude/rules/typescript.md', content: md.build(), description: 'TypeScript rules (path-scoped)' };
      }
      case 'python': {
        const paths = ['**/*.py'];
        md.frontmatter({ description: 'Python conventions', paths });
        md.h1('Python Conventions');
        md.bullet('Follow PEP 8');
        md.bullet('Type hints on all function signatures');
        md.bullet('Use pathlib for file paths, not os.path');
        md.bullet('Use f-strings for string formatting');
        return { relativePath: '.claude/rules/python.md', content: md.build(), description: 'Python rules (path-scoped)' };
      }
      case 'go': {
        const paths = ['**/*.go'];
        md.frontmatter({ description: 'Go conventions', paths });
        md.h1('Go Conventions');
        md.bullet('Handle all errors — never use `_` for error returns');
        md.bullet('Use table-driven tests');
        md.bullet('Keep interfaces small (1-3 methods)');
        return { relativePath: '.claude/rules/go.md', content: md.build(), description: 'Go rules (path-scoped)' };
      }
      case 'java': {
        const paths = ['**/*.java', '**/*.kt'];
        md.frontmatter({ description: 'Java/Kotlin conventions', paths });
        md.h1('Java Conventions');
        md.bullet('Use records for value types');
        md.bullet('Prefer sealed interfaces for type hierarchies');
        md.bullet('Use Optional instead of null returns');
        return { relativePath: '.claude/rules/java.md', content: md.build(), description: 'Java rules (path-scoped)' };
      }
      case 'rust': {
        const paths = ['**/*.rs'];
        md.frontmatter({ description: 'Rust conventions', paths });
        md.h1('Rust Conventions');
        md.bullet('Use clippy with `#![deny(clippy::all)]`');
        md.bullet('Prefer `Result` over `unwrap()`');
        md.bullet('Document public APIs with `///` doc comments');
        return { relativePath: '.claude/rules/rust.md', content: md.build(), description: 'Rust rules (path-scoped)' };
      }
      default:
        return null;
    }
  }
}
