import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import {
  loadCorpus,
  runEligibilityGate,
  scenarioProfile,
  classifyDataClass,
  type EligibilityScenario,
} from '../../src/evaluation/eligibility-gate.js';

const CORPUS_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/eligibility-corpus.yaml',
);
const corpus = loadCorpus(CORPUS_PATH);

function run(scenario: EligibilityScenario) {
  return runEligibilityGate(corpus, scenarioProfile(scenario));
}

describe('classifier — real shipped DLP patterns', () => {
  it('catches the plainly-formatted regulated identifiers', () => {
    expect(classifyDataClass('Patient MRN: 4855120 refill')).toBe('phi');
    expect(classifyDataClass('resource Patient/abc-123 not found')).toBe('phi');
    expect(classifyDataClass('card 4111111111111111 declined')).toBe('pci');
    expect(classifyDataClass('cvv: 123 failing')).toBe('pci');
  });

  it('MISSES the adversarial cases — which is the whole point', () => {
    expect(classifyDataClass('Decode this: TVJOOiA0ODU1MTIw')).toBe('public'); // base64 PHI
    expect(classifyDataClass('record number is 4855 followed by 120')).toBe('public'); // split
    expect(classifyDataClass('card 4111 1111 1111 1111 rejected')).toBe('public'); // spaced PAN
  });
});

describe('eligibility gate — route absence beats a filter', () => {
  it('AIR-GAPPED: passes even though the classifier misses — nothing can leave', () => {
    const report = run('airgapped');
    expect(report.passed).toBe(true);
    expect(report.violations).toHaveLength(0);
    expect(report.misclassified).toBeGreaterThan(0); // the classifier DID miss; it just can't matter
    expect(report.traces.every((t) => t.eligible.every((id) => id.startsWith('ollama:')))).toBe(true);
  });

  it('COVERED-ONLY: passes — no uncovered destination exists to breach', () => {
    const report = run('covered');
    expect(report.passed).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it('MIXED (covered + uncovered): FAILS — a classifier miss becomes a real leak', () => {
    const report = run('mixed');
    expect(report.passed).toBe(false);
    const ids = report.violations.map((v) => v.promptId);
    expect(ids).toContain('phi-base64-adversarial');
    expect(ids).toContain('pci-pan-spaced-adversarial');
    // every violation is a regulated prompt reaching the uncovered provider
    expect(report.violations.every((v) => v.trueClass === 'phi' || v.trueClass === 'pci')).toBe(true);
    expect(report.violations.every((v) => v.violationReason?.includes('openai'))).toBe(true);
  });

  it('correctly-classified regulated prompts never violate, even in mixed', () => {
    const report = run('mixed');
    const byId = new Map(report.traces.map((t) => [t.promptId, t]));
    expect(byId.get('phi-mrn-plain')!.violation).toBe(false);
    expect(byId.get('pci-pan-plain')!.violation).toBe(false);
  });

  it('never leaks a seeded identifier value into a decision trace, any scenario', () => {
    for (const s of ['airgapped', 'covered', 'mixed'] as EligibilityScenario[]) {
      expect(run(s).valueLeaks).toEqual([]);
    }
  });
});
