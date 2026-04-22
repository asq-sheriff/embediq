import type { SetupConfig, GeneratedFile, GenerationResult } from '../types/index.js';
import { validateOutput } from './output-validator.js';
import { stampGeneratedFile } from './generation-header.js';
import { withSpan } from '../observability/telemetry.js';
import { getEventBus, type EventBus } from '../events/bus.js';
import type { ConfigGenerator } from './generator.js';
import { TargetFormat, DEFAULT_TARGETS } from './target-format.js';
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
import { AgentsMdGenerator } from './generators/agents-md.js';
import { CursorRulesGenerator } from './generators/cursor-rules.js';
import { CopilotInstructionsGenerator } from './generators/copilot-instructions.js';
import { GeminiMdGenerator } from './generators/gemini-md.js';
import { WindsurfRulesGenerator } from './generators/windsurf-rules.js';

export class SynthesizerOrchestrator {
  private generators: ConfigGenerator[];
  private bus: EventBus;

  constructor(bus: EventBus = getEventBus()) {
    this.bus = bus;
    this.generators = [
      // Claude Code — the native target; preserves v2.x behavior.
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
      // Multi-agent targets — opt-in via `config.targets` / EMBEDIQ_OUTPUT_TARGETS.
      new AgentsMdGenerator(),
      new CursorRulesGenerator(),
      new CopilotInstructionsGenerator(),
      new GeminiMdGenerator(),
      new WindsurfRulesGenerator(),
    ];
  }

  async generate(config: SetupConfig): Promise<GeneratedFile[]> {
    return withSpan('synthesizer.generate', {
      'embediq.role': config.profile.role,
      'embediq.industry': config.profile.industry,
    }, async (span) => {
      // Adapt generators based on user role
      const isNonTechnical = ['ba', 'pm', 'executive'].includes(config.profile.role);

      // Target selection — defaults to Claude only, which preserves the v2.x
      // behavior for callers that don't supply `targets`.
      const targets = config.targets && config.targets.length > 0
        ? new Set<TargetFormat>(config.targets)
        : new Set<TargetFormat>(DEFAULT_TARGETS);

      span.setAttribute('embediq.targets', Array.from(targets).sort().join(','));

      // Filter by target first, then drop technical-only Claude generators
      // when the active role is non-technical. Non-Claude targets already
      // render role-appropriate output internally.
      const applicable = this.generators.filter((g) => {
        if (!targets.has(g.target)) return false;
        if (isNonTechnical && g.target === TargetFormat.CLAUDE && this.isTechnicalOnlyGenerator(g.name)) {
          return false;
        }
        return true;
      });

      span.setAttribute('embediq.generator_count', applicable.length);
      this.bus.emit('generation:started', { generatorCount: applicable.length });

      // Run all generators in parallel — each is pure (reads config, returns files).
      // Emit file:generated per file as each generator completes so subscribers
      // see progress while others are still running.
      const results = await Promise.all(
        applicable.map(generator =>
          withSpan(`generator.${generator.name}`, undefined, async () => {
            const files = await generator.generate(config);
            for (const file of files) {
              this.bus.emit('file:generated', {
                relativePath: file.relativePath,
                size: file.content.length,
              });
            }
            return files;
          })
        )
      );

      const allFiles = results.flat();

      // For non-technical users with the Claude target active, overlay a
      // coworker-focused CLAUDE.md. Other targets emit their own role-aware
      // copy, so no equivalent overlay is needed there.
      if (isNonTechnical && targets.has(TargetFormat.CLAUDE)) {
        const coworkerClaudeMd = this.generateCoworkerClaudeMd(config);
        const idx = allFiles.findIndex(f => f.relativePath === 'CLAUDE.md');
        if (idx >= 0) {
          allFiles[idx] = coworkerClaudeMd;
        } else {
          allFiles.push(coworkerClaudeMd);
        }
      }

      span.setAttribute('embediq.files_generated', allFiles.length);

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

      this.bus.emit('validation:completed', {
        passCount: validation.checks.filter(c => c.passed).length,
        failCount: validation.checks.filter(c => !c.passed && c.severity === 'error').length,
        checks: validation.checks,
      });

      return { files: stampedFiles, validation };
    });
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
