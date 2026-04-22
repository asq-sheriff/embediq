import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DomainPack } from './index.js';
import { skillRegistry } from '../skills/skill-registry.js';
import { composeSkills } from '../skills/skill-composer.js';

const PLUGINS_DIR = () => process.env.EMBEDIQ_PLUGINS_DIR || './plugins';

const INDUSTRY_TO_PACK: Record<string, string> = {
  healthcare: 'healthcare',
  health_tech: 'healthcare',
  pharma: 'healthcare',
  finance: 'finance',
  fintech: 'finance',
  banking: 'finance',
  insurance: 'finance',
  ecommerce: 'finance',
  education: 'education',
  edtech: 'education',
  k12: 'education',
  higher_ed: 'education',
};

export class DomainPackRegistry {
  private packs: Map<string, DomainPack> = new Map();

  register(pack: DomainPack): void {
    if (this.packs.has(pack.id)) {
      console.warn(
        `Domain pack ID conflict: "${pack.id}" already registered. Keeping first.`,
      );
      return;
    }
    this.packs.set(pack.id, pack);
  }

  async loadExternalPlugins(): Promise<void> {
    const dir = PLUGINS_DIR();
    if (!existsSync(dir)) return;

    const entries = readdirSync(dir).filter(
      f => f.endsWith('.js') || f.endsWith('.mjs'),
    );

    for (const entry of entries) {
      try {
        const fullPath = resolve(dir, entry);
        const mod = await import(fullPath);
        const pack = mod.default || mod;

        if (this.isDomainPack(pack)) {
          this.register(pack);
          console.log(`Loaded external domain pack: ${pack.name} (${pack.id})`);
        } else {
          console.warn(`Skipping invalid domain pack: ${entry} (missing required fields)`);
        }
      } catch (err) {
        console.error(`Failed to load domain pack ${entry}:`, err);
      }
    }
  }

  private isDomainPack(obj: unknown): obj is DomainPack {
    if (typeof obj !== 'object' || obj === null) return false;
    const p = obj as Record<string, unknown>;
    return (
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      typeof p.version === 'string' &&
      Array.isArray(p.questions) &&
      Array.isArray(p.dlpPatterns) &&
      Array.isArray(p.ruleTemplates)
    );
  }

  getAll(): DomainPack[] {
    return Array.from(this.packs.values());
  }

  getById(id: string): DomainPack | undefined {
    return this.packs.get(id);
  }

  getForIndustry(industry: string): DomainPack | undefined {
    const packId = INDUSTRY_TO_PACK[industry.toLowerCase()];
    return packId ? this.packs.get(packId) : undefined;
  }

  /**
   * Compose a one-off DomainPack from a list of skill IDs. Used by
   * skill-aware callers who need the DomainPack-shaped payload (so the
   * existing generators and validator consume it unchanged) without
   * registering a permanent pack. Returns undefined if any skill ID
   * is unknown.
   */
  composeFromSkills(
    skillIds: readonly string[],
    meta: { id: string; name: string; version: string; description: string },
  ): DomainPack | undefined {
    const skills = skillRegistry.getByIds(skillIds);
    if (skills.length !== skillIds.length) return undefined;
    const composed = composeSkills(skills);
    return {
      ...meta,
      questions: composed.questions,
      complianceFrameworks: composed.complianceFrameworks,
      priorityCategories: composed.priorityCategories,
      dlpPatterns: composed.dlpPatterns,
      ruleTemplates: composed.ruleTemplates,
      ignorePatterns: composed.ignorePatterns,
      validationChecks: composed.validationChecks,
    };
  }
}

import { healthcarePack } from './built-in/healthcare.js';
import { financePack } from './built-in/finance.js';
import { educationPack } from './built-in/education.js';

export const domainPackRegistry = new DomainPackRegistry();
domainPackRegistry.register(healthcarePack);
domainPackRegistry.register(financePack);
domainPackRegistry.register(educationPack);
