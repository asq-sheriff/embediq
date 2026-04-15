import type { ConfigGenerator } from '../generator.js';
import type { SetupConfig, GeneratedFile } from '../../types/index.js';
import { MarkdownBuilder } from '../../util/markdown-builder.js';

export class SkillsGenerator implements ConfigGenerator {
  name = 'skills';

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    const files: GeneratedFile[] = [];

    // Memory sync skill
    if (profile.answers.get('INNOV_004')?.value === true) {
      const md = new MarkdownBuilder();
      md.frontmatter({
        description: 'Synchronize elastic memory files with current codebase state',
        model: 'haiku',
        effort: 'low',
      });
      md.h1('Memory Sync');
      md.paragraph('Update .claude/memory/ files to reflect current codebase state.');
      md.h2('Steps');
      md.numberedItem(1, 'Read current memory files in .claude/memory/');
      md.numberedItem(2, 'Compare with current project structure and code');
      md.numberedItem(3, 'Update stale entries, remove obsolete references');
      md.numberedItem(4, 'Report what changed');

      files.push({
        relativePath: '.claude/skills/sync-memory.md',
        content: md.build(),
        description: 'Memory sync skill',
      });
    }

    // Impact analysis skill
    if (profile.answers.get('INNOV_003')?.value === true) {
      const md = new MarkdownBuilder();
      md.frontmatter({
        description: 'Analyze downstream impact of code changes',
        model: 'sonnet',
        effort: 'medium',
      });
      md.h1('Impact Analysis');
      md.paragraph('Analyze the impact of recent changes across code, tests, docs, and infrastructure.');
      md.h2('Steps');
      md.numberedItem(1, 'Identify changed files from git diff');
      md.numberedItem(2, 'Cross-reference with association_map.yaml');
      md.numberedItem(3, 'List related tests, docs, and infra files that may need updates');
      md.numberedItem(4, 'Flag any broken cross-references');

      files.push({
        relativePath: '.claude/skills/impact-analysis.md',
        content: md.build(),
        description: 'Impact analysis skill',
      });
    }

    return files;
  }
}
