import type { SetupConfig, UserProfile } from '../../types/index.js';
import type { ProvenanceDriver } from './types.js';

/**
 * Heuristic catalog mapping file-path patterns to the profile fields
 * / target selections that cause the file to be emitted. Order matters:
 * the matcher returns the FIRST matching rule's drivers. More specific
 * patterns come first so they don't get swallowed by broader ones.
 *
 * When a generator changes what it emits — new file pattern, new
 * field-driven condition — add a rule here so the provenance trace
 * keeps explaining the new files faithfully.
 */
export interface HeuristicRule {
  /** Stable identifier; surfaces in `matchedHeuristic` on each entry. */
  name: string;
  /** Regex that matches the file's relative path. */
  pattern: RegExp;
  /** Build the driver list given the matched config + regex match groups. */
  drivers: (config: SetupConfig, match: RegExpMatchArray) => ProvenanceDriver[];
}

const profile = (config: SetupConfig): UserProfile => config.profile;

// ─── Helpers ────────────────────────────────────────────────────────────

function targetDriver(target: string, description: string): ProvenanceDriver {
  return { type: 'target', field: 'targets', value: target, description };
}

function frameworkDriver(framework: string, description: string): ProvenanceDriver {
  return { type: 'compliance-framework', field: 'complianceFrameworks', value: framework, description };
}

function profileFieldDriver(
  field: keyof UserProfile,
  description: string,
  value?: string,
): ProvenanceDriver {
  return { type: 'profile-field', field: String(field), value, description };
}

function optInFlagDriver(field: keyof UserProfile, description: string): ProvenanceDriver {
  return { type: 'opt-in-flag', field: String(field), value: 'true', description };
}

function industryDriver(industry: string, description: string): ProvenanceDriver {
  return { type: 'industry', field: 'industry', value: industry, description };
}

// ─── Rule catalog ───────────────────────────────────────────────────────

