import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { HooksGenerator } from '../../src/synthesizer/generators/hooks.js';
import { healthcarePack } from '../../src/domain-packs/built-in/healthcare.js';
import { createEmptyProfile, type GenerationContext, type UserProfile } from '../../src/types/index.js';

/**
 * Enforcement proof — the deterministic complement to the egress-eligibility gate.
 *
 * The eval showed a capable agent is usually careful; this shows why that isn't
 * the control. The generated PreToolUse DLP hook REFUSES a PHI-bearing write at
 * the source — exit 2 = BLOCK — regardless of whether the model would have been
 * careful. "Usually careful" is not a compliance posture; "the control refuses,
 * provably" is, and this test is the proof, run against the ACTUAL generated hook.
 */

const hasPython = spawnSync('python3', ['--version']).status === 0;

function generatedDlpScanner(): string {
  const profile: UserProfile = {
    ...createEmptyProfile(),
    industry: 'healthcare',
    complianceFrameworks: ['hipaa'],
    securityConcerns: ['phi'],
  };
  const ctx: GenerationContext = { profile, domainPack: healthcarePack };
  const scanner = new HooksGenerator().generate(ctx).find((f) => f.relativePath.endsWith('dlp-scanner.py'));
  if (!scanner) throw new Error('dlp-scanner.py was not generated for a PHI profile');
  return scanner.content;
}

/** Run the generated hook against a PreToolUse-shaped payload; return its exit code. */
function runHook(script: string, toolInput: Record<string, unknown>): number {
  const payload = JSON.stringify({ tool_name: 'Write', tool_input: toolInput });
  return spawnSync('python3', ['-c', script], { input: payload }).status ?? -1;
}

describe.skipIf(!hasPython)('generated DLP hook — the control refuses, provably', () => {
  const script = generatedDlpScanner();
  const write = (content: string) => runHook(script, { file_path: 'note.txt', content });

  it('BLOCKS (exit 2) a write whose content contains an MRN', () => {
    expect(write('Patient MRN: 33910275 — follow-up scheduled.')).toBe(2);
  });

  it('BLOCKS (exit 2) a Social Security Number and a credit-card number', () => {
    expect(write('ssn 123-45-6789 on file')).toBe(2);
    expect(write('card 4111111111111111 declined')).toBe(2);
  });

  it('WARNS (exit 1), not blocks, on a HIGH-severity domain pattern (FHIR Patient ref)', () => {
    // healthcare pack FHIR Patient Resource ID is severity HIGH → warn, not block.
    expect(write('see resource Patient/abc-123 for details')).toBe(1);
  });

  it('PASSES (exit 0) a clean write with no sensitive data', () => {
    expect(write('export const slugify = (s) => s.toLowerCase();')).toBe(0);
  });

  it('the refusal is a property of the config, not the model — same input, deterministic', () => {
    const first = write('Patient MRN: 33910275');
    const second = write('Patient MRN: 33910275');
    expect(first).toBe(2);
    expect(second).toBe(2); // no probabilities, no "usually" — it blocks every time
  });
});
