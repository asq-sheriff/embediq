import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { SetupConfig, GeneratedFile, UserProfile } from '../../types/index.js';
import {
  buildCommandBullets,
  buildConventionBullets,
  buildTerminologyBullets,
} from './agents-md.js';

/**
 * Gemini CLI / Antigravity generator — emits `GEMINI.md` at the project
 * root. Gemini's context file follows the same broad shape as `AGENTS.md`
 * (project → stack → commands → rules → terminology) but Gemini surfaces
 * the file in a coworker-style assistant by default, so we add an "About
 * this project" preamble that the universal file does not need.
 */
export class GeminiMdGenerator implements ConfigGenerator {
  name = 'GEMINI.md';
  target = TargetFormat.GEMINI;

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    const isNonTechnical = ['ba', 'pm', 'executive'].includes(profile.role);
    const content = isNonTechnical
      ? this.renderNonTechnical(profile)
      : this.renderTechnical(profile);
    return [
      {
        relativePath: 'GEMINI.md',
        content,
        description: 'Gemini CLI / Antigravity project context file',
      },
    ];
  }

  private renderTechnical(profile: UserProfile): string {
    const lines: string[] = [];
    lines.push(`# ${profile.businessDomain || 'Project'}`);
    lines.push('');
    lines.push('## About this project');
    lines.push('');
    lines.push(
      `This file is the project context read by Gemini CLI / Antigravity. It summarizes the stack, conventions, and boundaries so Gemini can assist ${profile.role} work without re-deriving the setup each session.`,
    );
    lines.push('');

    lines.push('## Stack');
    if (profile.languages.length > 0) lines.push(`- Languages: ${profile.languages.join(', ')}`);
    const frameworks = profile.techStack.filter((t) => !profile.languages.includes(t));
    if (frameworks.length > 0) lines.push(`- Frameworks: ${frameworks.join(', ')}`);
    if (profile.devOps.buildTools.length > 0) lines.push(`- Build: ${profile.devOps.buildTools.join(', ')}`);
    if (profile.devOps.testFrameworks.length > 0) lines.push(`- Testing: ${profile.devOps.testFrameworks.join(', ')}`);
    if (profile.devOps.cicd) lines.push(`- CI/CD: ${profile.devOps.cicd}`);
    lines.push('');

    lines.push('## Commands');
    const commands = buildCommandBullets(profile);
    if (commands.length === 0) {
      lines.push('- No project-specific commands detected — follow language-standard tooling.');
    } else {
      for (const c of commands) lines.push(`- ${c}`);
    }
    lines.push('');

    lines.push('## Rules');
    lines.push('- Run tests before committing; never commit code that fails tests.');
    lines.push('- Keep changes scoped to the task; avoid drive-by refactors.');
    lines.push('- Prefer editing existing files over creating new ones.');
    lines.push('- Never hardcode secrets, API keys, passwords, or tokens.');
    for (const c of buildConventionBullets(profile)) lines.push(`- ${c}`);
    lines.push('');

    if (profile.complianceFrameworks.length > 0 || profile.securityConcerns.length > 0) {
      lines.push('## Boundaries');
      if (profile.complianceFrameworks.includes('hipaa')) {
        lines.push('- HIPAA: no PHI in code, comments, logs, or test fixtures.');
      }
      if (profile.complianceFrameworks.includes('pci')) {
        lines.push('- PCI-DSS: never store CVV/CVC; mask PANs to the last 4 digits in logs.');
      }
      if (profile.complianceFrameworks.includes('ferpa')) {
        lines.push('- FERPA: never expose student education records to unauthorized parties.');
      }
      if (profile.securityConcerns.includes('dlp')) {
        lines.push('- DLP scanners run on every write — expect blocked writes on sensitive-data matches.');
      }
      if (profile.securityConcerns.includes('strict_permissions')) {
        lines.push('- Destructive shell operations (`rm -rf`, `git push --force`, `git reset --hard`) require explicit approval.');
      }
      lines.push('');
    }

    const terminology = buildTerminologyBullets(profile);
    if (terminology.length > 0) {
      lines.push('## Terminology');
      for (const t of terminology) lines.push(`- ${t}`);
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
      '## About this project',
      '',
      `Gemini is used here as an intelligent coworker for ${roleTitle.toLowerCase()} tasks — research, analysis, documentation, and strategic thinking rather than code development.`,
      '',
      '## Rules',
      '',
      '- Use clear, non-technical language in all outputs.',
      '- Cite sources and data when making claims.',
      '- Flag assumptions explicitly.',
      '- Provide an executive summary before detailed analysis.',
      '- Use tables and structured formats for comparisons.',
      '',
    ].join('\n');
  }
}
