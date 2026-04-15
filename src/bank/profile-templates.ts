import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface ProfileTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  organization?: string;
  prefilledAnswers: Record<string, {
    value: string | string[] | number | boolean;
  }>;
  lockedQuestions: string[];
  forcedQuestions: string[];
  domainPackId?: string;
}

export function loadTemplates(): ProfileTemplate[] {
  const TEMPLATES_DIR = process.env.EMBEDIQ_TEMPLATES_DIR || './templates';
  if (!existsSync(TEMPLATES_DIR)) return [];

  return readdirSync(TEMPLATES_DIR)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map(f => {
      const content = readFileSync(join(TEMPLATES_DIR, f), 'utf-8');
      return parseYaml(content) as ProfileTemplate;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
