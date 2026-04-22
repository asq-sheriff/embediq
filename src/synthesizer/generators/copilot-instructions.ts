import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { SetupConfig, GeneratedFile, UserProfile } from '../../types/index.js';
import {
  buildCommandBullets,
  buildConventionBullets,
} from './agents-md.js';

/**
 * GitHub Copilot generator — emits `.github/copilot-instructions.md`
 * (the project-wide instructions GitHub reads by default) plus optional
 * glob-scoped `.github/instructions/*.instructions.md` files with an
 * `applyTo` YAML frontmatter. Copilot concatenates project-wide
 * instructions into every request and adds the scoped files whose
 * `applyTo` glob matches the current file.
 */
export class CopilotInstructionsGenerator implements ConfigGenerator {
  name = 'copilot-instructions';
  target = TargetFormat.COPILOT;

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    const files: GeneratedFile[] = [];
    const isNonTechnical = ['ba', 'pm', 'executive'].includes(profile.role);

    files.push({
      relativePath: '.github/copilot-instructions.md',
      content: isNonTechnical
        ? this.renderNonTechnical(profile)
        : this.renderTechnical(profile),
      description: 'Project-wide Copilot instructions',
    });

    if (isNonTechnical) return files;

    // Scoped files — applied only when editing matching paths.
    for (const lang of profile.languages) {
      const file = this.languageInstruction(lang);
      if (file) files.push(file);
    }

    files.push(this.testsInstruction());

    if (profile.complianceFrameworks.length > 0 || profile.securityConcerns.length > 0) {
      files.push(this.securityInstruction(profile));
    }

