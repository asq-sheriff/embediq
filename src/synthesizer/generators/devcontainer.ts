import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { SetupConfig, GeneratedFile, UserProfile } from '../../types/index.js';

/** Primary-language → devcontainer base image. Falls back to a plain Ubuntu base. */
const IMAGE_BY_LANGUAGE: Record<string, string> = {
  typescript: 'mcr.microsoft.com/devcontainers/typescript-node:22',
  javascript: 'mcr.microsoft.com/devcontainers/typescript-node:22',
  python: 'mcr.microsoft.com/devcontainers/python:3.12',
  go: 'mcr.microsoft.com/devcontainers/go:1.22',
  java: 'mcr.microsoft.com/devcontainers/java:21',
  csharp: 'mcr.microsoft.com/devcontainers/dotnet:8.0',
  rust: 'mcr.microsoft.com/devcontainers/rust:1',
};

/**
 * Emits a `.devcontainer/` (devcontainer.json + README) when the team's agent
 * isolation posture is a dev container (TECH_023 → `isolationModel ===
 * 'dev_container'`). The container gives the agent + toolchain + exactly one
 * project a reproducible, firewall-restricted boundary — the rung above the
 * native OS sandbox and the right home for `--dangerously-skip-permissions`.
 *
 * Carries `TargetFormat.CLAUDE`. No-op for non-technical roles and any other
 * isolation posture, so existing archetypes regenerate byte-identically.
 */
export class DevContainerGenerator implements ConfigGenerator {
  name = 'devcontainer';
  target = TargetFormat.CLAUDE;

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    if (['ba', 'pm', 'executive'].includes(profile.role)) return [];
    if ((profile.devOps.isolationModel ?? '') !== 'dev_container') return [];

    return [
      {
        relativePath: '.devcontainer/devcontainer.json',
        content: JSON.stringify(buildDevContainer(profile), null, 2) + '\n',
        description: 'Dev container that isolates the coding agent + toolchain + this project',
      },
      {
        relativePath: '.devcontainer/README.md',
        content: renderReadme(profile),
        description: 'How to use the dev container, and where --dangerously-skip-permissions is safe',
      },
    ];
  }
}

function buildDevContainer(profile: UserProfile): Record<string, unknown> {
  const primary = profile.languages.find((l) => IMAGE_BY_LANGUAGE[l]);
  const image = primary ? IMAGE_BY_LANGUAGE[primary] : 'mcr.microsoft.com/devcontainers/base:ubuntu';
  const name = `${profile.businessDomain || 'Project'} — Claude Code sandbox`;

  return {
    name,
    image,
    // Claude Code runs on Node.js; ensure it's present even on non-Node bases.
    features: {
      'ghcr.io/devcontainers/features/node:1': {},
    },
    // NET_ADMIN/NET_RAW let an init firewall restrict the container's egress to
    // an allowlist (package registries, your git host) — see Anthropic's
    // reference devcontainer. Tighten `postCreateCommand` to run your firewall
    // script if you adopt one.
    runArgs: ['--cap-add=NET_ADMIN', '--cap-add=NET_RAW'],
    postCreateCommand: 'npm install -g @anthropic-ai/claude-code',
    customizations: {
      vscode: {
        extensions: ['anthropic.claude-code'],
      },
    },
  };
}

function renderReadme(profile: UserProfile): string {
  return [
    '<!-- audience: public -->',
    '',
    '# Dev container — coding-agent sandbox',
    '',
    'This `.devcontainer/` isolates the AI coding agent, the toolchain, and this',
    'one project inside a reproducible container with a restricted egress path. It',
    'is the rung above the native OS sandbox: a cleaner boundary for headless and',
    'unattended runs.',
    '',
    '## Use it',
    '',
    '1. Open the project in VS Code / Cursor and choose **"Reopen in Container"**',
    '   (or `devcontainer up` with the CLI).',
    '2. Claude Code is installed on container create (`postCreateCommand`).',
    '',
    '## Where `--dangerously-skip-permissions` is safe',
    '',
    '- **Only inside this container**, and **only for repositories you trust.** The',
    '  container is the boundary that makes unattended, permission-skipped runs',
    '  acceptable. **Never** pass that flag on a developer laptop or host shell.',
    '- A dev container **shares the host kernel** — it is not VM-grade isolation.',
    '  For untrusted code or multi-tenant infrastructure, step up to a microVM or a',
    '  full VM / ephemeral cloud dev environment.',
    '- **Do not mount host secrets** into the container; with skip-permissions a',
    '  malicious repo could read anything reachable inside it.',
    '',
    "See EmbedIQ's [isolation decision guide](https://github.com/asq-sheriff/embediq/blob/main/docs/evaluators/isolation-decision-guide.md).",
    '',
  ].join('\n');
}
