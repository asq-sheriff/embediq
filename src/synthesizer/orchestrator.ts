import type { SetupConfig, GeneratedFile, GenerationResult } from '../types/index.js';
import { validateOutput } from './output-validator.js';
import { stampGeneratedFile } from './generation-header.js';
import { withSpan, getMeter } from '../observability/telemetry.js';
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

  async generate(config: SetupConfig): Promise<GeneratedFile[]> {
    return withSpan('synthesizer.generate', {
      'embediq.role': config.profile.role,
      'embediq.industry': config.profile.industry,
    }, async (span) => {
      // Adapt generators based on user role
      const isNonTechnical = ['ba', 'pm', 'executive'].includes(config.profile.role);

      // Filter to applicable generators
      const applicable = this.generators.filter(
        g => !(isNonTechnical && this.isTechnicalOnlyGenerator(g.name))
      );

      span.setAttribute('embediq.generator_count', applicable.length);

      // Run all generators in parallel — each is pure (reads config, returns files)
      const results = await Promise.all(
        applicable.map(generator =>
          withSpan(`generator.${generator.name}`, undefined, async () =>
            generator.generate(config)
          )
        )
      );

      const allFiles = results.flat();

      // For non-technical users, add a coworker-focused CLAUDE.md overlay
      if (isNonTechnical) {
        const coworkerClaudeMd = this.generateCoworkerClaudeMd(config);
        const idx = allFiles.findIndex(f => f.relativePath === 'CLAUDE.md');
        if (idx >= 0) {
          allFiles[idx] = coworkerClaudeMd;
        } else {
          allFiles.push(coworkerClaudeMd);
        }
      }

      span.setAttribute('embediq.files_generated', allFiles.length);
      this.recordMetrics(allFiles.length, applicable.length);

      return allFiles;
    });
  }

  async generateWithValidation(config: SetupConfig): Promise<GenerationResult> {
    return withSpan('synthesizer.generateWithValidation', {
      'embediq.role': config.profile.role,
    }, async (span) => {
      const files = await this.generate(config);
      const validation = validateOutput(files, config.profile, config.domainPack);
      const stampedFiles = files.map(stampGeneratedFile);

      span.setAttribute('embediq.validation_passed', validation.passed);
      span.setAttribute('embediq.validation_checks', validation.checks.length);

      const meter = getMeter();
      const validationCounter = meter.createCounter('embediq.validations');
      validationCounter.add(1, { passed: String(validation.passed) });

      return { files: stampedFiles, validation };
    });
  }

  private recordMetrics(fileCount: number, generatorCount: number): void {
    const meter = getMeter();
    const filesCounter = meter.createCounter('embediq.files_generated');
    filesCounter.add(fileCount);
    const genCounter = meter.createCounter('embediq.generation_runs');
    genCounter.add(1, { generator_count: generatorCount });
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
