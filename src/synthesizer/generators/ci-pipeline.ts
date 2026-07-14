import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { GenerationContext, GeneratedFile, UserProfile } from '../../types/index.js';

/**
 * CI pipeline generator. Emits a runnable pipeline file matched to the
 * team's CI platform (TECH_007 / `profile.devOps.cicd`). Current scope:
 * Azure DevOps only (`azure-pipelines.yml`), emitted when the team also
 * targets Azure cloud (TECH_022 / `profile.devOps.cloudTarget === 'azure'`).
 * The generate() body is a switch on the CI value so GitHub Actions /
 * GitLab CI can be added later without touching the orchestrator.
 *
 * Carries `TargetFormat.CLAUDE` because CI configuration is project
 * infrastructure, not agent-specific output — the same rationale as
 * `rules.ts` and `setup-instructions.ts`. Returns `[]` for non-technical
 * roles and for any CI/cloud combination it does not yet scaffold.
 *
 * The YAML is rendered with a line-array string builder (not a YAML
 * serializer) so output is byte-stable across `yaml` package versions —
 * a hard requirement for the drift detector, which regenerates and
 * compares this file.
 */
export class CiPipelineGenerator implements ConfigGenerator {
  name = 'ci-pipeline';
  target = TargetFormat.CLAUDE;

  generate(config: GenerationContext): GeneratedFile[] {
    const { profile } = config;
    if (['ba', 'pm', 'executive'].includes(profile.role)) return [];

    switch (profile.devOps.cicd) {
      case 'azure_devops':
        // A complete Azure pipeline only makes sense when the team also
        // deploys to Azure. Azure DevOps targeting a different cloud is a
        // valid setup, but the deploy-stage scaffolding would be wrong, so
        // we keep the build/test pipeline and skip cloud-specific deploy.
        return [this.azurePipeline(profile)];
      default:
        return [];
    }
  }

  private azurePipeline(profile: UserProfile): GeneratedFile {
    return {
      relativePath: 'azure-pipelines.yml',
      content: renderAzurePipeline(profile),
      description: 'Azure DevOps CI pipeline matched to the project stack',
    };
  }
}

interface JobSpec {
  id: string;
  displayName: string;
  steps: string[];
}

/**
 * Build the ordered list of jobs from the profile's languages, build
 * tools, and test frameworks. Iterates a fixed canonical order so the
 * output is deterministic regardless of how the answer arrays are sorted.
 */
function buildJobs(profile: UserProfile): JobSpec[] {
  const build = new Set(profile.devOps.buildTools);
  const langs = new Set(profile.languages);
  const tests = new Set(profile.devOps.testFrameworks);
  const jobs: JobSpec[] = [];

  // .NET
  if (build.has('dotnet') || langs.has('csharp')) {
    const steps = [
      'task: UseDotNet@2',
      '  inputs:',
      '    packageType: sdk',
      '    version: 8.0.x',
      'script: dotnet restore',
      '  displayName: Restore',
      'script: dotnet build --configuration $(buildConfiguration) --no-restore',
      '  displayName: Build',
    ];
    if (tests.has('xunit') || tests.has('nunit')) {
      steps.push(
        'script: dotnet test --no-build --configuration $(buildConfiguration) --logger trx --results-directory $(Agent.TempDirectory)',
        '  displayName: Test',
        'task: PublishTestResults@2',
        '  condition: succeededOrFailed()',
        '  inputs:',
        '    testResultsFormat: VSTest',
        "    testResultsFiles: '**/*.trx'",
        '    searchFolder: $(Agent.TempDirectory)',
      );
    }
    jobs.push({ id: 'dotnet', displayName: '.NET build & test', steps });
  }

  // Python
  if (build.has('pip') || langs.has('python')) {
    const steps = [
      'task: UsePythonVersion@0',
      '  inputs:',
      '    versionSpec: 3.x',
      'script: python -m pip install --upgrade pip',
      '  displayName: Upgrade pip',
      'script: pip install -r requirements.txt',
      '  displayName: Install dependencies',
    ];
    if (tests.has('pytest')) {
      steps.push(
        'script: pytest --junitxml=junit/test-results.xml',
        '  displayName: Test (pytest)',
        'task: PublishTestResults@2',
        '  condition: succeededOrFailed()',
        '  inputs:',
        "    testResultsFiles: 'junit/test-results.xml'",
      );
    }
    jobs.push({ id: 'python', displayName: 'Python build & test', steps });
  }

  // Java — Maven
  if (build.has('maven')) {
    jobs.push({
      id: 'java_maven',
      displayName: 'Java build & test (Maven)',
      steps: [
        'task: Maven@4',
        '  inputs:',
        '    mavenPomFile: pom.xml',
        "    goals: 'clean verify'",
        '    publishJUnitResults: true',
        "    testResultsFiles: '**/surefire-reports/TEST-*.xml'",
      ],
    });
  } else if (build.has('gradle')) {
    // Java — Gradle (only when Maven isn't present, to avoid double-building)
    jobs.push({
      id: 'java_gradle',
      displayName: 'Java build & test (Gradle)',
      steps: [
        'task: Gradle@3',
        '  inputs:',
        '    gradleWrapperFile: gradlew',
        "    tasks: 'build'",
        '    publishJUnitResults: true',
        "    testResultsFiles: '**/build/test-results/**/TEST-*.xml'",
      ],
    });
  }

  // Node / TypeScript
  if (build.has('npm') || langs.has('typescript')) {
    const steps = [
      'task: NodeTool@0',
      '  inputs:',
      "    versionSpec: '20.x'",
      'script: npm ci',
      '  displayName: Install dependencies',
      'script: npm run build --if-present',
      '  displayName: Build',
    ];
    if (tests.has('jest') || tests.has('playwright')) {
      steps.push('script: npm test', '  displayName: Test');
    }
    jobs.push({ id: 'node', displayName: 'Node build & test', steps });
  }

  // Go
  if (build.has('go_mod') || langs.has('go')) {
    jobs.push({
      id: 'go',
      displayName: 'Go build & test',
      steps: [
        'task: GoTool@0',
        '  inputs:',
        "    version: '1.22'",
        'script: go build ./...',
        '  displayName: Build',
        'script: go test ./...',
        '  displayName: Test',
      ],
    });
  }

  // Rust
  if (build.has('cargo') || langs.has('rust')) {
    jobs.push({
      id: 'rust',
      displayName: 'Rust build & test',
      steps: [
        'script: cargo build --release',
        '  displayName: Build',
        'script: cargo test',
        '  displayName: Test',
      ],
    });
  }

  // Fallback — a valid, runnable pipeline even when no known build tool matched.
  if (jobs.length === 0) {
    jobs.push({
      id: 'build',
      displayName: 'Build & test',
      steps: [
        'script: echo "TODO: add your build and test commands"',
        '  displayName: Build & test',
      ],
    });
  }

  return jobs;
}

