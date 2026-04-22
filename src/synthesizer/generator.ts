import type { SetupConfig, GeneratedFile } from '../types/index.js';
import type { TargetFormat } from './target-format.js';

export interface ConfigGenerator {
  name: string;
  /**
   * The target this generator produces output for. Declared at the
   * generator level so the orchestrator can filter by
   * `config.targets` without a separate registration map.
   */
  target: TargetFormat;
  generate(config: SetupConfig): GeneratedFile[] | Promise<GeneratedFile[]>;
}
