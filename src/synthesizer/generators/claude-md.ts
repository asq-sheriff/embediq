import type { ConfigGenerator } from '../generator.js';
import type { SetupConfig, GeneratedFile, UserProfile } from '../../types/index.js';
import { MarkdownBuilder } from '../../util/markdown-builder.js';

export class ClaudeMdGenerator implements ConfigGenerator {
  name = 'CLAUDE.md';

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    const md = new MarkdownBuilder();

    md.h1(`${profile.businessDomain || 'Project'}`);
    md.blank();

    // Tech stack
    md.h2('Tech Stack');
    if (profile.languages.length > 0) {
      md.bullet(`Languages: ${profile.languages.join(', ')}`);
    }
    if (profile.techStack.length > 0) {
      const frameworks = profile.techStack.filter(t => !profile.languages.includes(t));
      if (frameworks.length > 0) {
        md.bullet(`Frameworks: ${frameworks.join(', ')}`);
      }
    }
    if (profile.devOps.buildTools.length > 0) {
      md.bullet(`Build: ${profile.devOps.buildTools.join(', ')}`);
    }
    if (profile.devOps.testFrameworks.length > 0) {
      md.bullet(`Testing: ${profile.devOps.testFrameworks.join(', ')}`);
    }
    if (profile.devOps.cicd) {
      md.bullet(`CI/CD: ${profile.devOps.cicd}`);
    }
    md.blank();

    // Build & test commands
    md.h2('Build & Test');
    this.addBuildCommands(md, profile);
    md.blank();

    // Code conventions
    md.h2('Code Conventions');
    this.addCodeConventions(md, profile);
    md.blank();

    // Security (if applicable)
    if (profile.securityConcerns.length > 0) {
      md.h2('Security Requirements');
      this.addSecurityRequirements(md, profile);
      md.blank();
    }

    // Compliance (if applicable)
    if (profile.complianceFrameworks.length > 0) {
      md.h2('Compliance');
      for (const framework of profile.complianceFrameworks) {
        md.bullet(`${framework.toUpperCase()} compliance is mandatory`);
      }
      if (profile.securityConcerns.includes('phi')) {
        md.bullet('Never include PHI in code, comments, logs, or test data');
        md.bullet('For PHI handling details, see .claude/rules/hipaa-compliance.md');
      }
      if (profile.securityConcerns.includes('pii')) {
        md.bullet('Never include PII in code, comments, logs, or test data');
      }
      md.blank();
    }

    // Workflow (progressive disclosure pointers)
    md.h2('Workflow');
    md.bullet('Run tests before committing: see Build & Test section above');
    if (profile.securityConcerns.includes('protected_files')) {
      md.bullet('Safety-critical files require approval. See .claude/rules/ for details');
    }
    md.bullet('Use /clear between unrelated tasks to manage context');
    md.blank();

    // Progressive disclosure references
    md.h2('Additional Context');
    md.bullet('Path-scoped rules: .claude/rules/*.md (auto-loaded when editing matching files)');
    if (profile.securityConcerns.length > 0) {
      md.bullet('Security hooks: .claude/hooks/ (enforce PHI/PII/secret scanning)');
    }
    md.blank();

    return [{
      relativePath: 'CLAUDE.md',
      content: md.build(),
      description: 'Root project instructions for Claude Code',
    }];
  }

  private addBuildCommands(md: MarkdownBuilder, profile: UserProfile): void {
    const buildTools = profile.devOps.buildTools;
    const testFrameworks = profile.devOps.testFrameworks;

    if (buildTools.includes('npm')) {
      md.bullet('Install: `npm install`');
      md.bullet('Build: `npm run build`');
    } else if (buildTools.includes('pip')) {
      md.bullet('Install: `pip install -r requirements.txt`');
    } else if (buildTools.includes('maven')) {
      md.bullet('Build: `mvn clean compile`');
    } else if (buildTools.includes('gradle')) {
      md.bullet('Build: `./gradlew build`');
    } else if (buildTools.includes('cargo')) {
      md.bullet('Build: `cargo build`');
    } else if (buildTools.includes('go_mod')) {
      md.bullet('Build: `go build ./...`');
    }

    if (testFrameworks.includes('jest')) {
      md.bullet('Test: `npm test`');
    } else if (testFrameworks.includes('pytest')) {
      md.bullet('Test: `pytest`');
    } else if (testFrameworks.includes('junit')) {
      if (buildTools.includes('maven')) md.bullet('Test: `mvn test`');
      else if (buildTools.includes('gradle')) md.bullet('Test: `./gradlew test`');
    } else if (testFrameworks.includes('go_test')) {
      md.bullet('Test: `go test ./...`');
    } else if (testFrameworks.includes('rspec')) {
      md.bullet('Test: `bundle exec rspec`');
    }

    if (testFrameworks.includes('playwright')) {
      md.bullet('E2E: `npx playwright test`');
    }
  }

  private addCodeConventions(md: MarkdownBuilder, profile: UserProfile): void {
    if (profile.languages.includes('typescript')) {
      md.bullet('Use TypeScript strict mode');
      md.bullet('Prefer `const` over `let`, avoid `var`');
      md.bullet('Use explicit return types on exported functions');
    }
    if (profile.languages.includes('python')) {
      md.bullet('Follow PEP 8 style guide');
      md.bullet('Use type hints on all function signatures');
    }
    if (profile.languages.includes('go')) {
      md.bullet('Follow effective Go conventions');
      md.bullet('Handle all errors explicitly');
    }
    if (profile.languages.includes('java')) {
      md.bullet('Follow standard Java naming conventions');
      md.bullet('Use records for value types (Java 16+)');
    }
    if (profile.languages.includes('rust')) {
      md.bullet('Follow Rust API guidelines');
      md.bullet('Use `clippy` for all linting');
    }
  }

  private addSecurityRequirements(md: MarkdownBuilder, profile: UserProfile): void {
    md.bullet('Never commit secrets, API keys, or credentials');
    if (profile.securityConcerns.includes('phi')) {
      md.bullet('NEVER include PHI in any form: code, comments, test fixtures, logs');
    }
    if (profile.securityConcerns.includes('pii')) {
      md.bullet('NEVER include PII in any form: code, comments, test fixtures, logs');
    }
    if (profile.securityConcerns.includes('dlp')) {
      md.bullet('DLP hooks actively scan all edits for sensitive data patterns');
    }
    if (profile.securityConcerns.includes('context_sanitization')) {
      md.bullet('Context sanitization is active: sensitive directories are excluded from Claude context');
    }
    if (profile.securityConcerns.includes('output_review')) {
      md.bullet('Output review hooks scan generated code before file writes');
    }
    md.bullet('Follow OWASP Top 10 guidelines for all user-facing code');
  }
}
