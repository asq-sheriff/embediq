import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  readOscalCatalog,
  oscalCatalogToFramework,
  flattenControls,
} from '../../src/governance/oscal/index.js';
import { DomainPackRegistry } from '../../src/domain-packs/registry.js';

/**
 * Round-trip tests against a real NIST SP 800-53 Rev 5 slice (IR family).
 * Proves the loader handles real-world OSCAL data — kebab-case JSON
 * fields, real prop/part/parameter shapes, real withdrawn markers,
 * real control-enhancement nesting — not just the hand-crafted fixture.
 *
 * Source provenance + slicing methodology documented in
 * `tests/fixtures/oscal/README.md`.
 */

const NIST_IR_SLICE = resolve(__dirname, '../fixtures/oscal/nist-800-53-rev5-ir-slice.json');

describe('OSCAL real-catalog round-trip — NIST 800-53 Rev 5 IR slice', () => {
  it('parses the slice and surfaces NIST catalog identity verbatim', async () => {
    const catalog = await readOscalCatalog(NIST_IR_SLICE);
    // NIST publishes a stable uuid for the 800-53 Rev 5 catalog — preserved verbatim.
    expect(catalog.uuid).toBe('ea7c7688-79c5-463b-a91b-0650f2d98623');
    expect(catalog.metadata.title).toMatch(/NIST SP 800-53/);
    expect(catalog.metadata.title).toMatch(/Rev 5/);
    expect(catalog.metadata['oscal-version']).toMatch(/^1\.[12]\./);
    expect(catalog.metadata.version).toBeTruthy();
    expect(catalog.metadata['last-modified']).toBeTruthy();
  });

  it('contains exactly the IR family (slicing preserved the structure intact)', async () => {
    const catalog = await readOscalCatalog(NIST_IR_SLICE);
    expect(catalog.groups).toHaveLength(1);
    const ir = catalog.groups![0]!;
    expect(ir.id).toBe('ir');
    expect(ir.title).toBe('Incident Response');
    // IR has exactly 10 top-level controls in current NIST publishing
    // (ir-1 through ir-10). If NIST adds/removes IR controls, refresh
    // the slice and update this count — see fixtures/oscal/README.md.
    expect(ir.controls).toHaveLength(10);
  });

  it('preserves every top-level IR control id (ir-1 … ir-10)', async () => {
    const catalog = await readOscalCatalog(NIST_IR_SLICE);
    const ir = catalog.groups![0]!;
    const ids = ir.controls!.map((c) => c.id).sort();
    // ir-10 sorts before ir-2 lexicographically — handle by parsing.
    const numericIds = ids.map((id) => Number.parseInt(id.replace('ir-', ''), 10)).sort((a, b) => a - b);
    expect(numericIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('flattens to 42 controls total (10 direct + 32 enhancements)', async () => {
    const catalog = await readOscalCatalog(NIST_IR_SLICE);
    const flat = flattenControls(catalog);
    expect(flat).toHaveLength(42);
    // Every entry must have IR as its family.
    for (const c of flat) {
      expect(c.familyId).toBe('ir');
      expect(c.familyTitle).toBe('Incident Response');
    }
  });

  it('detects withdrawn controls from real NIST status props (including top-level)', async () => {
    const catalog = await readOscalCatalog(NIST_IR_SLICE);
    const flat = flattenControls(catalog);
    const withdrawn = flat.filter((c) => c.withdrawn);
    // NIST currently marks 2 IR entries as withdrawn:
    //   - ir-9.1 (enhancement of ir-9, "Responsible Personnel")
    //   - ir-10  (top-level, "Integrated Information Security Analysis Team")
    // The mix of enhancement + top-level proves the loader doesn't
    // wrongly assume withdrawn entries are always enhancements.
    // If NIST withdraws/restores entries, refresh the slice + update.
    expect(withdrawn.length).toBe(2);
    const withdrawnIds = withdrawn.map((c) => c.id).sort();
    expect(withdrawnIds).toEqual(['ir-10', 'ir-9.1']);
    const ir9_1 = withdrawn.find((c) => c.id === 'ir-9.1');
    expect(ir9_1!.parentId).toBe('ir-9');
    const ir10 = withdrawn.find((c) => c.id === 'ir-10');
    expect(ir10!.parentId).toBeUndefined();
  });

  it('captures parentId for real-world control enhancements', async () => {
    const catalog = await readOscalCatalog(NIST_IR_SLICE);
    const flat = flattenControls(catalog);
    const enhancements = flat.filter((c) => c.parentId !== undefined);
    // 32 enhancements total in the slice (42 - 10 direct).
    expect(enhancements).toHaveLength(32);
    // Every enhancement must have its parent in the same family + parent must be a direct control.
    const ids = new Set(flat.map((c) => c.id));
    for (const e of enhancements) {
      expect(ids.has(e.parentId!)).toBe(true);
      // ir-8.1's parent is ir-8, ir-4.13's parent is ir-4, etc.
      expect(e.parentId).toMatch(/^ir-\d+$|^ir-\d+\.\d+$/);
      expect(e.id.startsWith(e.parentId!)).toBe(true);
    }
  });

  it('spot-check: ir-8 ("Incident Response Plan") exists with at least one enhancement', async () => {
    const catalog = await readOscalCatalog(NIST_IR_SLICE);
    const flat = flattenControls(catalog);
    const ir8 = flat.find((c) => c.id === 'ir-8');
    expect(ir8).toBeDefined();
    expect(ir8!.title).toBe('Incident Response Plan');
    expect(ir8!.parentId).toBeUndefined();
    expect(ir8!.familyTitle).toBe('Incident Response');
    // ir-8.1 (Breaches) is a known enhancement.
    const ir8_1 = flat.find((c) => c.id === 'ir-8.1');
    expect(ir8_1).toBeDefined();
    expect(ir8_1!.parentId).toBe('ir-8');
  });

  it('maps the slice to a ComplianceFrameworkDef with real-world numbers', async () => {
    const catalog = await readOscalCatalog(NIST_IR_SLICE);
    const framework = oscalCatalogToFramework(catalog, {
      keyOverride: 'nist-800-53-rev5-ir',
      labelOverride: 'NIST SP 800-53 Rev 5 — Incident Response',
    });
    expect(framework.key).toBe('nist-800-53-rev5-ir');
    expect(framework.label).toBe('NIST SP 800-53 Rev 5 — Incident Response');
    expect(framework.description).toContain('NIST SP 800-53');
    // Active = 42 - 2 withdrawn = 40.
    expect(framework.description).toContain('40 active controls');
    expect(framework.description).toContain('2 withdrawn');
    expect(framework.description).toContain('1 control families');
  });

  it('registers as a DomainPack via DomainPackRegistry.loadFromOscalCatalog', async () => {
    const registry = new DomainPackRegistry();
    const pack = await registry.loadFromOscalCatalog(NIST_IR_SLICE, {
      id: 'nist-800-53-rev5-ir',
      name: 'NIST SP 800-53 Rev 5 — Incident Response',
      version: '5.2.0',
    });
    expect(pack.id).toBe('nist-800-53-rev5-ir');
    expect(pack.complianceFrameworks).toHaveLength(1);
    expect(pack.complianceFrameworks[0].label).toMatch(/NIST SP 800-53.*Rev 5/);
    expect(registry.getById('nist-800-53-rev5-ir')).toBe(pack);
  });
});
