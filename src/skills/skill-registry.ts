import type { Skill } from './skill.js';
import {
  discoverSkillDirectories,
  loadSkillFromDirectory,
} from './skill-md.js';

const EXTERNAL_SKILLS_DIR = () => process.env.EMBEDIQ_SKILLS_DIR || './skills';

/**
 * Catalog of available skills. Built-in skills register at module load.
 * External skills load asynchronously from `EMBEDIQ_SKILLS_DIR` (default
 * `./skills`) — each subdirectory containing a `SKILL.md` becomes a
 * skill via `loadSkillFromDirectory`.
 */
export class SkillRegistry {
  private skills = new Map<string, Skill>();

  /**
   * Register a built-in or programmatically-supplied skill. Re-registering
   * the same id is a no-op with a warning — the first registration wins
   * to avoid silent overrides.
   */
  register(skill: Skill, source: Skill['source'] = 'built-in'): void {
    if (this.skills.has(skill.id)) {
      console.warn(
        `Skill ID conflict: "${skill.id}" already registered. Keeping first.`,
      );
      return;
    }
    this.skills.set(skill.id, { ...skill, source: skill.source ?? source });
  }

  /**
   * Scan `EMBEDIQ_SKILLS_DIR` for subdirectories with `SKILL.md` files
   * and register each as an external skill. Failures are logged but
   * never thrown — one bad skill must not break the registry boot.
   */
  async loadExternalSkills(dir: string = EXTERNAL_SKILLS_DIR()): Promise<void> {
    const candidateDirs = await discoverSkillDirectories(dir);
    for (const candidate of candidateDirs) {
      try {
        const skill = await loadSkillFromDirectory(candidate, 'external');
        this.register(skill, 'external');
      } catch (err) {
        console.error(`Failed to load skill from ${candidate}:`, err);
      }
    }
  }

  getById(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  getByIds(ids: readonly string[]): Skill[] {
    return ids
      .map((id) => this.skills.get(id))
      .filter((s): s is Skill => s !== undefined);
  }

  getByTag(tag: string): Skill[] {
    return Array.from(this.skills.values()).filter((s) => s.tags.includes(tag));
  }

  /** All registered skills, sorted by id for deterministic enumeration. */
  list(): Skill[] {
    return Array.from(this.skills.values()).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
  }

  /** Number of registered skills. */
  size(): number {
    return this.skills.size;
  }

  /** Strictly for tests — clears every skill including built-ins. */
  clearForTesting(): void {
    this.skills.clear();
  }
}

/** Process-wide singleton. Built-ins register below. */
export const skillRegistry = new SkillRegistry();

// Register built-in skills. The `built-in/index.ts` module exports the
// full set so adding a new skill is a one-line change there.
import { BUILT_IN_SKILLS } from './built-in/index.js';
for (const skill of BUILT_IN_SKILLS) {
  skillRegistry.register(skill, 'built-in');
}
