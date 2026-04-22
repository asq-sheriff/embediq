import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { SetupConfig, GeneratedFile } from '../../types/index.js';

export class IgnoreGenerator implements ConfigGenerator {
  name = 'ignore';
  target = TargetFormat.CLAUDE;

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    const files: GeneratedFile[] = [];

    // .claudeignore (root level — coarse exclusions)
    const ignoreLines: string[] = [
      '# Dependencies',
      'node_modules/',
      'vendor/',
      '.venv/',
      'venv/',
      '__pycache__/',
      '',
      '# Build outputs',
      'dist/',
      'build/',
      'target/',
      '.next/',
      'out/',
      '',
      '# IDE',
      '.idea/',
      '.vscode/',
      '*.swp',
      '*.swo',
      '',
      '# OS',
      '.DS_Store',
      'Thumbs.db',
      '',
      '# Logs',
      '*.log',
      'logs/',
      '',
      '# Environment and secrets',
      '.env',
      '.env.*',
      '*.pem',
      '*.key',
      '*.p12',
      '',
    ];

    // Sensitive directories for regulated environments
    if (profile.securityConcerns.includes('phi')) {
      ignoreLines.push('# PHI data (HIPAA)');
      ignoreLines.push('patient_data/');
      ignoreLines.push('phi/');
      ignoreLines.push('health_records/');
      ignoreLines.push('**/phi/**');
      ignoreLines.push('');
    }

    if (profile.securityConcerns.includes('pii')) {
      ignoreLines.push('# PII data');
      ignoreLines.push('pii/');
      ignoreLines.push('personal_data/');
      ignoreLines.push('');
    }

    // Custom restricted paths from REG_006
    const restrictedPaths = profile.answers.get('REG_006')?.value;
    if (typeof restrictedPaths === 'string' && restrictedPaths.trim()) {
      ignoreLines.push('# Custom restricted paths');
      for (const path of restrictedPaths.split(/[,\n]/).map(p => p.trim()).filter(Boolean)) {
        ignoreLines.push(path);
      }
      ignoreLines.push('');
    }

    // Large binary exclusions
    ignoreLines.push('# Large binary files');
    ignoreLines.push('*.zip');
    ignoreLines.push('*.tar.gz');
    ignoreLines.push('*.pkl');
    ignoreLines.push('*.h5');
    ignoreLines.push('*.onnx');
    ignoreLines.push('*.pt');
    ignoreLines.push('*.bin');
    ignoreLines.push('');

    // Domain pack ignore patterns (deduplicated)
    if (config.domainPack?.ignorePatterns && config.domainPack.ignorePatterns.length > 0) {
      const existingSet = new Set(ignoreLines.map(l => l.trim()));
      const domainLines = config.domainPack.ignorePatterns.filter(
        p => !existingSet.has(p.trim()),
      );
      if (domainLines.length > 0) {
        ignoreLines.push(`# ${config.domainPack.name} exclusions`);
        ignoreLines.push(...domainLines);
        ignoreLines.push('');
      }
    }

    files.push({
      relativePath: '.claudeignore',
      content: ignoreLines.join('\n'),
      description: 'Root-level context exclusions',
    });

    // .claude/.claude_ignore (detailed exclusions)
    const detailedIgnore: string[] = [
      '# Detailed context exclusions',
      '# These files are excluded from Claude Code context',
      '',
      '# Package lock files (large, not useful for context)',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'Pipfile.lock',
      'poetry.lock',
      'Cargo.lock',
      'go.sum',
      '',
      '# Generated files',
      '*.min.js',
      '*.min.css',
      '*.map',
      '*.d.ts',
      '',
      '# Data files',
      '*.csv',
      '*.parquet',
      '*.sqlite',
      '*.db',
      '',
      '# Media',
      '*.png',
      '*.jpg',
      '*.jpeg',
      '*.gif',
      '*.svg',
      '*.ico',
      '*.mp4',
      '*.webm',
      '',
      '# Documentation build',
      'docs/_build/',
      'site/',
      '',
    ];

    files.push({
      relativePath: '.claude/.claude_ignore',
      content: detailedIgnore.join('\n'),
      description: 'Detailed context exclusions (vendor, generated, media)',
    });

    return files;
  }
}
