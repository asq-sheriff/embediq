import type { GenerationContext, GeneratedFile } from '../types/index.js';
import type { TargetFormat } from './target-format.js';

export interface ConfigGenerator {
  name: string;
  /**
   * The target this generator produces output for. Declared at the
   * generator level so the orchestrator can filter by
   * `ctx.targets` without a separate registration map.
   */
  target: TargetFormat;
  generate(ctx: GenerationContext): GeneratedFile[] | Promise<GeneratedFile[]>;
}
