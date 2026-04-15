import type { SetupConfig, GeneratedFile } from '../types/index.js';

export interface ConfigGenerator {
  name: string;
  generate(config: SetupConfig): GeneratedFile[];
}
