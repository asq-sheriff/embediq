import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Count guard: the documented "33 generators" claim (README, CLAUDE.md,
 * ARCHITECTURE, VISION, synthesizer.md, the web UI, …) has no other automated
 * check. Each file under generators/ is exactly one generator (the four
 * governance generators are functions, each in its own file; SETUP.md likewise).
 *
 * If you add or remove a generator, update this number AND the doc strings in
 * the same change — this test is the tripwire that makes the docs drift visible.
 */
const GENERATOR_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/synthesizer/generators');
const EXPECTED_GENERATORS = 33;

describe('synthesizer generator roster', () => {
  it(`has exactly ${EXPECTED_GENERATORS} generators — keep docs in sync`, () => {
    const files = readdirSync(GENERATOR_DIR).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'),
    );
    expect(files).toHaveLength(EXPECTED_GENERATORS);
  });
});
