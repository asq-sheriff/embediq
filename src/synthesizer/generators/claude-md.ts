import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { SetupConfig, GeneratedFile, UserProfile } from '../../types/index.js';
import { MarkdownBuilder } from '../../util/markdown-builder.js';

export class ClaudeMdGenerator implements ConfigGenerator {
  name = 'CLAUDE.md';
  target = TargetFormat.CLAUDE;

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

    // Role-specific focus (technical roles only — non-technical roles get
    // the coworker CLAUDE.md from the orchestrator instead of this file).
    this.addRoleSpecificGuidance(md, profile);

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

    // Install / Build commands — one block per declared build tool so
    // multi-language projects (e.g. C# + Python + Java) see all the
    // commands they actually need to run.
    if (buildTools.includes('npm')) {
      md.bullet('Install: `npm install`');
      md.bullet('Build: `npm run build`');
    }
    if (buildTools.includes('pip')) {
      md.bullet('Install: `pip install -r requirements.txt`');
    }
    if (buildTools.includes('maven')) {
      md.bullet('Install: `mvn install`');
      md.bullet('Build: `mvn clean compile`');
    }
    if (buildTools.includes('gradle')) {
      md.bullet('Build: `./gradlew build`');
    }
    if (buildTools.includes('cargo')) {
      md.bullet('Build: `cargo build`');
    }
    if (buildTools.includes('go_mod')) {
      md.bullet('Build: `go build ./...`');
    }
    if (buildTools.includes('dotnet')) {
      md.bullet('Install: `dotnet restore`');
      md.bullet('Build: `dotnet build`');
    }
    if (buildTools.includes('swift_pm')) {
      md.bullet('Build: `swift build`');
    }
    if (buildTools.includes('bundler')) {
      md.bullet('Install: `bundle install`');
    }

