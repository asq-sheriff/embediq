import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { SetupConfig, GeneratedFile } from '../../types/index.js';
import { toYaml } from '../../util/yaml-writer.js';

export class DocumentStateGenerator implements ConfigGenerator {
  name = 'document-state';
  target = TargetFormat.CLAUDE;

  generate(config: SetupConfig): GeneratedFile[] {
    const wantsDocState = config.profile.answers.get('INNOV_002')?.value === true;
    if (!wantsDocState) return [];

    const registry = {
      _description: 'Document state registry. Each documentation file is categorized by lifecycle state. Tools use this to determine which docs need updates when code changes.',
      states: {
        CURRENT: 'Reflects deployed reality. Must be kept in sync with code.',
        FUTURE: 'Planned/roadmap. Not yet implemented.',
        REFERENCE: 'Timeless reference material. Rarely needs updates.',
        ARCHIVED: 'Superseded. Kept for historical context only.',
      },
      documents: [
        { path: 'CLAUDE.md', state: 'CURRENT', description: 'Root Claude Code instructions' },
        { path: 'README.md', state: 'CURRENT', description: 'Project README' },
      ],
    };

    return [{
      relativePath: 'docs/document_state.yaml',
      content: toYaml(registry),
      description: 'Document lifecycle state registry',
    }];
  }
}