    return files;
  }

  private renderTechnical(profile: UserProfile): string {
    const lines: string[] = [];
    lines.push(`# ${profile.businessDomain || 'Project'} — Copilot Instructions`);
    lines.push('');
    lines.push(
      'These instructions are applied by GitHub Copilot chat and inline suggestions. Additional path-scoped guidance lives under `.github/instructions/`.',
    );
    lines.push('');

    lines.push('## Stack');
    if (profile.languages.length > 0) lines.push(`- Languages: ${profile.languages.join(', ')}`);
    const frameworks = profile.techStack.filter((t) => !profile.languages.includes(t));
    if (frameworks.length > 0) lines.push(`- Frameworks: ${frameworks.join(', ')}`);
    if (profile.devOps.buildTools.length > 0) lines.push(`- Build: ${profile.devOps.buildTools.join(', ')}`);
    if (profile.devOps.testFrameworks.length > 0) lines.push(`- Testing: ${profile.devOps.testFrameworks.join(', ')}`);
    if (profile.devOps.cicd) lines.push(`- CI/CD: ${profile.devOps.cicd}`);
    lines.push('');

    lines.push('## Commands');
    const commands = buildCommandBullets(profile);
    if (commands.length === 0) {
      lines.push('- Follow language-standard tooling; no custom commands are defined yet.');
    } else {
      for (const c of commands) lines.push(`- ${c}`);
    }
    lines.push('');

    lines.push('## General rules');
    lines.push('- Run tests before committing; never submit code that fails existing tests.');
    lines.push('- Keep changes scoped to the task — avoid drive-by refactors.');
    lines.push('- Prefer editing existing files; do not create new files unless required.');
    lines.push('- Never hardcode secrets, API keys, passwords, or session tokens.');
    for (const c of buildConventionBullets(profile)) lines.push(`- ${c}`);
    lines.push('');

    if (profile.complianceFrameworks.length > 0 || profile.securityConcerns.length > 0) {
      lines.push('## Boundaries');
      if (profile.complianceFrameworks.includes('hipaa')) {
        lines.push('- HIPAA: no PHI in code, comments, logs, or test fixtures — use synthetic data.');
      }
      if (profile.complianceFrameworks.includes('pci')) {
        lines.push('- PCI-DSS: never store CVV/CVC; mask PANs to the last 4 digits in logs.');
      }
      if (profile.complianceFrameworks.includes('ferpa')) {
        lines.push('- FERPA: never expose student education records to unauthorized parties.');
      }
      if (profile.securityConcerns.includes('dlp')) {
        lines.push('- DLP scanners run on every write — expect blocked writes on sensitive-data matches.');
      }
      if (profile.securityConcerns.includes('strict_permissions')) {
        lines.push('- Destructive shell operations require explicit approval.');
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private renderNonTechnical(profile: UserProfile): string {
    const roleTitle = profile.role === 'ba' ? 'Business Analyst'
      : profile.role === 'pm' ? 'Product Manager'
      : 'Executive';
    return [
      `# ${profile.businessDomain || 'Project'} — ${roleTitle} Workspace`,
      '',
      `GitHub Copilot is used here as an intelligent coworker for ${roleTitle.toLowerCase()} tasks — research, analysis, documentation, and strategic thinking rather than code development.`,
      '',
      '## Guidelines',
      '',
      '- Use clear, non-technical language in all outputs.',
      '- Cite sources and data when making claims.',
      '- Flag assumptions explicitly.',
      '- Provide an executive summary before detailed analysis.',
      '- Use tables and structured formats for comparisons.',
      '',
    ].join('\n');
  }

  private languageInstruction(language: string): GeneratedFile | null {
    const spec = LANGUAGE_INSTRUCTIONS[language];
    if (!spec) return null;
    return {
      relativePath: `.github/instructions/${language}.instructions.md`,
      content: renderInstruction(spec.applyTo, spec.title, spec.bullets),
      description: `Copilot instructions for ${language}`,
    };
  }

  private testsInstruction(): GeneratedFile {
    return {
      relativePath: '.github/instructions/tests.instructions.md',
      content: renderInstruction(
        '**/*.test.*,**/*.spec.*,tests/**,__tests__/**',
        'Test file conventions',
        [
          'Every new feature must have a corresponding test.',
          'Use descriptive test names that explain the expected behavior.',
          'Never commit code that fails existing tests.',
          'Prefer colocated tests when the framework supports it.',
        ],
      ),
      description: 'Copilot scoped instructions for test files',
    };
  }

  private securityInstruction(profile: UserProfile): GeneratedFile {
    const bullets: string[] = [
      'Never hardcode secrets, API keys, passwords, or session tokens.',
      'Validate all user input at system boundaries.',
      'Use parameterized queries for all database access.',
      'Never log sensitive data (PII, PHI, credentials).',
    ];
    if (profile.complianceFrameworks.includes('hipaa')) {
      bullets.push('CRITICAL: no PHI in code, comments, test data, or logs.');
    }
    if (profile.complianceFrameworks.includes('pci')) {
      bullets.push('CRITICAL: no cardholder data in code or logs.');
    }
    if (profile.securityConcerns.includes('dlp')) {
      bullets.push('DLP scanners will block writes that match sensitive-data patterns.');
    }
    if (profile.securityConcerns.includes('strict_permissions')) {
      bullets.push('Destructive shell operations require explicit approval.');
    }
    return {
      relativePath: '.github/instructions/security.instructions.md',
      content: renderInstruction('**', 'Security rules', bullets),
      description: 'Copilot scoped security instructions (applied to all files)',
    };
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────

interface LanguageSpec {
  applyTo: string;
  title: string;
  bullets: string[];
}

const LANGUAGE_INSTRUCTIONS: Record<string, LanguageSpec> = {
  typescript: {
    applyTo: '**/*.ts,**/*.tsx',
    title: 'TypeScript conventions',
    bullets: [
      'Strict mode is mandatory.',
      'Explicit return types on exported functions.',
      'Prefer `interface` over `type` for object shapes.',
      '`const` by default; `let` only when reassignment is needed.',
      'No `any` — use `unknown` and narrow with type guards.',
    ],
  },
  python: {
    applyTo: '**/*.py',
    title: 'Python conventions',
    bullets: [
      'Follow PEP 8.',
      'Type hints on all function signatures.',
      'Use `pathlib` for file paths rather than `os.path`.',
      'Use f-strings for string formatting.',
    ],
  },
  go: {
    applyTo: '**/*.go',
    title: 'Go conventions',
    bullets: [
      'Handle all errors; never use `_` for error returns.',
      'Use table-driven tests.',
      'Keep interfaces small (1-3 methods).',
    ],
  },
  java: {
    applyTo: '**/*.java,**/*.kt',
    title: 'Java/Kotlin conventions',
    bullets: [
      'Use records for value types.',
      'Prefer sealed interfaces for type hierarchies.',
      'Use `Optional` instead of null returns.',
    ],
  },
  rust: {
    applyTo: '**/*.rs',
    title: 'Rust conventions',
    bullets: [
      'Use clippy with `#![deny(clippy::all)]`.',
      'Prefer `Result` over `unwrap()`.',
      'Document public APIs with `///` doc comments.',
    ],
  },
};

function renderInstruction(applyTo: string, title: string, bullets: string[]): string {
  const lines: string[] = [];
  lines.push('---');
  lines.push(`applyTo: ${JSON.stringify(applyTo)}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${title}`);
  lines.push('');
  for (const b of bullets) lines.push(`- ${b}`);
  lines.push('');
  return lines.join('\n');
}
