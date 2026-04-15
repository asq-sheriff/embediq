import type { Dimension, DimensionProgress } from '../types/index.js';

export class DimensionTracker {
  private progress: Map<Dimension, DimensionProgress> = new Map();

  init(dimension: Dimension, total: number): void {
    this.progress.set(dimension, { dimension, total, answered: 0, skipped: 0 });
  }

  recordAnswer(dimension: Dimension): void {
    const p = this.progress.get(dimension);
    if (p) p.answered++;
  }

  recordSkip(dimension: Dimension): void {
    const p = this.progress.get(dimension);
    if (p) p.skipped++;
  }

  updateTotal(dimension: Dimension, total: number): void {
    const p = this.progress.get(dimension);
    if (p) p.total = total;
  }

  getAll(): DimensionProgress[] {
    return [...this.progress.values()];
  }

  get(dimension: Dimension): DimensionProgress | undefined {
    return this.progress.get(dimension);
  }
}
