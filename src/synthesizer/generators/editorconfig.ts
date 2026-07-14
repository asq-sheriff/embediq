import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { GenerationContext, GeneratedFile, UserProfile } from '../../types/index.js';

/**
 * Emits a root `.editorconfig` when the team uses Visual Studio
 * (TECH_004 / `profile.devOps.ide` includes `visual_studio`). Visual
 * Studio treats `.editorconfig` as an always-on style + Roslyn-analyzer
 * source, so it is the highest-value VS-native artifact — far more
 * useful than guessing at `.vsconfig` workload lists or project-specific
 * `launchSettings.json`.
 *
 * Carries `TargetFormat.CLAUDE` (project infrastructure, not
 * agent-specific). No-op for non-technical roles and when VS isn't
 * selected, so existing archetypes that don't pick `visual_studio`
 * regenerate byte-identically.
 */
export class EditorConfigGenerator implements ConfigGenerator {
  name = 'editorconfig';
  target = TargetFormat.CLAUDE;

  generate(config: GenerationContext): GeneratedFile[] {
    const { profile } = config;
    if (['ba', 'pm', 'executive'].includes(profile.role)) return [];
    if (!(profile.devOps.ide ?? []).includes('visual_studio')) return [];

    return [
      {
        relativePath: '.editorconfig',
        content: renderEditorConfig(profile),
        description: 'EditorConfig for Visual Studio (style + Roslyn analyzer severities)',
      },
    ];
  }
}

function renderEditorConfig(profile: UserProfile): string {
  const langs = new Set(profile.languages);
  const lines: string[] = [
    'root = true',
    '',
    '[*]',
    'charset = utf-8',
    'end_of_line = lf',
    'insert_final_newline = true',
    'trim_trailing_whitespace = true',
    'indent_style = space',
    'indent_size = 4',
    '',
  ];

  if (langs.has('csharp')) {
    lines.push(
      '[*.cs]',
      'indent_size = 4',
      '# .NET code style',
      'dotnet_sort_system_directives_first = true',
      'csharp_new_line_before_open_brace = all',
      'csharp_prefer_braces = true:warning',
      'dotnet_style_require_accessibility_modifiers = always:warning',
      '# Roslyn analyzer severities',
      'dotnet_diagnostic.CA2007.severity = none',
      'dotnet_diagnostic.IDE0058.severity = silent',
      'dotnet_analyzer_diagnostic.category-Security.severity = warning',
      '',
    );
  }

  if (langs.has('typescript')) {
    lines.push('[*.{ts,tsx,js,jsx}]', 'indent_size = 2', '');
  }

  if (langs.has('python')) {
    lines.push('[*.py]', 'indent_size = 4', 'max_line_length = 88', '');
  }

  if (langs.has('go')) {
    lines.push('[*.go]', 'indent_style = tab', '');
  }

  lines.push('[*.{json,yml,yaml}]', 'indent_size = 2', '');

  return lines.join('\n');
}
