import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  readOscalCatalog,
  oscalCatalogToFramework,
  flattenControls,
  slugifyTitle,
  OscalLoadError,
} from '../../src/governance/oscal/index.js';

const FIXTURE_PATH = resolve(__dirname, '../fixtures/oscal/sample-catalog.json');

describe('readOscalCatalog', () => {
  it('parses a well-formed OSCAL catalog and returns the inner catalog object', async () => {
    const catalog = await readOscalCatalog(FIXTURE_PATH);
    expect(catalog.uuid).toBe('613fca2d-704a-42e7-8e2b-b206d3e3c45b');
    expect(catalog.metadata.title).toBe('Sample Test Catalog');
    expect(catalog.metadata.version).toBe('Rev 1');
    expect(catalog.metadata['oscal-version']).toBe('1.1.2');
    expect(catalog.groups).toHaveLength(2);
    expect(catalog.controls).toHaveLength(1);
  });

  it('throws OscalLoadError when the file does not exist', async () => {
    await expect(readOscalCatalog('/tmp/embediq-no-such-oscal.json'))
      .rejects.toThrow(OscalLoadError);
  });

  it('throws OscalLoadError on malformed JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'embediq-oscal-test-'));
    const path = join(dir, 'bad.json');
    await writeFile(path, '{ not valid json', 'utf-8');
    try {
      await expect(readOscalCatalog(path)).rejects.toThrow(/Malformed JSON/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a document without a top-level `catalog` object', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'embediq-oscal-test-'));
    const path = join(dir, 'wrong-shape.json');
    await writeFile(path, JSON.stringify({ profile: {} }), 'utf-8');
    try {
      await expect(readOscalCatalog(path)).rejects.toThrow(/missing top-level `catalog`/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a catalog missing its uuid', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'embediq-oscal-test-'));
    const path = join(dir, 'no-uuid.json');
    await writeFile(path, JSON.stringify({
      catalog: { metadata: { title: 'x', 'last-modified': 'now', version: '1', 'oscal-version': '1.1.2' } },
    }), 'utf-8');
    try {
      await expect(readOscalCatalog(path)).rejects.toThrow(/missing required `uuid`/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a catalog missing metadata.title', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'embediq-oscal-test-'));
    const path = join(dir, 'no-title.json');
    await writeFile(path, JSON.stringify({
      catalog: { uuid: 'abc', metadata: { 'last-modified': 'now', version: '1', 'oscal-version': '1.1.2' } },
    }), 'utf-8');
    try {
      await expect(readOscalCatalog(path)).rejects.toThrow(/missing required `metadata.title`/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('flattenControls', () => {
  it('walks both group-nested controls and top-level catalog controls', async () => {
    const catalog = await readOscalCatalog(FIXTURE_PATH);
    const flat = flattenControls(catalog);
    const ids = flat.map((c) => c.id).sort();
    expect(ids).toEqual(['ac-1', 'ac-1.1', 'ac-2', 'au-1', 'au-2', 'ungrouped-1']);
  });

  it('captures the top-level family id/title and inherits it through nested groups', async () => {
    const catalog = await readOscalCatalog(FIXTURE_PATH);
    const flat = flattenControls(catalog);
    const byId = new Map(flat.map((c) => [c.id, c]));

    expect(byId.get('ac-1')!.familyId).toBe('ac');
    expect(byId.get('ac-1')!.familyTitle).toBe('Access Control');

    // Control enhancement inherits the family of its parent control.
    expect(byId.get('ac-1.1')!.familyId).toBe('ac');
    expect(byId.get('ac-1.1')!.familyTitle).toBe('Access Control');

    // Nested group (Audit Records) inherits the parent family (Audit and Accountability).
    expect(byId.get('au-2')!.familyId).toBe('au');
    expect(byId.get('au-2')!.familyTitle).toBe('Audit and Accountability');

    // A control declared at the top level (outside any group) has no family.
    expect(byId.get('ungrouped-1')!.familyId).toBeUndefined();
    expect(byId.get('ungrouped-1')!.familyTitle).toBeUndefined();
  });

  it('marks controls whose props include status=withdrawn', async () => {
    const catalog = await readOscalCatalog(FIXTURE_PATH);
    const flat = flattenControls(catalog);
    const ac1_1 = flat.find((c) => c.id === 'ac-1.1');
    expect(ac1_1?.withdrawn).toBe(true);
    const ac1 = flat.find((c) => c.id === 'ac-1');
    expect(ac1?.withdrawn).toBe(false);
  });

  it('records parentId for control enhancements', async () => {
    const catalog = await readOscalCatalog(FIXTURE_PATH);
    const flat = flattenControls(catalog);
    expect(flat.find((c) => c.id === 'ac-1.1')?.parentId).toBe('ac-1');
    expect(flat.find((c) => c.id === 'ac-1')?.parentId).toBeUndefined();
  });
});

describe('oscalCatalogToFramework', () => {
  it('maps an OSCAL catalog to a single ComplianceFrameworkDef', async () => {
    const catalog = await readOscalCatalog(FIXTURE_PATH);
    const framework = oscalCatalogToFramework(catalog);
    expect(framework.key).toBe('sample-test-catalog');
    expect(framework.label).toBe('Sample Test Catalog');
    expect(framework.description).toContain('Rev 1');
    expect(framework.description).toContain('1.1.2');
    expect(framework.description).toContain('2 control families');
    // 5 active controls (ac-1, ac-2, au-1, au-2, ungrouped-1), 1 withdrawn (ac-1.1).
    expect(framework.description).toContain('5 active controls');
    expect(framework.description).toContain('1 withdrawn');
  });

  it('honors keyOverride and labelOverride', async () => {
    const catalog = await readOscalCatalog(FIXTURE_PATH);
    const framework = oscalCatalogToFramework(catalog, {
      keyOverride: 'nist-800-53-rev5',
      labelOverride: 'NIST SP 800-53 Rev 5',
    });
    expect(framework.key).toBe('nist-800-53-rev5');
    expect(framework.label).toBe('NIST SP 800-53 Rev 5');
    // Description still references the catalog's actual metadata
    // (override is for identity only — description stays factual).
    expect(framework.description).toContain('Sample Test Catalog');
  });
});

describe('slugifyTitle', () => {
  it('lowercases, hyphenates, and trims edge separators', () => {
    expect(slugifyTitle('NIST Special Publication 800-53 Revision 5 Catalog'))
      .toBe('nist-special-publication-800-53-revision-5-catalog');
    expect(slugifyTitle('  HIPAA  ')).toBe('hipaa');
    expect(slugifyTitle('Foo / Bar — Baz')).toBe('foo-bar-baz');
  });
});
