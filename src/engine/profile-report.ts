import type { UserProfile } from '../types/index.js';
import type { AnswerWarning } from './answer-validator.js';
import { MarkdownBuilder } from '../util/markdown-builder.js';

export interface ProfileReportOptions {
  /** Output targets selected for generation (e.g. claude, copilot). */
  targets?: string[];
  /** Resolved domain pack name, if any. */
  domainPackName?: string;
  /** Cross-answer consistency warnings to include. */
  warnings?: AnswerWarning[];
  /** Monotonic version of this profile snapshot. */
  version?: number;
  /** ISO timestamp the report was generated. */
  generatedAt: string;
}

export interface ProfileReport {
  markdown: string;
  json: Record<string, unknown>;
}

const ROLE_LABEL: Record<string, string> = {
  developer: 'Software Developer / Engineer', devops: 'DevOps / Platform / SRE',
  lead: 'Tech Lead / Architect', eng_manager: 'Engineering / Delivery Manager',
  ba: 'Business Analyst', pm: 'Product Manager', executive: 'Executive / Director',
  qa: 'QA / Test Engineer', data: 'Data Analyst / Data Scientist',
};
const INDUSTRY_LABEL: Record<string, string> = {
  healthcare: 'Healthcare / Life Sciences', finance: 'Financial Services / Fintech',
  ecommerce: 'E-Commerce / Retail', saas: 'SaaS / Enterprise Software',
  education: 'Education / EdTech', government: 'Government / Public Sector',
  manufacturing: 'Manufacturing / IoT', media: 'Media / Entertainment / Gaming',
};

function label(map: Record<string, string>, key: string): string {
  return map[key] || key || '(not specified)';
}
function operatorOf(profile: UserProfile): string {
  const v = profile.answers.get('STRAT_000b')?.value;
  return v === 'admin' ? 'Coding Agent Admin' : v === 'user' ? 'Coding Agent User' : '(unspecified)';
}

/**
 * Build a human-readable (Markdown) + machine-readable (JSON) profile report
 * from the user's answers and the determinations the app derived. Inferred
 * defaults (for skipped optional questions) are explicitly tagged so a reader
 * can tell what the user said from what EmbedIQ assumed.
 */
export function buildProfileReport(profile: UserProfile, opts: ProfileReportOptions): ProfileReport {
  const inferred = profile.inferredDefaults ?? {};
  const inferredTag = (field: string) => (inferred[field] ? '  _(inferred)_' : '');

  const md = new MarkdownBuilder();
  md.h1(`${profile.businessDomain || 'Project'} — EmbedIQ Profile`);
  md.paragraph(`Generated ${opts.generatedAt}${opts.version != null ? ` · version ${opts.version}` : ''}. This report captures the answers you gave and the configuration decisions EmbedIQ derived from them.`);

  md.h2('Operator & role');
  md.bullet(`Operator: ${operatorOf(profile)}`);
  md.bullet(`Role: ${label(ROLE_LABEL, profile.role)}`);
  md.bullet(`Technical proficiency: ${profile.technicalProficiency}`);

  md.h2('Project');
  md.bullet(`Industry: ${label(INDUSTRY_LABEL, profile.industry)}`);
  md.bullet(`Purpose: ${profile.businessDomain || '(not specified)'}`);

  md.h2('Stack');
  md.bullet(`Languages: ${profile.languages.join(', ') || '(not specified)'}`);
  const frameworks = profile.techStack.filter((t) => !profile.languages.includes(t));
  if (frameworks.length) md.bullet(`Frameworks: ${frameworks.join(', ')}`);
  md.bullet(`IDEs: ${profile.devOps.ide.join(', ') || '(none)'}${inferredTag('IDE')}`);
  md.bullet(`Build tools: ${profile.devOps.buildTools.join(', ') || '(none)'}${inferredTag('Build tools')}`);
  md.bullet(`Testing: ${profile.devOps.testFrameworks.join(', ') || '(none)'}${inferredTag('Testing')}`);
  md.bullet(`CI/CD: ${profile.devOps.cicd || '(none)'}`);
  if (profile.devOps.cloudTarget) md.bullet(`Cloud: ${profile.devOps.cloudTarget}`);
  if (profile.devOps.containerization.length) md.bullet(`Containers: ${profile.devOps.containerization.join(', ')}`);

  md.h2('Determinations EmbedIQ made');
  if (opts.domainPackName) md.bullet(`Domain pack resolved: ${opts.domainPackName}`);
  if (opts.targets?.length) md.bullet(`Output targets: ${opts.targets.join(', ')}`);
  const inferredKeys = Object.keys(inferred);
  if (inferredKeys.length) {
    md.bullet(`Inferred defaults (you skipped these): ${inferredKeys.map((k) => `${k} → ${inferred[k].join(', ')}`).join('; ')}`);
  }
  if (profile.priorities.length) {
    md.blank();
    md.paragraph('**Interpreted priorities** (what the agent will optimize for):');
    for (const p of profile.priorities) {
      md.bullet(`${p.name} — ${Math.round(p.confidence * 100)}% confidence${p.derivedFrom?.length ? ` (from: ${p.derivedFrom.join(', ')})` : ''}`);
    }
  }

  if (profile.complianceFrameworks.length || profile.securityConcerns.length) {
    md.h2('Compliance & security');
    if (profile.complianceFrameworks.length) md.bullet(`Frameworks: ${profile.complianceFrameworks.map((f) => f.toUpperCase()).join(', ')}`);
    if (profile.securityConcerns.length) md.bullet(`Security concerns: ${profile.securityConcerns.join(', ')}`);
    md.bullet(`Budget tier: ${profile.budgetTier}`);
  }

  if (opts.warnings?.length) {
    md.h2('Consistency warnings');
    for (const w of opts.warnings) {
      md.bullet(`${w.message}${w.suggestion ? ` — _${w.suggestion}_` : ''}`);
    }
  }

  md.h2('Answer log');
  for (const [id, ans] of profile.answers) {
    const v = Array.isArray(ans.value) ? ans.value.join(', ') : String(ans.value);
    md.bullet(`\`${id}\`: ${v}`);
  }
  md.blank();

  const json: Record<string, unknown> = {
    generatedAt: opts.generatedAt,
    version: opts.version,
    operator: operatorOf(profile),
    role: profile.role,
    technicalProficiency: profile.technicalProficiency,
    businessDomain: profile.businessDomain,
    industry: profile.industry,
    languages: profile.languages,
    techStack: profile.techStack,
    devOps: profile.devOps,
    complianceFrameworks: profile.complianceFrameworks,
    securityConcerns: profile.securityConcerns,
    budgetTier: profile.budgetTier,
    priorities: profile.priorities,
    determinations: {
      domainPack: opts.domainPackName ?? null,
      targets: opts.targets ?? [],
      inferredDefaults: inferred,
    },
    warnings: opts.warnings ?? [],
    answers: Object.fromEntries(
      [...profile.answers].map(([id, a]) => [id, a.value]),
    ),
  };

  return { markdown: md.build(), json };
}
