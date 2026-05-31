import type { SetupConfig, GeneratedFile, GenerationResult, UserProfile } from '../types/index.js';
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
import { CiPipelineGenerator } from './generators/ci-pipeline.js';
import { EditorConfigGenerator } from './generators/editorconfig.js';
import { JetBrainsGenerator } from './generators/jetbrains.js';
import { SetupInstructionsGenerator } from './generators/setup-instructions.js';
import { AgentsMdGenerator } from './generators/agents-md.js';
import { CursorRulesGenerator } from './generators/cursor-rules.js';
import { CopilotInstructionsGenerator } from './generators/copilot-instructions.js';
import { GeminiMdGenerator } from './generators/gemini-md.js';
import { WindsurfRulesGenerator } from './generators/windsurf-rules.js';
import { ContinueDevGenerator } from './generators/continue-dev.js';
import { AiderGenerator } from './generators/aider.js';
import { ZedAiGenerator } from './generators/zed-ai.js';
import { OllamaSetupGenerator } from './generators/ollama-setup.js';
import { RagScaffoldGenerator } from './generators/rag-scaffold.js';
import { LocalRouterGenerator } from './generators/local-router.js';
import { generateOscalComponentDefinition } from './generators/oscal-component.js';
import { generateOscalSspFragment } from './generators/oscal-ssp-fragment.js';
import { generateCycloneDxAibom } from './generators/cyclonedx-aibom.js';
import { generateProvenanceTrace } from './generators/provenance-trace.js';
import { readFile } from 'node:fs/promises';

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
      // Project-infrastructure generators — ride on the Claude target but
      // emit only when their profile signal is present (CI platform / IDE).
      new CiPipelineGenerator(),
      new EditorConfigGenerator(),
      new JetBrainsGenerator(),
      // Multi-agent targets — opt-in via `config.targets` / EMBEDIQ_OUTPUT_TARGETS.
      new AgentsMdGenerator(),
      new CursorRulesGenerator(),
      new CopilotInstructionsGenerator(),
      new GeminiMdGenerator(),
      new WindsurfRulesGenerator(),
      // v3.3 — local-AI targets. Auto-included when profile.localAiEnabled
      // is true; explicit selection via --targets / EMBEDIQ_OUTPUT_TARGETS also works.
      new ContinueDevGenerator(),
      new AiderGenerator(),
      new ZedAiGenerator(),
      new OllamaSetupGenerator(),
      // v3.3 — RAG scaffold (industry-agnostic; FHIR-aware chunker
      // for healthcare, plain-text for others; per-framework compliance
      // rules from profile.complianceFrameworks).
      new RagScaffoldGenerator(),
      // v3.3 — Local router with confidence escalation. Auto-included
      // when profile.routerEnabled is true. Healthcare profiles add a
      // PHI redactor; profiles that opt in to confidence escalation get
      // a self-evaluation module wired into the dispatch path.
      new LocalRouterGenerator(),
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

      // v3.3 — auto-include local-AI targets when the profile says so.
      // The user opted into local AI via the wizard (TECH_013); honor that
      // regardless of the rest of the target set. Per-IDE gating happens
      // through profile.ideIntegrations.
      if (config.profile.localAiEnabled && !isNonTechnical) {
        targets.add(TargetFormat.OLLAMA);
        const ides = config.profile.ideIntegrations ?? [];
        if (ides.includes('continue-dev')) targets.add(TargetFormat.CONTINUE_DEV);
        if (ides.includes('aider')) targets.add(TargetFormat.AIDER);
        if (ides.includes('zed-ai')) targets.add(TargetFormat.ZED_AI);
        // v3.3 — RAG scaffold auto-includes for every local-AI user.
        // Industry-aware content (FHIR chunker for healthcare; plain-text
        // otherwise) plus per-framework compliance rules are decided
        // inside the generator, not at the target-selection layer.
        targets.add(TargetFormat.RAG_SCAFFOLD);
      }

      // v3.3 — Local router auto-includes when the user opted into the
      // hybrid-dispatch service via TECH_019. Independent of localAiEnabled
      // because the router is the integration point — though in practice the
      // wizard only surfaces TECH_019 once TECH_013 is yes.
      if (config.profile.routerEnabled && !isNonTechnical) {
        targets.add(TargetFormat.LOCAL_ROUTER);
      }

      span.setAttribute('embediq.targets', Array.from(targets).sort().join(','));

      // Filter by target first, then drop technical-only Claude generators
      // when the active role is non-technical. Non-Claude targets already
      // render role-appropriate output internally. Local-AI targets are
      // never emitted for BA/PM/exec roles — those personas don't have an
      // Ollama / Aider setup.
      const applicable = this.generators.filter((g) => {
        if (!targets.has(g.target)) return false;
        if (isNonTechnical && g.target === TargetFormat.CLAUDE && this.isTechnicalOnlyGenerator(g.name, config.profile)) {
          return false;
        }
        if (isNonTechnical && this.isLocalAiTarget(g.target)) {
          return false;
        }
        return true;
      });

      span.setAttribute('embediq.generator_count', applicable.length);
      this.bus.emit('generation:started', { generatorCount: applicable.length });

      // Run all generators in parallel — each is pure (reads config, returns files).
      // Emit file:generated per file as each generator completes so subscribers
      // see progress while others are still running.
      // v4.0 — Track per-generator attribution so the provenance
      // trace can record authoritative generator/target for each file.
      // Safe to mutate from inside Promise callbacks because JavaScript's
      // microtask scheduler runs them sequentially.
      const generatorByPath = new Map<string, string>();
      const targetByPath = new Map<string, string>();
      const results = await Promise.all(
        applicable.map(generator =>
          withSpan(`generator.${generator.name}`, undefined, async () => {
            const files = await generator.generate(config);
            for (const file of files) {
              generatorByPath.set(file.relativePath, generator.name);
              targetByPath.set(file.relativePath, generator.target);
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
        // Mark the overlay's authoritative attribution so the provenance
        // trace can record that CLAUDE.md is the coworker variant for this
        // run, not the default claude-md generator output.
        generatorByPath.set(coworkerClaudeMd.relativePath, 'coworker-claude-md');
        targetByPath.set(coworkerClaudeMd.relativePath, TargetFormat.CLAUDE);
      }

      // Per-agent SETUP.md — emits whenever the user generated at least one
      // agent-target file (Claude / Cursor / Copilot / Gemini / Windsurf /
      // AGENTS.md). Skipped when the run is governance-only (an isolated
      // OSCAL or AIBOM or provenance emission has no harness to set up).
      // Content is tailored to the chosen agent set; default is Claude when
      // nothing else is picked.
      const agentTargets: readonly TargetFormat[] = [
        TargetFormat.CLAUDE,
        TargetFormat.AGENTS_MD,
        TargetFormat.CURSOR,
        TargetFormat.COPILOT,
        TargetFormat.GEMINI,
        TargetFormat.WINDSURF,
      ];
      const hasAgentTarget = agentTargets.some((t) => targets.has(t));
      if (hasAgentTarget) {
        const setupGen = new SetupInstructionsGenerator();
        const setupFiles = setupGen.generate(config);
        for (const f of setupFiles) {
          allFiles.push(f);
          generatorByPath.set(f.relativePath, 'setup-instructions');
          targetByPath.set(f.relativePath, TargetFormat.CLAUDE);
          this.bus.emit('file:generated', {
            relativePath: f.relativePath,
            size: f.content.length,
          });
        }
      }

      // v4.0 + the v4.0 governance outputs — governance-output post-pass. Opt-in only
      // via the explicit OSCAL / CycloneDX targets; existing goldens
      // stay byte-identical. Run AFTER the parallel batch so each
      // document's artifact manifest names every file emitted in this
      // run. The version resolver is cached so multiple governance
      // outputs share one read.
      //
      // Order matters: AIBOM describes the AI components, the
      // OSCAL component-definition describes the product, and
      // the OSCAL SSP fragment describes the deployment — each
      // later step's manifest includes the earlier files.
      const needsEmbediqVersion = targets.has(TargetFormat.OSCAL_COMPONENT)
        || targets.has(TargetFormat.OSCAL_SSP_FRAGMENT)
        || targets.has(TargetFormat.CYCLONEDX_AIBOM)
        || targets.has(TargetFormat.PROVENANCE);
      const embediqVersion = needsEmbediqVersion ? await resolveEmbediqVersion() : '';

      if (targets.has(TargetFormat.CYCLONEDX_AIBOM)) {
        const aibom = generateCycloneDxAibom(config, allFiles, embediqVersion);
        allFiles.push(aibom);
        generatorByPath.set(aibom.relativePath, 'cyclonedx-aibom');
        targetByPath.set(aibom.relativePath, TargetFormat.CYCLONEDX_AIBOM);
        this.bus.emit('file:generated', {
          relativePath: aibom.relativePath,
          size: aibom.content.length,
        });
      }

      if (targets.has(TargetFormat.OSCAL_COMPONENT)) {
        const componentDef = generateOscalComponentDefinition(config, allFiles, embediqVersion);
        allFiles.push(componentDef);
        generatorByPath.set(componentDef.relativePath, 'oscal-component');
        targetByPath.set(componentDef.relativePath, TargetFormat.OSCAL_COMPONENT);
        this.bus.emit('file:generated', {
          relativePath: componentDef.relativePath,
          size: componentDef.content.length,
        });
      }

      if (targets.has(TargetFormat.OSCAL_SSP_FRAGMENT)) {
        const sspFragment = generateOscalSspFragment(config, allFiles, embediqVersion);
        allFiles.push(sspFragment);
        generatorByPath.set(sspFragment.relativePath, 'oscal-ssp-fragment');
        targetByPath.set(sspFragment.relativePath, TargetFormat.OSCAL_SSP_FRAGMENT);
        this.bus.emit('file:generated', {
          relativePath: sspFragment.relativePath,
          size: sspFragment.content.length,
        });
      }

      // v4.0 — Provenance trace fires LAST so its manifest covers
      // every other output (regular generators + coworker overlay +
      // the v4.0 governance outputs). The trace records itself too: a placeholder
      // manifest entry is added to the file list passed to the builder
      // before the real content is computed, so the document includes
      // its own row alongside every other file.
      if (targets.has(TargetFormat.PROVENANCE)) {
        const provenancePath = '.embediq/provenance/manifest.json';
        generatorByPath.set(provenancePath, 'provenance-trace');
        targetByPath.set(provenancePath, TargetFormat.PROVENANCE);
        const placeholder: GeneratedFile = {
          relativePath: provenancePath,
          content: '',
          description: 'Provenance trace — per-file authoritative generator attribution + heuristic driver inference',
        };
        const filesForTrace: readonly GeneratedFile[] = [...allFiles, placeholder];
        const provenance = generateProvenanceTrace(
          config,
          filesForTrace,
          generatorByPath,
          targetByPath,
          Array.from(targets),
          embediqVersion,
        );
        allFiles.push(provenance);
        this.bus.emit('file:generated', {
          relativePath: provenance.relativePath,
          size: provenance.content.length,
        });
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

  private isTechnicalOnlyGenerator(name: string, profile?: UserProfile): boolean {
    // `association-map` is genuinely dev-only (file path → owning team mapping)
    // — non-technical roles have no use for it regardless of compliance.
    if (name === 'association-map') return true;

    // `hooks` are skipped for non-technical roles BY DEFAULT — but compliance
    // frameworks override this. A clinical SME or BPO operations lead using
    // Claude on PHI-bearing content still needs the DLP scanner, audit
    // logger, and command guard. Compliance trumps role-based filtering.
    if (name === 'hooks') {
      if (!profile) return true;
      const enforcedFrameworks = ['hipaa', 'pci', 'soc2', 'gdpr', 'ferpa'];
      const hasEnforcedCompliance = profile.complianceFrameworks.some((fw) =>
        enforcedFrameworks.includes(fw),
      );
      return !hasEnforcedCompliance;
    }

    return false;
  }

  private isLocalAiTarget(target: TargetFormat): boolean {
    return (
      target === TargetFormat.CONTINUE_DEV ||
      target === TargetFormat.AIDER ||
      target === TargetFormat.ZED_AI ||
      target === TargetFormat.OLLAMA ||
      target === TargetFormat.RAG_SCAFFOLD ||
      target === TargetFormat.LOCAL_ROUTER
    );
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

    this.addIndustrySpecificWorkflows(lines, profile);

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

  /**
   * Adds industry-specific workflow bullets to the non-technical
   * coworker CLAUDE.md so the output reads as credible to a domain
   * audience (BPO operations, clinical SMEs, healthcare executives).
   *
   * Industry-generic framing — bullets reference the role's
   * responsibilities in the domain ("member services rep", "PA
   * reviewer", "utilization-review committee") rather than any specific
   * customer's terminology or systems. Per-customer customization is
   * the job of external plugins, not the core generator.
   *
   * Currently covers healthcare for non-technical roles (ba / pm /
   * executive). Other industries follow the same shape — add cases as
   * domain content is validated against real customer conversations.
   */
  private addIndustrySpecificWorkflows(
    lines: string[],
    profile: UserProfile,
  ): void {
    if (profile.industry !== 'healthcare') return;
    if (!['ba', 'pm', 'executive'].includes(profile.role)) return;

    lines.push('## Industry-Specific Workflows', '');

    switch (profile.role) {
      case 'ba':
        lines.push(
          '- Review medical-necessity criteria from payer policies and clinical guidelines',
          '- Map prior-authorization (PA) workflows from intake → determination → appeal',
          '- Summarize provider documentation for utilization-review (UM) committees',
          '- Validate claims-adjudication logic against HIPAA and state-specific requirements',
          '- Translate between payer policy language and clinical decision-support content',
          '- Identify audit-trail gaps when reviewing denied claims for appealability',
        );
        break;
      case 'pm':
        lines.push(
          '- Design member-services and provider-services call scripts grounded in current payer policies',
          '- Coordinate cross-functional workflows across claims, UM, member services, and appeals',
          '- Build process documentation for new payer-client onboarding',
          '- Track operational metrics (AHT, first-pass accuracy, denial overturn rate) and surface trends',
          '- Maintain BAA-driven operational controls (minimum-necessary access, audit-log retention)',
          '- Prepare client-facing operational dashboards and SLA reports',
        );
        break;
      case 'executive':
        lines.push(
          '- Summarize regulatory exposure across HIPAA, state privacy laws, and payer BAA obligations',
          '- Review AI deployment KPIs — workforce adoption, governance violations caught, cost per resolution',
          '- Analyze strategic trade-offs between automation depth and clinical-defensibility risk',
          '- Draft board-level communications on workforce AI strategy and outcomes',
          '- Benchmark organizational AI maturity against industry peers',
          '- Review compliance audit reports (Drata / Vanta / internal) for board-level attestation',
        );
        break;
    }

    lines.push('');
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

/**
 * Resolve the EmbedIQ producer version for OSCAL outputs. Cached after
 * first read; falls back to 'unknown' on filesystem failures so a
 * malformed package.json never blocks generation. Same pattern as
 * `evaluator.ts`'s generator-version cache (duplicated rather than
 * shared because both call sites are small and the indirection cost
 * outweighs the dedup).
 */
let cachedEmbediqVersion: string | null = null;
async function resolveEmbediqVersion(): Promise<string> {
  if (cachedEmbediqVersion != null) return cachedEmbediqVersion;
  try {
    const url = new URL('../../package.json', import.meta.url);
    const raw = await readFile(url, 'utf-8');
    const pkg = JSON.parse(raw) as { version?: string };
    cachedEmbediqVersion = pkg.version ?? 'unknown';
  } catch {
    cachedEmbediqVersion = 'unknown';
  }
  return cachedEmbediqVersion;
}
