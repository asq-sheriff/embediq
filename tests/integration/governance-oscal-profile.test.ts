import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  readOscalProfile,
  resolveOscalProfile,
  oscalProfileToFramework,
  OscalLoadError,
} from '../../src/governance/oscal/index.js';
import { DomainPackRegistry } from '../../src/domain-packs/registry.js';

const LOW_PROFILE_PATH = resolve(
  __dirname,
  '../fixtures/oscal/nist-800-53-rev5-low-baseline-profile.json',
);
const IR_CATALOG_PATH = resolve(
  __dirname,
  '../fixtures/oscal/nist-800-53-rev5-ir-slice.json',
);
// The LOW profile imports the full 800-53 catalog via a back-matter
// resource UUID. We point the resolver at our IR slice instead — only
// 7 of the profile's 149 selected IDs match the slice, the other 142
// land in `missingControlIds`. That's the realistic operator scenario
// (a profile that targets a catalog you've only partially imported).
const LOW_PROFILE_CATALOG_UUID = '84cbf061-eb87-4ec1-8112-1f529232e907';
// IR controls included in the LOW baseline. Hard-coded so a NIST update
// that shifts these requires explicit acknowledgment.
const IR_CONTROLS_IN_LOW = ['ir-1', 'ir-2', 'ir-4', 'ir-5', 'ir-6', 'ir-7', 'ir-8'];

describe('readOscalProfile', () => {
  it('parses a real NIST 800-53 Rev 5 LOW baseline profile', async () => {
    const profile = await readOscalProfile(LOW_PROFILE_PATH);
    expect(profile.uuid).toBe('201765f8-6d45-4941-8789-9eef2effd7d0');
    expect(profile.metadata.title).toMatch(/LOW IMPACT BASELINE/);
    expect(profile.imports).toHaveLength(1);
    expect(profile.imports[0].href).toBe(`#${LOW_PROFILE_CATALOG_UUID}`);
    expect(profile.imports[0]['include-controls']?.[0]['with-ids']).toContain('ac-1');
    expect(profile.imports[0]['include-controls']?.[0]['with-ids']).toContain('ir-8');
  });

  it('rejects a profile without imports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'embediq-oscal-test-'));
    const path = join(dir, 'no-imports.json');
    await writeFile(path, JSON.stringify({
      profile: {
        uuid: 'abc',
        metadata: { title: 'x', 'last-modified': 'now', version: '1', 'oscal-version': '1.1.2' },
      },
    }), 'utf-8');
    try {
      await expect(readOscalProfile(path)).rejects.toThrow(/at least one import/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a document that has a catalog object instead of a profile', async () => {
    await expect(readOscalProfile(IR_CATALOG_PATH))
      .rejects.toThrow(/missing top-level `profile`/);
  });

  it('rejects a non-existent profile file', async () => {
    await expect(readOscalProfile('/tmp/embediq-no-such-profile.json'))
      .rejects.toThrow(OscalLoadError);
  });
});

describe('resolveOscalProfile against a partial catalog', () => {
  it('selects only the controls present in the catalog we point it at', async () => {
    const profile = await readOscalProfile(LOW_PROFILE_PATH);
    const resolved = await resolveOscalProfile(profile, {
      catalogPaths: { [LOW_PROFILE_CATALOG_UUID]: IR_CATALOG_PATH },
    });

    expect(resolved.profileUuid).toBe(profile.uuid);
    expect(resolved.profileTitle).toBe(profile.metadata.title);
    expect(resolved.imports).toHaveLength(1);

    const imp = resolved.imports[0];
    expect(imp.catalogPath).toBe(IR_CATALOG_PATH);
    // Exactly the 7 IR controls in the LOW baseline.
    expect(imp.selectedControlIds.sort()).toEqual([...IR_CONTROLS_IN_LOW].sort());
    // The other 142 (149 total - 7 IR) requested IDs are listed as missing
    // because the IR-only slice doesn't include AC, AU, AT, etc. controls.
    expect(imp.missingControlIds.length).toBe(142);
    // Spot-check a couple of expected missing IDs.
    expect(imp.missingControlIds).toContain('ac-1');
    expect(imp.missingControlIds).toContain('au-2');

    // Top-level selectedControlIds collapse to the same 7.
    expect(resolved.selectedControlIds.sort()).toEqual([...IR_CONTROLS_IN_LOW].sort());
  });

  it('also resolves catalogPaths keyed by the raw "#<uuid>" href form', async () => {
    const profile = await readOscalProfile(LOW_PROFILE_PATH);
    const resolved = await resolveOscalProfile(profile, {
      catalogPaths: { [`#${LOW_PROFILE_CATALOG_UUID}`]: IR_CATALOG_PATH },
    });
    expect(resolved.selectedControlIds).toHaveLength(IR_CONTROLS_IN_LOW.length);
  });

  it('throws OscalLoadError when no entry matches the import href', async () => {
    const profile = await readOscalProfile(LOW_PROFILE_PATH);
    await expect(resolveOscalProfile(profile, { catalogPaths: {} }))
      .rejects.toThrow(/Cannot resolve OSCAL profile import href/);
  });
});

describe('include-all + exclude-controls semantics', () => {
  async function buildProfile(
    importBody: Record<string, unknown>,
  ): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'embediq-oscal-test-'));
    const path = join(dir, 'profile.json');
    await writeFile(path, JSON.stringify({
      profile: {
        uuid: '11111111-2222-3333-4444-555555555555',
        metadata: {
          title: 'Test Tailored Baseline',
          'last-modified': '2026-05-25T00:00:00.000Z',
          version: '1.0.0',
          'oscal-version': '1.1.2',
        },
        imports: [
          { href: 'catalog-key', ...importBody },
        ],
      },
    }), 'utf-8');
    return path;
  }

  it('include-all selects every control in the catalog', async () => {
    const profilePath = await buildProfile({ 'include-all': {} });
    const profile = await readOscalProfile(profilePath);
    const resolved = await resolveOscalProfile(profile, {
      catalogPaths: { 'catalog-key': IR_CATALOG_PATH },
    });
    // The IR slice contains 42 controls (10 direct + 32 enhancements).
    expect(resolved.selectedControlIds).toHaveLength(42);
    expect(resolved.imports[0].missingControlIds).toEqual([]);
    await rm(profilePath, { recursive: true, force: true });
  });

  it('exclude-controls removes IDs from the include set', async () => {
    const profilePath = await buildProfile({
      'include-controls': [{ 'with-ids': ['ir-1', 'ir-2', 'ir-4'] }],
      'exclude-controls': [{ 'with-ids': ['ir-2'] }],
    });
    const profile = await readOscalProfile(profilePath);
    const resolved = await resolveOscalProfile(profile, {
      catalogPaths: { 'catalog-key': IR_CATALOG_PATH },
    });
    expect(resolved.selectedControlIds.sort()).toEqual(['ir-1', 'ir-4']);
    await rm(profilePath, { recursive: true, force: true });
  });

  it('omitting selection criteria entirely defaults to include-all per OSCAL convention', async () => {
    const profilePath = await buildProfile({});
    const profile = await readOscalProfile(profilePath);
    const resolved = await resolveOscalProfile(profile, {
      catalogPaths: { 'catalog-key': IR_CATALOG_PATH },
    });
    expect(resolved.selectedControlIds).toHaveLength(42);
    await rm(profilePath, { recursive: true, force: true });
  });
});

