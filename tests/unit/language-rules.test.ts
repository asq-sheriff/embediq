import { describe, it, expect } from 'vitest';
import { RulesGenerator } from '../../src/synthesizer/generators/rules.js';
import { createEmptyProfile, type UserProfile, type SetupConfig } from '../../src/types/index.js';

function makeProfile(languages: string[], overrides: Partial<UserProfile> = {}): UserProfile {
  const p = createEmptyProfile();
  p.role = 'developer';
  p.businessDomain = 'TestProject';
  p.languages = languages;
  p.techStack = [...languages];
  p.devOps = {
    ide: ['vscode'],
    buildTools: [],
    testFrameworks: [],
    cicd: 'github_actions',
    monitoring: [],
    containerization: [],
  };
  return { ...p, ...overrides };
}

function makeConfig(profile: UserProfile): SetupConfig {
  return { profile, targetDir: '/test' };
}

function findRule(files: { relativePath: string; content: string }[], name: string): { relativePath: string; content: string } | undefined {
  return files.find((f) => f.relativePath === `.claude/rules/${name}`);
}

describe('RulesGenerator — language coverage', () => {
  const supported: Array<[string, string]> = [
    ['typescript', 'typescript.md'],
    ['python', 'python.md'],
    ['go', 'go.md'],
    ['java', 'java.md'],
    ['rust', 'rust.md'],
    ['csharp', 'csharp.md'],
    ['swift', 'swift.md'],
    ['ruby', 'ruby.md'],
  ];

  for (const [lang, file] of supported) {
    it(`emits ${file} when languages include "${lang}"`, () => {
      const files = new RulesGenerator().generate(makeConfig(makeProfile([lang])));
      expect(findRule(files, file)).toBeDefined();
    });
  }

  it('emits no language-specific rules when no recognized languages are selected', () => {
    const files = new RulesGenerator().generate(makeConfig(makeProfile([])));
    const langFiles = files.filter((f) => /\.claude\/rules\/(typescript|python|go|java|rust|csharp|swift|ruby)\.md$/.test(f.relativePath));
    expect(langFiles).toHaveLength(0);
  });

  it('emits multiple language rules when multiple are selected', () => {
    const files = new RulesGenerator().generate(makeConfig(makeProfile(['csharp', 'typescript', 'ruby'])));
    expect(findRule(files, 'csharp.md')).toBeDefined();
    expect(findRule(files, 'typescript.md')).toBeDefined();
    expect(findRule(files, 'ruby.md')).toBeDefined();
  });
});

describe('csharp.md content', () => {
  const csharp = () => {
    const files = new RulesGenerator().generate(makeConfig(makeProfile(['csharp'])));
    return findRule(files, 'csharp.md')!.content;
  };

  it('targets the current .NET LTS', () => {
    expect(csharp()).toMatch(/net[89]\.0/i);
  });

  it('recommends nullable reference types', () => {
    expect(csharp()).toContain('nullable reference types');
  });

  it('warns against .Result / .Wait() (sync-over-async deadlock)', () => {
    expect(csharp()).toMatch(/\.Result.*\.Wait/);
  });

  it('mentions dotnet format and dotnet test', () => {
    expect(csharp()).toContain('dotnet format');
    expect(csharp()).toContain('dotnet test');
  });

  it('is path-scoped to C# source + project files', () => {
    expect(csharp()).toContain('**/*.cs');
    expect(csharp()).toContain('**/*.csproj');
  });
});

describe('swift.md content', () => {
  const swift = () => {
    const files = new RulesGenerator().generate(makeConfig(makeProfile(['swift'])));
    return findRule(files, 'swift.md')!.content;
  };

  it('recommends Swift Concurrency over GCD', () => {
    expect(swift()).toContain('Swift Concurrency');
  });

  it('mentions swift test and swift-format lint', () => {
    expect(swift()).toContain('swift test');
    expect(swift()).toContain('swift-format lint');
  });

  it('is path-scoped to .swift', () => {
    expect(swift()).toContain('**/*.swift');
  });
});

describe('ruby.md content', () => {
  const ruby = () => {
    const files = new RulesGenerator().generate(makeConfig(makeProfile(['ruby'])));
    return findRule(files, 'ruby.md')!.content;
  };

  it('enforces frozen_string_literal pragma', () => {
    expect(ruby()).toContain('frozen_string_literal: true');
  });

  it('mentions rubocop and bundle exec rake test', () => {
    expect(ruby()).toContain('rubocop');
    expect(ruby()).toContain('bundle exec rake test');
  });

  it('is path-scoped to Ruby sources + Gemfile + Rakefile', () => {
    expect(ruby()).toContain('**/*.rb');
    expect(ruby()).toContain('Gemfile');
    expect(ruby()).toContain('Rakefile');
  });
});
