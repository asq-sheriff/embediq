import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { SetupConfig, GeneratedFile, UserProfile } from '../../types/index.js';
import {
  buildCommandBullets,
  buildConventionBullets,
} from './agents-md.js';

/**
 * Windsurf generator — emits `.windsurfrules`. Windsurf reads a single
 * plain-markdown rules file at the project root; there is no frontmatter
 * and no scoping. We keep the output short and actionable so the
 * context-window hit stays small on every request.
 */
export class WindsurfRulesGenerator implements ConfigGenerator {
  name = 'windsurf-rules';
  target = TargetFormat.WINDSURF;

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    const isNonTechnical = ['ba', 'pm', 'executive'].includes(profile.role);
    const content = isNonTechnical
      ? this.renderNonTechnical(profile)
      : this.renderTechnical(profile);
    return [
      {
        relativePath: '.windsurfrules',
        content,
        description: 'Windsurf project rules (.windsurfrules)',
      },
    ];
  }

  private renderTechnical(profile: UserProfile): string {
    const lines: string[] = [];
    lines.push(`# ${profile.businessDomain || 'Project'} — Windsurf Rules`);
    lines.push('');

    lines.push('## Stack');
    if (profile.languages.length > 0) lines.push(`- Languages: ${profile.languages.join(', ')}`);
    const frameworks = profile.techStack.filter((t) => !profile.languages.includes(t));
    if (frameworks.length > 0) lines.push(`- Frameworks: ${frameworks.join(', ')}`);
    if (profile.devOps.buildTools.length > 0) lines.push(`- Build: ${profile.devOps.buildTools.join(', ')}`);
    if (profile.devOps.testFrameworks.length > 0) lines.push(`- Testing: ${profile.devOps.testFrameworks.join(', ')}`);
    lines.push('');

    const commands = buildCommandBullets(profile);
    if (commands.length > 0) {
      lines.push('## Commands');
      for (const c of commands) lines.push(`- ${c}`);
      lines.push('');
    }

    lines.push('## Rules');
    lines.push('- Run tests before committing; never commit code that fails tests.');
    lines.push('- Keep changes scoped; avoid drive-by refactors.');
    lines.push('- Prefer editing existing files over creating new ones.');
    lines.push('- Never hardcode secrets, API keys, passwords, or tokens.');
    for (const c of buildConventionBullets(profile)) lines.push(`- ${c}`);
    lines.push('');

    const boundaries = buildBoundaries(profile);
    if (boundaries.length > 0) {
      lines.push('## Boundaries');
      for (const b of boundaries) lines.push(`- ${b}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  private renderNonTechnical(profile: UserProfile): string {
    const roleTitle = profile.role === 'ba' ? 'Business Analyst'
      : profile.role === 'pm' ? 'Product Manager'
      : 'Executive';
    return [
      `# ${profile.businessDomain || 'Project'} — ${roleTitle} Workspace`,
      '',
      `Windsurf is used here as an intelligent coworker for ${roleTitle.toLowerCase()} tasks — research, analysis, documentation, not code development.`,
      '',
      '## Rules',
      '- Use clear, non-technical language.',
      '- Cite sources and data when making claims.',
      '- Flag assumptions explicitly.',
      '- Provide an executive summary before detailed analysis.',
      '',
    ].join('\n');
  }
}

function buildBoundaries(profile: UserProfile): string[] {
  const out: string[] = [];
  if (profile.complianceFrameworks.includes('hipaa')) {
    out.push('HIPAA: no PHI in code, comments, logs, or test fixtures.');
  }
  if (profile.complianceFrameworks.includes('pci')) {
    out.push('PCI-DSS: never store CVV/CVC; mask card numbers to last 4 digits in logs.');
  }
  if (profile.complianceFrameworks.includes('ferpa')) {
    out.push('FERPA: never expose student education records to unauthorized parties.');
  }
  if (profile.securityConcerns.includes('dlp')) {
    out.push('DLP scanners block writes that match sensitive-data patterns.');
  }
  if (profile.securityConcerns.includes('strict_permissions')) {
    out.push('Destructive shell operations require explicit approval.');
  }
  return out;
}
