import { describe, it, expect } from 'vitest';
import { ProfileBuilder } from '../../src/engine/profile-builder.js';
import { buildAnswerMap, MINIMAL_DEVELOPER_ANSWERS, HEALTHCARE_DEVELOPER_ANSWERS, PM_ANSWERS } from '../helpers/test-utils.js';

const builder = new ProfileBuilder();

describe('ProfileBuilder', () => {
  describe('minimal developer profile', () => {
    const profile = builder.build(buildAnswerMap(MINIMAL_DEVELOPER_ANSWERS));

    it('sets role from STRAT_000', () => {
      expect(profile.role).toBe('developer');
    });

    it('sets technical proficiency from STRAT_000a', () => {
      expect(profile.technicalProficiency).toBe('intermediate');
    });

    it('sets business domain from STRAT_001', () => {
      expect(profile.businessDomain).toBe('Web application');
    });

    it('sets industry from STRAT_002', () => {
      expect(profile.industry).toBe('saas');
    });

    it('sets team size from OPS_001', () => {
      expect(profile.teamSize).toBe('solo');
    });

    it('sets languages from TECH_001', () => {
      expect(profile.languages).toEqual(['typescript']);
    });

    it('sets budget tier from FIN_001', () => {
      expect(profile.budgetTier).toBe('moderate');
    });

    it('has empty compliance when REG_001 is false', () => {
      expect(profile.complianceFrameworks).toEqual([]);
    });

    it('has no security concerns when REG_001 is false', () => {
      expect(profile.securityConcerns).toEqual([]);
    });
  });

  describe('healthcare developer profile', () => {
    const profile = builder.build(buildAnswerMap(HEALTHCARE_DEVELOPER_ANSWERS));

    it('sets healthcare industry', () => {
      expect(profile.industry).toBe('healthcare');
    });

    it('sets HIPAA compliance framework', () => {
      expect(profile.complianceFrameworks).toContain('hipaa');
    });

    it('includes phi in security concerns', () => {
      expect(profile.securityConcerns).toContain('phi');
    });

    it('includes pii in security concerns', () => {
      expect(profile.securityConcerns).toContain('pii');
    });

    it('includes dlp in security concerns', () => {
      expect(profile.securityConcerns).toContain('dlp');
    });

    it('includes session_audit_trail in security concerns', () => {
      expect(profile.securityConcerns).toContain('session_audit_trail');
    });

    it('includes strict_permissions for strict permission level', () => {
      expect(profile.securityConcerns).toContain('strict_permissions');
    });
  });

  describe('PM profile', () => {
    const profile = builder.build(buildAnswerMap(PM_ANSWERS));

    it('sets pm role', () => {
      expect(profile.role).toBe('pm');
    });

    it('sets non_technical proficiency', () => {
      expect(profile.technicalProficiency).toBe('non_technical');
    });
  });

  describe('industry resolution', () => {
    it('uses STRAT_003 when STRAT_002 is "other"', () => {
      const profile = builder.build(buildAnswerMap([
        ...MINIMAL_DEVELOPER_ANSWERS.filter(([id]) => id !== 'STRAT_002'),
        ['STRAT_002', 'other'],
        ['STRAT_003', 'Aerospace'],
      ]));
      expect(profile.industry).toBe('Aerospace');
    });
  });

  describe('defaults', () => {
    it('defaults to developer role with empty answers', () => {
      const profile = builder.build(new Map());
      expect(profile.role).toBe('developer');
    });

    it('defaults to solo team size with empty answers', () => {
      const profile = builder.build(new Map());
      expect(profile.teamSize).toBe('solo');
    });

    it('defaults to moderate budget with empty answers', () => {
      const profile = builder.build(new Map());
      expect(profile.budgetTier).toBe('moderate');
    });
  });
});
