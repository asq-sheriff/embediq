import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadTemplates } from '../../src/bank/profile-templates.js';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(process.cwd(), 'tests', '.tmp-templates-test');

describe('loadTemplates', () => {
  describe('from default templates/ directory', () => {
    it('loads the 3 shipped templates', () => {
      const templates = loadTemplates();
      expect(templates.length).toBe(3);
    });

    it('each template has required fields', () => {
      for (const t of loadTemplates()) {
        expect(t.id).toBeTruthy();
        expect(t.name).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.version).toBeTruthy();
        expect(t.prefilledAnswers).toBeDefined();
        expect(t.lockedQuestions).toBeDefined();
      }
    });

    it('HIPAA template pre-fills REG_001 as true', () => {
      const hipaa = loadTemplates().find(t => t.id === 'hipaa-healthcare');
      expect(hipaa).toBeDefined();
      expect(hipaa!.prefilledAnswers.REG_001.value).toBe(true);
    });

    it('HIPAA template locks REG_001 and REG_002', () => {
      const hipaa = loadTemplates().find(t => t.id === 'hipaa-healthcare');
      expect(hipaa!.lockedQuestions).toContain('REG_001');
      expect(hipaa!.lockedQuestions).toContain('REG_002');
    });

    it('PCI template pre-fills industry as finance', () => {
      const pci = loadTemplates().find(t => t.id === 'pci-finance');
      expect(pci!.prefilledAnswers.STRAT_002.value).toBe('finance');
    });

    it('SOC2 template pre-fills soc2 compliance', () => {
      const soc2 = loadTemplates().find(t => t.id === 'soc2-saas');
      expect(soc2!.prefilledAnswers.REG_002.value).toContain('soc2');
    });

    it('returns templates sorted by name', () => {
      const templates = loadTemplates();
      for (let i = 1; i < templates.length; i++) {
        expect(templates[i].name.localeCompare(templates[i - 1].name)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('from custom directory', () => {
    beforeEach(() => {
      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
      mkdirSync(TEST_DIR, { recursive: true });
      process.env.EMBEDIQ_TEMPLATES_DIR = TEST_DIR;
    });

    afterEach(() => {
      delete process.env.EMBEDIQ_TEMPLATES_DIR;
      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    });

    it('returns empty array when directory has no YAML files', () => {
      expect(loadTemplates()).toEqual([]);
    });

    it('loads custom YAML templates', () => {
      writeFileSync(join(TEST_DIR, 'custom.yaml'), `
id: custom-test
name: Custom Test
description: A test template
version: "1.0.0"
prefilledAnswers:
  STRAT_002:
    value: saas
lockedQuestions: []
forcedQuestions: []
`);
      const templates = loadTemplates();
      expect(templates).toHaveLength(1);
      expect(templates[0].id).toBe('custom-test');
    });
  });

  describe('missing directory', () => {
    it('returns empty array when templates directory does not exist', () => {
      process.env.EMBEDIQ_TEMPLATES_DIR = '/nonexistent/path';
      expect(loadTemplates()).toEqual([]);
      delete process.env.EMBEDIQ_TEMPLATES_DIR;
    });
  });
});
