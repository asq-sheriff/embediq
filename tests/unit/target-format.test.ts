import { describe, it, expect } from 'vitest';
import {
  TargetFormat,
  DEFAULT_TARGETS,
  ALL_TARGETS,
  InvalidTargetError,
  parseTargets,
  parseTargetsFromEnv,
} from '../../src/synthesizer/target-format.js';

describe('parseTargets', () => {
  it('returns the default when given undefined or null', () => {
    expect(parseTargets(undefined)).toEqual([...DEFAULT_TARGETS]);
    expect(parseTargets(null)).toEqual([...DEFAULT_TARGETS]);
  });

  it('returns the default when given an empty string', () => {
    expect(parseTargets('')).toEqual([...DEFAULT_TARGETS]);
    expect(parseTargets('   ')).toEqual([...DEFAULT_TARGETS]);
  });

  it('parses a single target', () => {
    expect(parseTargets('claude')).toEqual([TargetFormat.CLAUDE]);
    expect(parseTargets('cursor')).toEqual([TargetFormat.CURSOR]);
  });

  it('parses comma-separated targets and preserves order', () => {
    expect(parseTargets('claude,cursor,agents-md')).toEqual([
      TargetFormat.CLAUDE,
      TargetFormat.CURSOR,
      TargetFormat.AGENTS_MD,
    ]);
  });

  it('trims whitespace and is case-insensitive', () => {
    expect(parseTargets(' CURSOR ,  agents-md  ')).toEqual([
      TargetFormat.CURSOR,
      TargetFormat.AGENTS_MD,
    ]);
  });

  it('accepts whitespace-separated tokens in addition to commas', () => {
    expect(parseTargets('claude cursor')).toEqual([
      TargetFormat.CLAUDE,
      TargetFormat.CURSOR,
    ]);
  });

  it('expands "all" to every known target', () => {
    expect(parseTargets('all')).toEqual([...ALL_TARGETS]);
  });

  it('dedupes repeated targets', () => {
    expect(parseTargets('claude,cursor,claude,cursor')).toEqual([
      TargetFormat.CLAUDE,
      TargetFormat.CURSOR,
    ]);
  });

  it('accepts an array input', () => {
    expect(parseTargets(['claude', 'cursor,gemini'])).toEqual([
      TargetFormat.CLAUDE,
      TargetFormat.CURSOR,
      TargetFormat.GEMINI,
    ]);
  });

  it('throws InvalidTargetError for unknown tokens', () => {
    expect(() => parseTargets('bogus')).toThrow(InvalidTargetError);
    expect(() => parseTargets('claude,bogus')).toThrow(InvalidTargetError);
  });
});

describe('parseTargetsFromEnv', () => {
  it('returns the default when EMBEDIQ_OUTPUT_TARGETS is unset', () => {
    expect(parseTargetsFromEnv({})).toEqual([...DEFAULT_TARGETS]);
  });

  it('parses the env var when set', () => {
    expect(parseTargetsFromEnv({ EMBEDIQ_OUTPUT_TARGETS: 'cursor,copilot' })).toEqual([
      TargetFormat.CURSOR,
      TargetFormat.COPILOT,
    ]);
  });

  it('treats an empty env var as the default', () => {
    expect(parseTargetsFromEnv({ EMBEDIQ_OUTPUT_TARGETS: '' })).toEqual([...DEFAULT_TARGETS]);
  });
});