export const DRIVER_HEURISTICS: readonly HeuristicRule[] = [
  // ── v4.0 governance post-pass outputs ──────────────────────────────────
  {
    name: 'oscal-component-definition-output',
    pattern: /^\.embediq\/oscal\/component-definition\.json$/,
    drivers: () => [
      targetDriver('oscal-component', 'Operator selected the oscal-component target.'),
    ],
  },
  {
    name: 'oscal-ssp-fragment-output',
    pattern: /^\.embediq\/oscal\/ssp-fragment\.json$/,
    drivers: () => [
      targetDriver('oscal-ssp-fragment', 'Operator selected the oscal-ssp-fragment target.'),
    ],
  },
  {
    name: 'cyclonedx-aibom-output',
    pattern: /^\.embediq\/cyclonedx\/aibom\.json$/,
    drivers: () => [
      targetDriver('cyclonedx-aibom', 'Operator selected the cyclonedx-aibom target.'),
    ],
  },
  {
    name: 'provenance-manifest-output',
    pattern: /^\.embediq\/provenance\/manifest\.json$/,
    drivers: () => [
      targetDriver('provenance', 'Operator selected the provenance target (this file).'),
    ],
  },

  // ── Compliance-framework rule files ───────────────────────────────────
  {
    name: 'compliance-rule-file',
    pattern: /^\.claude\/rules\/(hipaa|pci|soc2|ferpa|gdpr|sox|hitech)-compliance\.md$/,
    drivers: (_, match) => [
      frameworkDriver(match[1], `Compliance rule file for ${match[1].toUpperCase()}.`),
    ],
  },
  {
    name: 'rag-compliance-rule-file',
    pattern: /^\.claude\/rules\/rag-(hipaa|pci|soc2|ferpa|gdpr)-compliance\.md$/,
    drivers: (_, match) => [
      frameworkDriver(match[1], `Path-scoped RAG compliance rule for ${match[1].toUpperCase()}.`),
      optInFlagDriver('localAiEnabled', 'User opted into local-AI / RAG scaffold.'),
    ],
  },

  // ── Language rule files ────────────────────────────────────────────────
  {
    name: 'language-rule-file',
    pattern: /^\.claude\/rules\/(typescript|python|java|go|rust|csharp|swift|ruby)\.md$/,
    drivers: (_, match) => [
      { type: 'language', field: 'languages', value: match[1], description: `Language-specific rules for ${match[1]}.` },
    ],
  },

  // ── Core Claude Code outputs ───────────────────────────────────────────
  {
    name: 'claude-md-root',
    pattern: /^CLAUDE\.md$/,
    drivers: (config) => {
      const drivers: ProvenanceDriver[] = [
        profileFieldDriver('role', `Role-aware CLAUDE.md content.`, profile(config).role),
        targetDriver('claude', 'Claude Code is the default and selected target.'),
      ];
      if (profile(config).industry) {
        drivers.push(industryDriver(profile(config).industry, 'Industry-aware framing.'));
      }
      if (profile(config).languages.length > 0) {
        drivers.push(profileFieldDriver('languages', 'Language list shapes recommended tooling section.'));
      }
      return drivers;
    },
  },
  {
    name: 'claude-settings',
    pattern: /^\.claude\/settings(\.local)?\.json$/,
    drivers: (config) => {
      const drivers: ProvenanceDriver[] = [
        targetDriver('claude', 'Claude Code settings file.'),
      ];
      if (profile(config).securityConcerns.length > 0) {
        drivers.push(profileFieldDriver('securityConcerns', 'Permission tiers gated by security concerns.'));
      }
      return drivers;
    },
  },
  {
    name: 'claude-rules-generic',
    pattern: /^\.claude\/rules\/.+\.md$/,
    drivers: () => [
      targetDriver('claude', 'Claude Code rule files emitted by the rules generator.'),
    ],
  },
  {
    name: 'claude-commands',
    pattern: /^\.claude\/commands\/.+/,
    drivers: (config) => [
      targetDriver('claude', 'Claude Code custom commands.'),
      profileFieldDriver('role', 'Command set tailored to role.', profile(config).role),
    ],
  },
  {
    name: 'claude-agents',
    pattern: /^\.claude\/agents\/.+/,
    drivers: (config) => [
      targetDriver('claude', 'Claude Code sub-agent definitions.'),
      profileFieldDriver('role', 'Agent definitions tailored to role.', profile(config).role),
    ],
  },
  {
    name: 'claude-skills',
    pattern: /^\.claude\/skills\/.+/,
    drivers: (config) => {
      const drivers: ProvenanceDriver[] = [
        targetDriver('claude', 'Claude Code skill markdown.'),
      ];
      if (profile(config).complianceFrameworks.length > 0) {
        drivers.push(profileFieldDriver('complianceFrameworks', 'Skill content reflects active frameworks.'));
      }
      return drivers;
    },
  },
  {
    name: 'claude-hooks',
    pattern: /^\.claude\/hooks\/.+/,
    drivers: (config) => {
      const drivers: ProvenanceDriver[] = [
        targetDriver('claude', 'Claude Code hook scripts.'),
      ];
      if (profile(config).securityConcerns.includes('dlp')) {
        drivers.push({ type: 'security-concern', field: 'securityConcerns', value: 'dlp', description: 'DLP scanner is included.' });
      }
      if (profile(config).complianceFrameworks.length > 0) {
        drivers.push(profileFieldDriver('complianceFrameworks', 'Pre-tool DLP patterns come from active frameworks.'));
      }
      return drivers;
    },
  },
  {
    name: 'claude-ignore',
    pattern: /^\.claudeignore$|^\.claude\/.*ignore.*$/,
    drivers: (config) => {
      const drivers: ProvenanceDriver[] = [
        targetDriver('claude', 'Claude Code ignore file.'),
      ];
      if (profile(config).securityConcerns.includes('phi')) {
        drivers.push({ type: 'security-concern', field: 'securityConcerns', value: 'phi', description: 'PHI directories are ignored.' });
      }
      return drivers;
    },
  },
  {
    name: 'mcp-config',
    pattern: /^\.mcp\.json$|^\.claude\/mcp\.json$/,
    drivers: () => [
      targetDriver('claude', 'MCP server configuration template.'),
    ],
  },
  {
    name: 'claude-association-map',
    pattern: /^\.claude\/.*association.*\.json$/,
    drivers: () => [
      targetDriver('claude', 'Path → owning-team association map (developer roles only).'),
    ],
  },
  {
    name: 'claude-document-state',
    pattern: /^\.claude\/.*document.*state.*$/,
    drivers: () => [
      targetDriver('claude', 'Claude Code document-state metadata.'),
    ],
  },

  // ── Multi-agent targets (v3.1) ───────────────────────────────────
  {
    name: 'agents-md-output',
    pattern: /^AGENTS\.md$/,
    drivers: () => [
      targetDriver('agents-md', 'Operator selected the agents-md target.'),
    ],
  },
  {
    name: 'cursor-rules-output',
    pattern: /^\.cursor\/rules\/.+/,
    drivers: () => [
      targetDriver('cursor', 'Operator selected the cursor target.'),
    ],
  },
  {
    name: 'copilot-instructions-output',
    pattern: /^\.github\/(copilot|instructions).*/,
    drivers: () => [
      targetDriver('copilot', 'Operator selected the copilot target.'),
    ],
  },
  {
    name: 'gemini-md-output',
    pattern: /^GEMINI\.md$/,
    drivers: () => [
      targetDriver('gemini', 'Operator selected the gemini target.'),
    ],
  },
  {
    name: 'windsurf-rules-output',
    pattern: /^\.windsurfrules$/,
    drivers: () => [
      targetDriver('windsurf', 'Operator selected the windsurf target.'),
    ],
  },

  // ── Local-AI targets (v3.3) ──────────────────────────────────────
  {
    name: 'continue-dev-output',
    pattern: /^(\.continue\/|continue\/)/,
    drivers: () => [
      optInFlagDriver('localAiEnabled', 'User opted into local-AI.'),
      profileFieldDriver('ideIntegrations', 'ideIntegrations includes continue-dev.', 'continue-dev'),
    ],
  },
  {
    name: 'aider-output',
    pattern: /^(\.aider|aider)/,
    drivers: () => [
      optInFlagDriver('localAiEnabled', 'User opted into local-AI.'),
      profileFieldDriver('ideIntegrations', 'ideIntegrations includes aider.', 'aider'),
    ],
  },
  {
    name: 'zed-ai-output',
    pattern: /^\.zed\//,
    drivers: () => [
      optInFlagDriver('localAiEnabled', 'User opted into local-AI.'),
      profileFieldDriver('ideIntegrations', 'ideIntegrations includes zed-ai.', 'zed-ai'),
    ],
  },
  {
    name: 'ollama-output',
    pattern: /^ollama|^\.ollama/,
    drivers: () => [
      optInFlagDriver('localAiEnabled', 'User opted into local-AI.'),
    ],
  },

  // ── RAG scaffold (v3.3) ──────────────────────────────────────────
  {
    name: 'rag-scaffold-output',
    pattern: /^rag\//,
    drivers: (config) => {
      const drivers: ProvenanceDriver[] = [
        optInFlagDriver('localAiEnabled', 'User opted into local-AI, which auto-includes the RAG scaffold.'),
      ];
      if (profile(config).industry === 'healthcare') {
        drivers.push(industryDriver('healthcare', 'Healthcare industry triggers FHIR-aware chunker variant.'));
      }
      return drivers;
    },
  },

  // ── Local router (v3.3) ──────────────────────────────────────────
  {
    name: 'local-router-output',
    pattern: /^router\//,
    drivers: (config) => {
      const drivers: ProvenanceDriver[] = [
        optInFlagDriver('routerEnabled', 'User opted into the local-router service.'),
      ];
      if (profile(config).confidenceEscalation) {
        drivers.push(optInFlagDriver('confidenceEscalation', 'Router includes the confidence-self-eval module.'));
      }
      if (profile(config).complianceFrameworks.includes('hipaa')) {
        drivers.push(frameworkDriver('hipaa', 'HIPAA active → router includes the PHI redactor module.'));
      }
      return drivers;
    },
  },

  // ── Router runbook (path-scoped rule companion) ───────────────────────
  {
    name: 'router-runbook',
    pattern: /^ROUTER_RUNBOOK\.md$/,
    drivers: () => [
      optInFlagDriver('routerEnabled', 'User opted into the local-router service.'),
    ],
  },
];

/**
 * Find the first matching heuristic for a file. Returns `null` when no
 * rule matches — the trace records the file with empty `drivers` and an
 * undefined `matchedHeuristic`, signaling that the file's drivers
 * require manual inspection (custom domain pack, external skill, etc.).
 */
export function matchHeuristic(
  relativePath: string,
  config: SetupConfig,
): { rule: HeuristicRule; drivers: readonly ProvenanceDriver[] } | null {
  for (const rule of DRIVER_HEURISTICS) {
    const match = rule.pattern.exec(relativePath);
    if (match) {
      return { rule, drivers: rule.drivers(config, match) };
    }
  }
  return null;
}