/**
 * Compliance-driven dependency/secret-scan steps. Returns [] when no
 * enforced compliance framework applies, so the Security stage is omitted
 * entirely and non-regulated projects keep a lean pipeline.
 */
function buildSecuritySteps(profile: UserProfile): string[] {
  const enforced = ['hipaa', 'pci', 'soc2', 'gdpr', 'fedramp'];
  if (!profile.complianceFrameworks.some((fw) => enforced.includes(fw))) return [];

  const build = new Set(profile.devOps.buildTools);
  const langs = new Set(profile.languages);
  const steps: string[] = [];

  if (build.has('dotnet') || langs.has('csharp')) {
    steps.push(
      'script: dotnet list package --vulnerable --include-transitive',
      '  displayName: .NET vulnerable packages',
    );
  }
  if (build.has('pip') || langs.has('python')) {
    steps.push(
      'script: pip install pip-audit && pip-audit',
      '  displayName: Python dependency audit',
    );
  }
  if (build.has('npm') || langs.has('typescript')) {
    steps.push('script: npm audit --audit-level=high', '  displayName: npm audit');
  }
  // Always include a secret-scan placeholder for regulated repos.
  steps.push(
    'script: echo "TODO: wire your org secret scanner (e.g. gitleaks / Credential Scanner)"',
    '  displayName: Secret scan',
  );
  return steps;
}

/** Render a job's steps (each step descriptor is a `key: value` head line
 *  followed by `  ...` continuation lines) into properly-indented YAML.
 *  `script:` command values are single-quoted so colons and other YAML
 *  metacharacters in shell commands (e.g. `echo "TODO: ..."`) don't break
 *  parsing — single quotes need only `'` doubled, which no command uses. */
function renderSteps(steps: string[], indent: string): string[] {
  const out: string[] = [];
  for (const step of steps) {
    if (step.startsWith('  ')) {
      // Continuation line for the previous step.
      out.push(`${indent}  ${step.slice(2)}`);
    } else {
      const script = /^script: (.*)$/.exec(step);
      if (script) {
        out.push(`${indent}- script: '${script[1].replace(/'/g, "''")}'`);
      } else {
        out.push(`${indent}- ${step}`);
      }
    }
  }
  return out;
}

function renderAzurePipeline(profile: UserProfile): string {
  const jobs = buildJobs(profile);
  const securitySteps = buildSecuritySteps(profile);
  const domain = profile.businessDomain || 'project';

  const lines: string[] = [
    `# Azure DevOps pipeline for ${domain}`,
    '# Regenerate with the EmbedIQ wizard; edits here are not auto-preserved.',
    'trigger:',
    '  branches:',
    '    include:',
    '      - main',
    '      - develop',
    'pr:',
    '  branches:',
    '    include:',
    '      - main',
    '',
    'pool:',
    '  vmImage: ubuntu-latest',
    '',
    'variables:',
    '  buildConfiguration: Release',
    '',
    'stages:',
    '  - stage: Build_Test',
    '    displayName: Build and test',
    '    jobs:',
  ];

  for (const job of jobs) {
    lines.push(`      - job: ${job.id}`);
    lines.push(`        displayName: ${job.displayName}`);
    lines.push('        steps:');
    lines.push(...renderSteps(job.steps, '          '));
  }

  if (securitySteps.length > 0) {
    const frameworks = profile.complianceFrameworks.map((f) => f.toUpperCase()).join(', ');
    lines.push('  - stage: Security');
    lines.push(`    displayName: Security & compliance checks (${frameworks})`);
    lines.push('    dependsOn: Build_Test');
    lines.push('    jobs:');
    lines.push('      - job: audit');
    lines.push('        displayName: Dependency & secret scan');
    lines.push('        steps:');
    lines.push(...renderSteps(securitySteps, '          '));
  }

  lines.push('');
  return lines.join('\n');
}