    // Test commands — one block per declared framework.
    if (testFrameworks.includes('jest')) {
      md.bullet('Test: `npm test`');
    }
    if (testFrameworks.includes('pytest')) {
      md.bullet('Test: `pytest`');
    }
    if (testFrameworks.includes('junit')) {
      if (buildTools.includes('maven')) md.bullet('Test: `mvn test`');
      else if (buildTools.includes('gradle')) md.bullet('Test: `./gradlew test`');
    }
    if (testFrameworks.includes('xunit') || testFrameworks.includes('nunit')) {
      md.bullet('Test: `dotnet test`');
    }
    if (testFrameworks.includes('go_test')) {
      md.bullet('Test: `go test ./...`');
    }
    if (testFrameworks.includes('rspec')) {
      md.bullet('Test: `bundle exec rspec`');
    }
    if (testFrameworks.includes('playwright')) {
      md.bullet('E2E: `npx playwright test`');
    }
  }

  /**
   * Per-technical-role guidance — adds a "Your Role Focus" section
   * tailored to the practitioner's daily workflow. Non-technical
   * roles (ba / pm / executive) are handled by the orchestrator's
   * coworker CLAUDE.md path and skip this block entirely.
   *
   * Note: wizard `pm` is currently classified as non-technical in the
   * orchestrator's `isNonTechnical` set, so it routes through the
   * coworker path (and gets the role-specific bullets there) rather
   * than this block. In customer-org taxonomies where "PM" is an
   * engineering / delivery PM, map them to the wizard `lead` role
   * and they pick up the lead guidance here.
   */
  private addRoleSpecificGuidance(md: MarkdownBuilder, profile: UserProfile): void {
    if (['ba', 'pm', 'executive'].includes(profile.role)) return;

    md.h2('Your Role Focus');
    switch (profile.role) {
      case 'developer':
        md.bullet('Build features following the conventions in `.claude/rules/<language>.md` for every language you touch');
        md.bullet('Tests-first: write the failing test before the implementation (per TDD enforcement when enabled)');
        md.bullet('Run the per-language build + test commands above before every commit');
        md.bullet('Keep PRs small and topical — one feature or refactor per branch');
        md.bullet('Reference path-scoped rules via `.claude/rules/*.md`; Claude auto-loads them by file pattern');
        break;
      case 'lead':
        md.bullet('Architectural decisions live in ADRs — reference `.claude/rules/security.md` and any domain-specific rule files when proposing them');
        md.bullet('Cross-cutting concerns (auth, audit, observability) are the lead\'s ownership zone — review every PR that touches them');
        md.bullet('Coordinate code review across the team; agent teams (`.claude/agents/`) accelerate this when 3-5 parallel workstreams are active');
        md.bullet('Bridge product requirements and technical implementation: validate that each story has clear acceptance criteria, edge cases, and rollback plan');
        md.bullet('Technical-debt register: surface it in standups and roadmap discussions, not in a forgotten file');
        break;
      case 'eng_manager':
        md.bullet('Delivery focus: track release governance, dependency risk, and milestone slippage across the engineering teams you coordinate');
        md.bullet('IT-to-Ops bridge: translate engineering progress into operational readiness — handoff checklists, runbook updates, training collateral');
        md.bullet('Stakeholder communication: weekly status to operations, monthly to executives — use `.claude/rules/security.md` to frame any security or compliance items');
        md.bullet('Risk register: maintain explicit risk + mitigation entries per workstream; surface blockers before they become escalations');
        md.bullet('Resource allocation: balance feature delivery against tech-debt paydown using the priority categories the wizard captured');
        md.bullet('Cross-team coordination: when multiple parallel workstreams touch the same surface, use agent teams (`.claude/agents/`) or explicit synchronization gates');
        break;
      case 'devops':
        md.bullet('CI/CD pipelines defined per the configured platform — keep build / test / deploy steps in lockstep with `.claude/rules/` conventions');
        md.bullet('Autopilot drift detection runs on a schedule (see `docs/user-guide/08-autopilot.md`) and auto-opens a PR when configs drift');
        md.bullet('Multi-replica deployment: session + autopilot state are Postgres-backed when configured (`EMBEDIQ_SESSION_BACKEND=database`); pin scheduler to single replica when using JSON store');
        md.bullet('Observability: OpenTelemetry traces + JSONL audit log are the primary signals — wire to your existing collector');
        md.bullet('Secrets in environment vars only — never check in `.env` files; see operator-guide deployment runbook for the canonical set');
        break;
      case 'qa':
        md.bullet('Test strategy is layered: unit (fast, isolated) → integration (real I/O, contained) → e2e (full stack, smoke + critical paths)');
        md.bullet('Per-language testing conventions live in `.claude/rules/<language>.md`; framework specifics live in `.claude/rules/testing.md`');
        md.bullet('Bug reproduction: always capture state + steps + expected vs actual + environment; commit a regression test alongside the fix');
        md.bullet('Coverage is a floor, not a ceiling — chase meaningful coverage of branches, not lines');
        md.bullet('E2E flakiness is a design smell — fix root causes (timing, ordering, shared state), don\'t retry-loop them');
        break;
      case 'data':
        md.bullet('Data exploration belongs in notebooks (Jupyter, Quarto, etc.); commit `.ipynb` outputs cleared and `.py` exports for reproducibility');
        md.bullet('Statistical rigor: document data sources, sample sizes, assumptions, and confidence intervals — every chart has a methodology footer');
        md.bullet('Privacy: NEVER include PHI/PII in notebooks, analysis outputs, or model training data — DLP hooks scan for this');
        md.bullet('Model evaluation: track metrics (accuracy, precision/recall, AUC, calibration) in version control alongside the model artifact');
        md.bullet('Reproducibility: pin every dependency, seed every random source, document the environment that produced each result');
        break;
    }
    md.blank();
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
    if (profile.languages.includes('csharp')) {
      md.bullet('Follow Microsoft C# coding conventions (PascalCase for types/methods, camelCase for locals)');
      md.bullet('Use nullable reference types and `record` for value types');
      md.bullet('Run `dotnet format` before commits');
    }
    if (profile.languages.includes('swift')) {
      md.bullet('Follow the Swift API Design Guidelines');
      md.bullet('Use `swift-format` (or SwiftLint) for style enforcement');
    }
    if (profile.languages.includes('ruby')) {
      md.bullet('Follow the community Ruby Style Guide');
      md.bullet('Use `rubocop` for linting; favor immutability where practical');
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
