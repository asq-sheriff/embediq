import type { ConfigGenerator } from '../generator.js';
import type { SetupConfig, GeneratedFile } from '../../types/index.js';
import { toYaml } from '../../util/yaml-writer.js';

export class AssociationMapGenerator implements ConfigGenerator {
  name = 'association-map';

  generate(config: SetupConfig): GeneratedFile[] {
    const wantsMap = config.profile.answers.get('INNOV_003')?.value === true;
    if (!wantsMap) return [];

    const map = {
      _description: 'Bidirectional association map linking code, tests, docs, and infrastructure. Used by /impact command and PostToolUse hooks to surface related files after edits.',
      groups: {
        code: {
          description: 'Source code files',
          patterns: this.getCodePatterns(config),
        },
        tests: {
          description: 'Test files (unit, integration, e2e)',
          patterns: this.getTestPatterns(config),
        },
        docs: {
          description: 'Documentation and guides',
          patterns: [
            'docs/**/*.md',
            'CLAUDE.md',
            '.claude/rules/*.md',
            'README.md',
          ],
        },
        infrastructure: {
          description: 'Infrastructure, CI/CD, and config files',
          patterns: this.getInfraPatterns(config),
        },
      },
      associations: [
        {
          description: 'Example: link a service to its tests and docs',
          code: ['src/example/**'],
          tests: ['tests/example/**'],
          docs: ['docs/example.md'],
          infrastructure: [],
        },
      ],
    };

    return [{
      relativePath: 'association_map.yaml',
      content: toYaml(map),
      description: 'Bidirectional code-test-doc-infra association map',
    }];
  }

  private getCodePatterns(config: SetupConfig): string[] {
    const patterns: string[] = [];
    const langs = config.profile.languages;
    if (langs.includes('typescript')) patterns.push('src/**/*.ts', 'src/**/*.tsx');
    if (langs.includes('python')) patterns.push('src/**/*.py', 'app/**/*.py');
    if (langs.includes('java')) patterns.push('src/**/*.java');
    if (langs.includes('go')) patterns.push('**/*.go');
    if (langs.includes('rust')) patterns.push('src/**/*.rs');
    if (langs.includes('ruby')) patterns.push('app/**/*.rb', 'lib/**/*.rb');
    if (langs.includes('csharp')) patterns.push('src/**/*.cs');
    if (patterns.length === 0) patterns.push('src/**/*');
    return patterns;
  }

  private getTestPatterns(config: SetupConfig): string[] {
    const patterns: string[] = [];
    const frameworks = config.profile.devOps.testFrameworks;
    if (frameworks.includes('jest')) patterns.push('**/*.test.ts', '**/*.spec.ts', '**/__tests__/**');
    if (frameworks.includes('pytest')) patterns.push('tests/**/*.py', '**/test_*.py');
    if (frameworks.includes('junit')) patterns.push('src/test/**/*.java');
    if (frameworks.includes('go_test')) patterns.push('**/*_test.go');
    if (frameworks.includes('rspec')) patterns.push('spec/**/*_spec.rb');
    if (frameworks.includes('playwright')) patterns.push('e2e/**/*', 'tests/e2e/**/*');
    if (patterns.length === 0) patterns.push('tests/**/*', '**/*.test.*');
    return patterns;
  }

  private getInfraPatterns(config: SetupConfig): string[] {
    const patterns: string[] = [
      'Makefile',
      'Dockerfile',
      'docker-compose*.yml',
      '.github/workflows/**',
      '.gitlab-ci.yml',
      'Jenkinsfile',
    ];
    const buildTools = config.profile.devOps.buildTools;
    if (buildTools.includes('npm')) patterns.push('package.json', 'tsconfig.json');
    if (buildTools.includes('maven')) patterns.push('pom.xml');
    if (buildTools.includes('gradle')) patterns.push('build.gradle*', 'settings.gradle*');
    if (buildTools.includes('pip')) patterns.push('requirements*.txt', 'pyproject.toml', 'setup.py');
    if (buildTools.includes('cargo')) patterns.push('Cargo.toml');
    if (buildTools.includes('go_mod')) patterns.push('go.mod');
    return patterns;
  }
}
