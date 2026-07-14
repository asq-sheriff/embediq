import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DomainPack } from './index.js';
import { skillRegistry } from '../skills/skill-registry.js';
import { composeSkills } from '../skills/skill-composer.js';
import { composePacks, type ComposePackOptions } from './composer.js';
import {
  readOscalCatalog,
  oscalCatalogToFramework,
  readOscalProfile,
  resolveOscalProfile,
  oscalProfileToFramework,
  type OscalToFrameworkOptions,
  type ResolveProfileOptions,
  type OscalProfileToFrameworkOptions,
} from '../governance/oscal/index.js';

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

  /**
   * Compose a one-off DomainPack from a list of pack IDs already
   * registered in this registry. Lets operators combine an OSCAL-imported
   * pack (control identity only) with an industry pack like `healthcare`
   * (HIPAA DLP + rules + questions) in a single call — the resulting
   * pack carries both frameworks plus the union of the industry pack's
   * generation-driving payload.
   *
   * Returns `undefined` when any of the requested pack IDs is not
   * registered. Collisions are first-wins (composition order matters);
   * pass `options.allowFirstWins = false` to throw on collision.
   */
  composeFromPacks(
    packIds: readonly string[],
    meta: { id: string; name: string; version: string; description: string },
    options: ComposePackOptions = {},
  ): DomainPack | undefined {
    const packs: DomainPack[] = [];
    for (const id of packIds) {
      const p = this.packs.get(id);
      if (!p) return undefined;
      packs.push(p);
    }
    const composed = composePacks(packs, options);
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

  /**
   * Build a thin DomainPack whose only payload is the compliance-framework
   * identity drawn from an OSCAL catalog (800-53 Rev 5, SSDF / SP 800-218,
   * SP 800-171, etc.). Registers it under `meta.id`. Returns the pack so
   * callers can compose further (e.g. merge it with an industry pack to
   * get OSCAL-controlled HIPAA or PCI generation).
   *
   * Throws `OscalLoadError` on parse failure — the pack is not registered
   * in that case. Re-registering the same id is a no-op (warns and returns
   * the existing pack); operators rotating an updated OSCAL catalog
   * should delete-then-register or use a versioned id.
   */
  async loadFromOscalCatalog(
    catalogPath: string,
    meta: { id: string; name: string; version: string; description?: string },
    options: OscalToFrameworkOptions = {},
  ): Promise<DomainPack> {
    const catalog = await readOscalCatalog(catalogPath);
    const framework = oscalCatalogToFramework(catalog, options);
    const pack: DomainPack = {
      id: meta.id,
      name: meta.name,
      version: meta.version,
      description: meta.description ?? framework.description,
      questions: [],
      complianceFrameworks: [framework],
      priorityCategories: {},
      dlpPatterns: [],
      ruleTemplates: [],
      ignorePatterns: [],
      validationChecks: [],
    };
    this.register(pack);
    return pack;
  }

  /**
   * Import an OSCAL profile (FedRAMP Low / Moderate / High, agency
   * overlays, etc.) by resolving its catalog imports against a
   * caller-supplied `catalogPaths` map. The operator is in control of
   * catalog location — the resolver never fetches over the network or
   * follows `rlinks`.
   *
   * Produces a thin `DomainPack` whose only payload is a single
   * `ComplianceFrameworkDef` describing the tailored baseline. Compose
   * with industry packs via `composeFromPacks` to add DLP / rules /
   * questions.
   *
   * Throws `OscalLoadError` and does NOT register the pack when:
   *   - The profile file is missing, unreadable, or malformed.
   *   - A required catalog reference cannot be resolved via `catalogPaths`.
   *   - A resolved catalog itself fails to parse.
   */
  async loadFromOscalProfile(
    profilePath: string,
    options: ResolveProfileOptions & OscalProfileToFrameworkOptions,
    meta: { id: string; name: string; version: string; description?: string },
  ): Promise<DomainPack> {
    const profile = await readOscalProfile(profilePath);
    const resolved = await resolveOscalProfile(profile, { catalogPaths: options.catalogPaths });
    const framework = oscalProfileToFramework(profile, resolved, {
      keyOverride: options.keyOverride,
      labelOverride: options.labelOverride,
    });
    const pack: DomainPack = {
      id: meta.id,
      name: meta.name,
      version: meta.version,
      description: meta.description ?? framework.description,
      questions: [],
      complianceFrameworks: [framework],
      priorityCategories: {},
      dlpPatterns: [],
      ruleTemplates: [],
      ignorePatterns: [],
      validationChecks: [],
    };
    this.register(pack);
    return pack;
  }
}

import { BUILT_IN_PACKS } from './built-in/index.js';

export const domainPackRegistry = new DomainPackRegistry();
// Register the built-in packs in order (first-wins on compose). The list is the
// single source shared with the routing-policy builder's eligibility
// composition — healthcare/finance carry HIPAA/PCI egress rules, and the
// cross-industry NIST AI RMF pack (not in INDUSTRY_TO_PACK) composes via
// DomainPackRegistry.composeFromPacks(['healthcare','nist-ai-rmf'], ...).
for (const pack of BUILT_IN_PACKS) {
  domainPackRegistry.register(pack);
}