describe('oscalProfileToFramework', () => {
  it('produces a ComplianceFrameworkDef with selection counts in the description', async () => {
    const profile = await readOscalProfile(LOW_PROFILE_PATH);
    const resolved = await resolveOscalProfile(profile, {
      catalogPaths: { [LOW_PROFILE_CATALOG_UUID]: IR_CATALOG_PATH },
    });
    const framework = oscalProfileToFramework(profile, resolved, {
      keyOverride: 'nist-800-53-rev5-low',
      labelOverride: 'NIST SP 800-53 Rev 5 LOW Baseline (IR subset)',
    });
    expect(framework.key).toBe('nist-800-53-rev5-low');
    expect(framework.label).toBe('NIST SP 800-53 Rev 5 LOW Baseline (IR subset)');
    expect(framework.description).toContain('LOW IMPACT BASELINE');
    expect(framework.description).toContain('selecting 7 controls');
    expect(framework.description).toContain('142 requested but absent from catalog');
  });
});

describe('DomainPackRegistry.loadFromOscalProfile end-to-end', () => {
  it('registers a profile-derived DomainPack with the tailored framework', async () => {
    const registry = new DomainPackRegistry();
    const pack = await registry.loadFromOscalProfile(
      LOW_PROFILE_PATH,
      {
        catalogPaths: { [LOW_PROFILE_CATALOG_UUID]: IR_CATALOG_PATH },
        keyOverride: 'nist-800-53-rev5-low',
        labelOverride: 'NIST SP 800-53 Rev 5 LOW',
      },
      {
        id: 'fedramp-style-low',
        name: 'FedRAMP-style LOW Baseline',
        version: '5.2.0',
      },
    );

    expect(registry.getById('fedramp-style-low')).toBe(pack);
    expect(pack.complianceFrameworks).toHaveLength(1);
    expect(pack.complianceFrameworks[0].key).toBe('nist-800-53-rev5-low');
    expect(pack.complianceFrameworks[0].description).toContain('selecting 7 controls');
  });

  it('does not register the pack when the catalog cannot be resolved', async () => {
    const registry = new DomainPackRegistry();
    await expect(registry.loadFromOscalProfile(
      LOW_PROFILE_PATH,
      { catalogPaths: {} },
      { id: 'should-not-register', name: 'x', version: '1.0.0' },
    )).rejects.toThrow(OscalLoadError);
    expect(registry.getById('should-not-register')).toBeUndefined();
  });
});
