import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DomainPackRegistry } from '../../src/domain-packs/registry.js';
import { OscalLoadError } from '../../src/governance/oscal/index.js';
import type { DomainPack } from '../../src/domain-packs/index.js';

const FIXTURE_PATH = resolve(__dirname, '../fixtures/oscal/sample-catalog.json');

describe('DomainPackRegistry.loadFromOscalCatalog', () => {
  let registry: DomainPackRegistry;

  beforeEach(() => {
    registry = new DomainPackRegistry();
  });

  it('imports an OSCAL catalog into a minimal DomainPack', async () => {
    const pack = await registry.loadFromOscalCatalog(FIXTURE_PATH, {
      id: 'oscal-sample',
      name: 'OSCAL Sample',
      version: '1.0.0',
    });

    expect(pack.id).toBe('oscal-sample');
    expect(pack.name).toBe('OSCAL Sample');
    expect(pack.complianceFrameworks).toHaveLength(1);
    expect(pack.complianceFrameworks[0].label).toBe('Sample Test Catalog');
    // Description falls back to the framework's description when not
    // supplied — gives the operator the OSCAL provenance for free.
    expect(pack.description).toContain('OSCAL');
    // The non-compliance payload is empty — operators compose with
    // industry packs for DLP/rules/questions.
    expect(pack.questions).toEqual([]);
    expect(pack.dlpPatterns).toEqual([]);
    expect(pack.ruleTemplates).toEqual([]);
    expect(pack.ignorePatterns).toEqual([]);
    expect(pack.validationChecks).toEqual([]);
  });

  it('honors keyOverride + labelOverride so multiple OSCAL imports stay distinct', async () => {
    const pack = await registry.loadFromOscalCatalog(
      FIXTURE_PATH,
      { id: 'fedramp-moderate', name: 'FedRAMP Moderate', version: '1.0.0' },
      { keyOverride: 'fedramp-moderate', labelOverride: 'FedRAMP Moderate' },
    );
    expect(pack.complianceFrameworks[0].key).toBe('fedramp-moderate');
    expect(pack.complianceFrameworks[0].label).toBe('FedRAMP Moderate');
  });

  it('registers the imported pack under its declared id', async () => {
    await registry.loadFromOscalCatalog(FIXTURE_PATH, {
      id: 'oscal-sample',
      name: 'OSCAL Sample',
      version: '1.0.0',
    });
    expect(registry.getById('oscal-sample')?.complianceFrameworks[0].label)
      .toBe('Sample Test Catalog');
    expect(registry.getAll()).toHaveLength(1);
  });

  it('throws OscalLoadError when the catalog file is missing — and does not register', async () => {
    await expect(registry.loadFromOscalCatalog(
      '/tmp/embediq-no-such-catalog.json',
      { id: 'should-not-register', name: 'x', version: '1.0.0' },
    )).rejects.toThrow(OscalLoadError);
    expect(registry.getById('should-not-register')).toBeUndefined();
  });

  it('throws OscalLoadError when the catalog JSON is malformed — and does not register', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'embediq-oscal-test-'));
    const path = join(dir, 'broken.json');
    await writeFile(path, '{ this is not json', 'utf-8');
    try {
      await expect(registry.loadFromOscalCatalog(path, {
        id: 'broken-pack',
        name: 'x',
        version: '1.0.0',
      })).rejects.toThrow(OscalLoadError);
      expect(registry.getById('broken-pack')).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('co-exists with skill-composed and built-in packs (independent register paths)', async () => {
    const oscalPack = await registry.loadFromOscalCatalog(FIXTURE_PATH, {
      id: 'oscal-sample',
      name: 'OSCAL Sample',
      version: '1.0.0',
    });
    expect(registry.getAll()).toContain(oscalPack);
    // Verify a hand-registered DomainPack still works alongside the OSCAL one.
    registry.register({
      id: 'manual-pack',
      name: 'Manual',
      version: '1.0.0',
      description: 'hand-coded',
      questions: [],
      complianceFrameworks: [],
      priorityCategories: {},
      dlpPatterns: [],
      ruleTemplates: [],
      ignorePatterns: [],
      validationChecks: [],
    });
    expect(registry.getAll()).toHaveLength(2);
  });
});

