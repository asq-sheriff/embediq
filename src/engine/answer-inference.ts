/**
 * Default-inference for optional questions. When a user skips an optional
 * question, the wizard can still produce a correct config by inferring a
 * sensible default from their other answers — most commonly from the
 * selected languages (TECH_001). These functions are pure and are applied
 * by `ProfileBuilder` ONLY when the corresponding answer is empty, so an
 * explicit answer always wins.
 *
 * The language → tool mappings mirror the `relevantFor` tags already declared
 * on the TECH_005 / TECH_006 / TECH_011 options in the question registry, so
 * inference stays consistent with what those questions would have offered.
 */

/** Build tool per language (TECH_005 option keys). */
const BUILD_TOOL_BY_LANGUAGE: Record<string, string> = {
  typescript: 'npm',
  javascript: 'npm',
  python: 'pip',
  java: 'maven',
  csharp: 'dotnet',
  go: 'go_mod',
  rust: 'cargo',
  ruby: 'bundler',
  swift: 'swift_pm',
};

/** Test framework per language (TECH_006 option keys). */
const TEST_FRAMEWORK_BY_LANGUAGE: Record<string, string> = {
  typescript: 'jest',
  javascript: 'jest',
  python: 'pytest',
  java: 'junit',
  csharp: 'xunit',
  go: 'go_test',
  ruby: 'rspec',
};

/** Linter/formatter per language (TECH_011 option keys); a language may map to several. */
const LINTERS_BY_LANGUAGE: Record<string, string[]> = {
  typescript: ['prettier', 'eslint'],
  javascript: ['prettier', 'eslint'],
  python: ['ruff'],
  go: ['gofmt'],
  ruby: ['rubocop'],
  rust: ['clippy'],
};

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

/** Default IDE when TECH_004 is skipped — VS Code is the most common. */
export function inferIdes(): string[] {
  return ['vscode'];
}

/** Build tools inferred from the selected languages (TECH_001). */
export function inferBuildTools(languages: string[]): string[] {
  return dedupe(languages.map((l) => BUILD_TOOL_BY_LANGUAGE[l]).filter(Boolean));
}

/** Test frameworks inferred from the selected languages. */
export function inferTestFrameworks(languages: string[]): string[] {
  return dedupe(languages.map((l) => TEST_FRAMEWORK_BY_LANGUAGE[l]).filter(Boolean));
}

/** Linters/formatters inferred from the selected languages. */
export function inferLinters(languages: string[]): string[] {
  return dedupe(languages.flatMap((l) => LINTERS_BY_LANGUAGE[l] ?? []));
}

/**
 * Apply an inferred fallback only when the explicit answer is empty.
 * Records the field as inferred via the `onInfer` callback so callers
 * (e.g. the profile report) can tag it.
 */
export function orInfer(
  field: string,
  actual: string[],
  inferred: string[],
  onInfer?: (field: string, values: string[]) => void,
): string[] {
  if (actual.length > 0) return actual;
  if (inferred.length > 0 && onInfer) onInfer(field, inferred);
  return inferred;
}
