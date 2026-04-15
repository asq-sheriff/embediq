import type { Answer, SetupConfig, UserProfile } from '../../src/types/index.js';
import { createEmptyProfile } from '../../src/types/index.js';

export function createAnswer(
  questionId: string,
  value: string | string[] | number | boolean,
): Answer {
  return { questionId, value, timestamp: new Date('2026-01-01T00:00:00Z') };
}

export function buildAnswerMap(
  entries: Array<[string, string | string[] | number | boolean]>,
): Map<string, Answer> {
  const map = new Map<string, Answer>();
  for (const [id, value] of entries) {
    map.set(id, createAnswer(id, value));
  }
  return map;
}

export function createConfig(overrides: Partial<UserProfile> = {}): SetupConfig {
  const profile: UserProfile = {
    ...createEmptyProfile(),
    ...overrides,
    answers: overrides.answers ?? new Map(),
  };
  return { profile, targetDir: '/tmp/embediq-test-output' };
}

/** Minimal developer answer set that produces a valid profile. */
export const MINIMAL_DEVELOPER_ANSWERS: Array<[string, string | string[] | number | boolean]> = [
  ['STRAT_000', 'developer'],
  ['STRAT_000a', 'intermediate'],
  ['STRAT_001', 'Web application'],
  ['STRAT_002', 'saas'],
  ['OPS_001', 'solo'],
  ['TECH_001', ['typescript']],
  ['FIN_001', 'moderate'],
  ['REG_001', false],
];

/** Healthcare developer answer set with HIPAA compliance. */
export const HEALTHCARE_DEVELOPER_ANSWERS: Array<[string, string | string[] | number | boolean]> = [
  ['STRAT_000', 'developer'],
  ['STRAT_000a', 'advanced'],
  ['STRAT_001', 'Patient portal'],
  ['STRAT_002', 'healthcare'],
  ['OPS_001', 'medium'],
  ['TECH_001', ['typescript', 'python']],
  ['TECH_004', ['vscode']],
  ['TECH_005', ['npm']],
  ['TECH_007', 'github_actions'],
  ['FIN_001', 'enterprise'],
  ['REG_001', true],
  ['REG_002', ['hipaa']],
  ['REG_003', true],
  ['REG_004', true],
  ['REG_005', true],
  ['REG_008', 'strict'],
  ['REG_012', true],
  ['REG_014', true],
];

/** Non-technical PM answer set. */
export const PM_ANSWERS: Array<[string, string | string[] | number | boolean]> = [
  ['STRAT_000', 'pm'],
  ['STRAT_000a', 'non_technical'],
  ['STRAT_001', 'SaaS Platform'],
  ['STRAT_002', 'saas'],
  ['OPS_001', 'large'],
  ['TECH_001', ['typescript']],
  ['FIN_001', 'enterprise'],
  ['REG_001', false],
];
