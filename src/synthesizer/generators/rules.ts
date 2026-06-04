import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { SetupConfig, GeneratedFile } from '../../types/index.js';
import { MarkdownBuilder } from '../../util/markdown-builder.js';

export class RulesGenerator implements ConfigGenerator {
  name = 'rules';
  target = TargetFormat.CLAUDE;

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
      case 'csharp': {
        const paths = ['**/*.cs', '**/*.csproj', '**/*.fs'];
        md.frontmatter({ description: 'C# / .NET conventions', paths });
        md.h1('C# / .NET Conventions');
        md.bullet('Target the current LTS .NET (net8.0 or net9.0); enable nullable reference types globally');
        md.bullet('Use `record` types for immutable value objects; prefer `sealed` on classes by default');
        md.bullet('Use `async`/`await` end-to-end; avoid `.Result` and `.Wait()` (deadlocks)');
        md.bullet('Use `IAsyncEnumerable<T>` for streaming sequences instead of `Task<List<T>>`');
        md.bullet('Validate input at API boundaries with `ArgumentNullException.ThrowIfNull` (.NET 6+)');
        md.bullet('Use `dotnet format` and StyleCop / EditorConfig for consistent style');
        md.bullet('Run `dotnet test` on every change; track coverage with coverlet');
        return { relativePath: '.claude/rules/csharp.md', content: md.build(), description: 'C#/.NET rules (path-scoped)' };
      }
      case 'swift': {
        const paths = ['**/*.swift'];
        md.frontmatter({ description: 'Swift conventions', paths });
        md.h1('Swift Conventions');
        md.bullet('Use Swift Concurrency (`async`/`await`, `Task`, actors); avoid mixing with GCD');
        md.bullet('Prefer value types (`struct`) over reference types (`class`) unless identity is required');
        md.bullet('Use `let` by default; reach for `var` only when mutation is needed');
        md.bullet('Mark APIs with explicit access control (`private` / `internal` / `public`)');
        md.bullet('Run `swift-format lint --strict` and `swift test` in CI');
        return { relativePath: '.claude/rules/swift.md', content: md.build(), description: 'Swift rules (path-scoped)' };
      }
      case 'ruby': {
        const paths = ['**/*.rb', '**/Gemfile', '**/Rakefile'];
        md.frontmatter({ description: 'Ruby conventions', paths });
        md.h1('Ruby Conventions');
        md.bullet('Follow the community style guide; enforce with `rubocop`');
        md.bullet('Use `frozen_string_literal: true` at the top of every file');
        md.bullet('Prefer keyword arguments for methods with 3+ parameters');
        md.bullet('Use `Struct` / `Data.define` for plain value objects');
        md.bullet('Run `bundle exec rake test` (or `rspec`) on every change');
        return { relativePath: '.claude/rules/ruby.md', content: md.build(), description: 'Ruby rules (path-scoped)' };
      }
      case 'cpp': {
        const paths = ['**/*.cpp', '**/*.cc', '**/*.cxx', '**/*.hpp', '**/*.h'];
        md.frontmatter({ description: 'C++ conventions', paths });
        md.h1('C++ Conventions');
        md.bullet('Target a modern standard (C++17/20); compile with `-Wall -Wextra -Werror`');
        md.bullet('Use RAII and smart pointers (`unique_ptr` / `shared_ptr`); avoid raw `new` / `delete`');
        md.bullet('Prefer `const`, `constexpr`, and pass-by-const-reference; mark overrides `override`');
        md.bullet('Use the standard library (containers, algorithms, `std::optional`, `std::string_view`) over hand-rolled equivalents');
        md.bullet('Run `clang-tidy` + `clang-format`, and build with AddressSanitizer / UBSan in CI');
        return { relativePath: '.claude/rules/cpp.md', content: md.build(), description: 'C++ rules (path-scoped)' };
      }
      case 'sql': {
        const paths = ['**/*.sql'];
        md.frontmatter({ description: 'SQL conventions', paths });
        md.h1('SQL Conventions');
        md.bullet('Always use parameterized queries / bind variables — never string-concatenate user input (SQL injection)');
        md.bullet('Change schema only through versioned, reversible migrations; never hand-edit a production schema');
        md.bullet('Qualify columns and avoid `SELECT *` in application queries');
        md.bullet('Index for the access patterns you run; review `EXPLAIN` plans for hot queries');
        md.bullet('Wrap multi-statement changes in a transaction');
        return { relativePath: '.claude/rules/sql.md', content: md.build(), description: 'SQL rules (path-scoped)' };
      }
      case 'spark': {
        const paths = ['**/spark/**', '**/jobs/**', '**/etl/**', '**/*spark*.py', '**/*spark*.scala'];
        md.frontmatter({ description: 'Apache Spark conventions', paths });
        md.h1('Apache Spark Conventions');
        md.bullet('Prefer the DataFrame / Dataset API over RDDs so Catalyst can optimize');
        md.bullet('Never `.collect()` / `.toPandas()` a large dataset — it pulls everything onto the driver');
        md.bullet('Filter and select columns early (predicate / projection pushdown); avoid unnecessary wide shuffles');
        md.bullet('Use broadcast joins for small dimension tables; partition and `persist()` deliberately');
        md.bullet('Make jobs idempotent and parameterized; write output atomically (to a temp path, then swap)');
        return { relativePath: '.claude/rules/spark.md', content: md.build(), description: 'Apache Spark rules (path-scoped)' };
      }
      case 'javascript': {
        const paths = ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'];
        md.frontmatter({ description: 'JavaScript conventions', paths });
        md.h1('JavaScript Conventions');
        md.bullet('Use `const` by default, `let` only when reassigned; never `var`');
        md.bullet('Prefer ES modules (`import` / `export`) over CommonJS in new code');
        md.bullet('Use strict equality (`===`), optional chaining, and nullish coalescing (`??`)');
        md.bullet('Always handle promise rejections; never leave async errors unhandled');
        md.bullet('Lint with ESLint and format with Prettier');
        return { relativePath: '.claude/rules/javascript.md', content: md.build(), description: 'JavaScript rules (path-scoped)' };
      }
      default:
        return null;
    }
  }
}
