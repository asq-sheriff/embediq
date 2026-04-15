import type { SetupConfig, GeneratedFile, GenerationResult } from '../types/index.js';
import { validateOutput } from './output-validator.js';
import { stampGeneratedFile } from './generation-header.js';
import type { ConfigGenerator } from './generator.js';
import { ClaudeMdGenerator } from './generators/claude-md.js';
import { SettingsJsonGenerator } from './generators/settings-json.js';
import { SettingsLocalGenerator } from './generators/settings-local.js';
import { RulesGenerator } from './generators/rules.js';
import { CommandsGenerator } from './generators/commands.js';
import { AgentsGenerator } from './generators/agents.js';
import { SkillsGenerator } from './generators/skills.js';
import { HooksGenerator } from './generators/hooks.js';
import { IgnoreGenerator } from './generators/ignore.js';
import { McpJsonGenerator } from './generators/mcp-json.js';
import { AssociationMapGenerator } from './generators/association-map.js';
import { DocumentStateGenerator } from './generators/document-state.js';

export class SynthesizerOrchestrator {
  private generators: ConfigGenerator[];

  constructor() {
    this.generators = [
      new ClaudeMdGenerator(),
      new SettingsJsonGenerator(),
      new SettingsLocalGenerator(),
      new RulesGenerator(),
      new CommandsGenerator(),
      new AgentsGenerator(),
      new SkillsGenerator(),
      new HooksGenerator(),
      new IgnoreGenerator(),
      new McpJsonGenerator(),
      new AssociationMapGenerator(),
      new DocumentStateGenerator(),
    ];
  }

  generate(config: SetupConfig): GeneratedFile[] {
    const allFiles: GeneratedFile[] = [];

    // Adapt generators based on user role
    const isNonTechnical = ['ba', 'pm', 'executive'].includes(config.profile.role);
    const isTechnical = ['developer', 'devops', 'lead', 'qa', 'data'].includes(config.profile.role);

    for (const generator of this.generators) {
      // Skip technical-only generators for non-technical users
      if (isNonTechnical && this.isTechnicalOnlyGenerator(generator.name)) {
        continue;
      }

      const files = generator.generate(config);
      allFiles.push(...files);
    }

    // For non-technical users, add a coworker-focused CLAUDE.md overlay
    if (isNonTechnical) {
      const coworkerClaudeMd = this.generateCoworkerClaudeMd(config);
      // Replace the default CLAUDE.md with the coworker version
      const idx = allFiles.findIndex(f => f.relativePath === 'CLAUDE.md');
      if (idx >= 0) {
        allFiles[idx] = coworkerClaudeMd;
      } else {
        allFiles.push(coworkerClaudeMd);
      }
    }

    return allFiles;
  }

  generateWithValidation(config: SetupConfig): GenerationResult {
    const files = this.generate(config);
    const validation = validateOutput(files, config.profile, config.domainPack);
    const stampedFiles = files.map(stampGeneratedFile);
    return { files: stampedFiles, validation };
  }

  private isTechnicalOnlyGenerator(name: string): boolean {
    // These generators produce configs only relevant to developers/devops
    return ['hooks', 'association-map'].includes(name);
  }

  private generateCoworkerClaudeMd(config: SetupConfig): GeneratedFile {
    const { profile } = config;
    const roleTitle = this.getRoleTitle(profile.role);

    const lines: string[] = [
      `# ${profile.businessDomain || 'Project'} — ${roleTitle} Workspace`,
      '',
      `## About This Setup`,
      '',
      `This Claude Code environment is configured for a ${roleTitle} workflow.`,
      `Claude acts as your intelligent coworker — helping with research, analysis,`,
      `documentation, and strategic thinking rather than code development.`,
      '',
      `## Your Industry`,
      '',
      `- ${this.formatIndustry(profile.industry)}`,
      '',
      `## How Claude Helps You`,
      '',
    ];

    switch (profile.role) {
      case 'ba':
        lines.push(
          '- Analyze requirements and specifications',
          '- Review and summarize technical documentation',
          '- Generate user stories and acceptance criteria',
          '- Map business processes and identify gaps',
          '- Create data flow diagrams and entity descriptions',
          '- Validate requirements against compliance frameworks',
        );
        break;
      case 'pm':
        lines.push(
          '- Research market trends and competitive landscape',
          '- Draft product specifications and PRDs',
          '- Prioritize features using frameworks (RICE, MoSCoW)',
          '- Analyze user feedback and feature requests',
          '- Create roadmap documentation',
          '- Summarize technical decisions for stakeholders',
        );
        break;
      case 'executive':
        lines.push(
          '- Summarize technical reports and metrics',
          '- Analyze strategic options and trade-offs',
          '- Draft executive communications',
          '- Review compliance and risk reports',
          '- Research industry trends and benchmarks',
          '- Prepare board-level documentation',
        );
        break;
    }

    lines.push('');

    if (profile.complianceFrameworks.length > 0) {
      lines.push('## Compliance Context', '');
      for (const fw of profile.complianceFrameworks) {
        lines.push(`- ${fw.toUpperCase()} compliance applies to this domain`);
      }
      lines.push('');
    }

    lines.push(
      '## Guidelines',
      '',
      '- Use clear, non-technical language in all outputs',
      '- Always cite sources and data when making claims',
      '- Flag assumptions clearly',
      '- Provide executive summaries before detailed analysis',
      '- Use tables and structured formats for comparisons',
      '',
    );

    return {
      relativePath: 'CLAUDE.md',
      content: lines.join('\n'),
      description: `Claude coworker instructions for ${roleTitle}`,
    };
  }

  private getRoleTitle(role: string): string {
    const map: Record<string, string> = {
      ba: 'Business Analyst',
      pm: 'Product Manager',
      executive: 'Executive',
    };
    return map[role] || role;
  }

  private formatIndustry(industry: string): string {
    const map: Record<string, string> = {
      healthcare: 'Healthcare / Life Sciences',
      finance: 'Financial Services / Fintech',
      ecommerce: 'E-Commerce / Retail',
      saas: 'SaaS / Enterprise Software',
      education: 'Education / EdTech',
      government: 'Government / Public Sector',
      manufacturing: 'Manufacturing / IoT',
      media: 'Media / Entertainment / Gaming',
    };
    return map[industry] || industry;
  }
}
