import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { GeneratedFile } from '../types/index.js';

export class FileOutputManager {
  constructor(private targetDir: string) {}

  writeAll(files: GeneratedFile[]): { written: string[]; errors: string[] } {
    const written: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const fullPath = join(this.targetDir, file.relativePath);
        const dir = dirname(fullPath);

        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        writeFileSync(fullPath, file.content, 'utf-8');
        written.push(file.relativePath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${file.relativePath}: ${msg}`);
      }
    }

    return { written, errors };
  }

  ensureTargetDir(): boolean {
    try {
      if (!existsSync(this.targetDir)) {
        mkdirSync(this.targetDir, { recursive: true });
      }
      return true;
    } catch {
      return false;
    }
  }
}
