import { describe, it, expect } from 'vitest';
import { validateAnswers } from '../../src/engine/answer-validator.js';
import type { Answer } from '../../src/types/index.js';

function answers(map: Record<string, string | string[]>): Map<string, Answer> {
  const out = new Map<string, Answer>();
  for (const [id, value] of Object.entries(map)) {
    out.set(id, { questionId: id, value, timestamp: new Date(0) });
  }
  return out;
}

describe('answer-validator', () => {
  it('warns + suggests when a typed framework needs an unselected language', () => {
    const w = validateAnswers(answers({ TECH_001: ['python'], TECH_003: 'FastAPI, Spring Boot' }));
    const fw = w.find((x) => x.questionId === 'TECH_003');
    expect(fw).toBeDefined();
    expect(fw!.message).toContain('Java');
    expect(fw!.suggestion).toContain('Java');
  });

  it('does not warn when the framework language is selected', () => {
    const w = validateAnswers(answers({ TECH_001: ['java', 'python'], TECH_003: 'Spring Boot, FastAPI' }));
    expect(w.filter((x) => x.questionId === 'TECH_003')).toHaveLength(0);
  });

  it('flags serverless without a cloud target', () => {
    const w = validateAnswers(answers({ TECH_008: ['serverless'] }));
    expect(w.some((x) => x.questionId === 'TECH_022')).toBe(true);
    // ...but not when a cloud is chosen
    const ok = validateAnswers(answers({ TECH_008: ['serverless'], TECH_022: 'aws' }));
    expect(ok.some((x) => x.questionId === 'TECH_022')).toBe(false);
  });

  it('flags an "Other" entry that duplicates a selected option', () => {
    const w = validateAnswers(answers({ TECH_004: ['vscode', 'other'], TECH_004_other: 'vscode' }));
    expect(w.some((x) => x.questionId === 'TECH_004_other')).toBe(true);
  });

  it('flags an invalid custom DLP regex', () => {
    const w = validateAnswers(answers({ REG_012b: 'MRN-(\\d{8}' })); // unterminated group
    expect(w.some((x) => x.questionId === 'REG_012b')).toBe(true);
    const ok = validateAnswers(answers({ REG_012b: 'MRN-\\d{8}' }));
    expect(ok.some((x) => x.questionId === 'REG_012b')).toBe(false);
  });

  it('flags under-spec local-model hardware', () => {
    const w = validateAnswers(answers({ TECH_014_other: 'Raspberry Pi, 2GB RAM' }));
    expect(w.some((x) => x.questionId === 'TECH_014_other')).toBe(true);
  });

  it('flags a purpose that reads as a different industry', () => {
    const w = validateAnswers(answers({ STRAT_002: 'ecommerce', STRAT_001: 'Patient claims adjudication for hospital payers' }));
    expect(w.some((x) => x.questionId === 'STRAT_002')).toBe(true);
    const ok = validateAnswers(answers({ STRAT_002: 'healthcare', STRAT_001: 'Patient claims adjudication for hospital payers' }));
    expect(ok.some((x) => x.questionId === 'STRAT_002')).toBe(false);
  });

  it('returns nothing for a clean answer set', () => {
    expect(validateAnswers(answers({ TECH_001: ['python'], TECH_003: 'FastAPI' }))).toHaveLength(0);
  });
});