describe('DomainPackRegistry.composeFromPacks', () => {
  let registry: DomainPackRegistry;

  /** A reasonably realistic stand-in for an industry pack — carries DLP,
   *  rules, and frameworks of its own so composition with an OSCAL pack
   *  produces an output that combines both surfaces. */
  function industryPack(overrides: Partial<DomainPack> = {}): DomainPack {
    return {
      id: 'industry-test',
      name: 'Industry Test',
      version: '1.0.0',
      description: 'industry-specific bundle',
      questions: [],
      complianceFrameworks: [
        { key: 'hipaa', label: 'HIPAA', description: 'Health Insurance Portability and Accountability Act' },
      ],
      priorityCategories: { security: ['phi', 'hipaa'] },
      dlpPatterns: [
        { name: 'mrn', pattern: '\\d{8}', severity: 'CRITICAL', description: 'Medical record number' },
      ],
      ruleTemplates: [
        { filename: 'hipaa-rules.md', pathScope: [], content: '# HIPAA' },
      ],
      ignorePatterns: ['.phi/'],
      validationChecks: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    registry = new DomainPackRegistry();
  });

  it('returns undefined when any of the requested pack IDs is unknown', () => {
    registry.register(industryPack({ id: 'industry' }));
    const composed = registry.composeFromPacks(
      ['industry', 'nonexistent'],
      { id: 'combo', name: 'Combo', version: '1.0.0', description: '' },
    );
    expect(composed).toBeUndefined();
  });

  it('composes an OSCAL pack with an industry pack into a single DomainPack', async () => {
    await registry.loadFromOscalCatalog(FIXTURE_PATH, {
      id: 'oscal-sample',
      name: 'OSCAL Sample',
      version: '1.0.0',
    });
    registry.register(industryPack({ id: 'industry' }));

    const composed = registry.composeFromPacks(
      ['oscal-sample', 'industry'],
      {
        id: 'oscal-controlled-healthcare',
        name: 'OSCAL-controlled Healthcare',
        version: '1.0.0',
        description: 'NIST control identity + HIPAA-specific DLP/rules',
      },
    );

    expect(composed).toBeDefined();
    expect(composed!.id).toBe('oscal-controlled-healthcare');

    // Both frameworks land — OSCAL's catalog identity + HIPAA from industry.
    const frameworkKeys = composed!.complianceFrameworks.map((f) => f.key);
    expect(frameworkKeys).toContain('sample-test-catalog');
    expect(frameworkKeys).toContain('hipaa');

    // Industry-specific payload comes through.
    expect(composed!.dlpPatterns.map((d) => d.name)).toEqual(['mrn']);
    expect(composed!.ruleTemplates.map((r) => r.filename)).toEqual(['hipaa-rules.md']);
    expect(composed!.ignorePatterns).toContain('.phi/');
    expect(composed!.priorityCategories.security).toContain('phi');
  });

  it('honors composition order (first-pack wins on key collisions)', () => {
    registry.register(industryPack({
      id: 'first',
      complianceFrameworks: [{ key: 'hipaa', label: 'HIPAA (first)', description: 'a' }],
    }));
    registry.register(industryPack({
      id: 'second',
      complianceFrameworks: [{ key: 'hipaa', label: 'HIPAA (second)', description: 'b' }],
      dlpPatterns: [
        { name: 'icd10', pattern: '[A-Z]\\d{2}', severity: 'HIGH', description: 'ICD-10 code' },
      ],
    }));

    const composed = registry.composeFromPacks(
      ['first', 'second'],
      { id: 'combo', name: 'Combo', version: '1.0.0', description: '' },
    );
    expect(composed!.complianceFrameworks).toHaveLength(1);
    expect(composed!.complianceFrameworks[0].label).toBe('HIPAA (first)');
    // Non-colliding DLP from "second" still lands.
    expect(composed!.dlpPatterns.map((d) => d.name)).toEqual(['mrn', 'icd10']);
  });

  it('does not register the composed pack — composeFromPacks is functional, not stateful', () => {
    registry.register(industryPack({ id: 'industry' }));
    const composed = registry.composeFromPacks(
      ['industry'],
      { id: 'composed', name: 'Composed', version: '1.0.0', description: '' },
    );
    expect(composed).toBeDefined();
    expect(registry.getById('composed')).toBeUndefined();
    expect(registry.getAll()).toHaveLength(1);  // only the original
  });
});
