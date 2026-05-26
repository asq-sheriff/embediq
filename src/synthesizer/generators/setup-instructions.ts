import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { SetupConfig, GeneratedFile, UserProfile } from '../../types/index.js';
import { MarkdownBuilder } from '../../util/markdown-builder.js';

/**
 * Per-agent SETUP guide. Emits `SETUP.md` at the repository root with:
 *   1. Install instructions for each AI coding agent the user selected.
 *   2. Per-file explanation of every artifact the harness produced.
 *   3. How to activate the rules for each agent.
 *   4. Verification steps.
 *   5. Common troubleshooting.
 *
 * Content is driven by `config.targets` (which agents were selected) and the
 * resolved profile (industry, compliance frameworks, role, etc.). The generator
 * carries TargetFormat.CLAUDE so it runs as part of the default harness set —
 * the SETUP.md describes whichever agents the user actually chose, regardless
 * of which targets the user enabled.
 */
export class SetupInstructionsGenerator implements ConfigGenerator {
  name = 'SETUP.md';
  target = TargetFormat.CLAUDE;

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile, targets } = config;
    const selected = new Set(targets ?? []);
    const content = this.render(profile, selected);

    return [
      {
        relativePath: 'SETUP.md',
        content,
        description: 'Per-agent installation, activation, and troubleshooting guide for the generated harness',
      },
    ];
  }

  private render(profile: UserProfile, targets: Set<TargetFormat>): string {
    const md = new MarkdownBuilder();
    md.h1('EmbedIQ — Setup Guide');
    md.paragraph(
      `This guide explains how to install and activate the AI coding agent harness EmbedIQ just generated for **${profile.businessDomain || 'your project'}**. Follow the section that matches each agent your team uses.`,
    );

    // Quick overview
    md.h2('What was generated');
    md.bullet('Path-scoped rules and hooks tailored to your stack and compliance posture.');
    md.bullet('Permission tiers matched to your security tolerance.');
    if (profile.complianceFrameworks.length > 0) {
      md.bullet(`Compliance-specific scaffolding for: ${profile.complianceFrameworks.join(', ')}.`);
    }
    if (profile.localAiEnabled) {
      md.bullet('Local-AI integration files (Ollama, Continue.dev, Aider, Zed AI) for air-gapped operation.');
    }

    // Per-agent installation instructions
    md.h2('Install and activate each agent');

    if (targets.has(TargetFormat.CLAUDE)) {
      md.h3('Claude Code');
      md.paragraph(
        'Files: `CLAUDE.md` (project memory), `.claude/settings.json` (team settings), `.claude/settings.local.json` (personal overrides, gitignored), `.claude/rules/`, `.claude/commands/`, `.claude/agents/`, `.claude/skills/`, `.claude/hooks/`.',
      );
      md.bullet('Install Claude Code: `curl -fsSL https://claude.ai/install.sh | sh` (or via Homebrew: `brew install --cask claude-code`).');
      md.bullet('Open this repository in your terminal and run `claude` — Claude Code reads `CLAUDE.md` automatically.');
      md.bullet('Add `.claude/settings.local.json` to your `.gitignore` (it should already be there). It contains your personal permission tier and shouldn\'t be shared.');
      md.bullet('In Claude Code, type `/rules` to see the active rule list. Type `/commands` to see custom slash commands.');
      md.bullet('Verify hooks are active: run `claude --help` and confirm "PreToolUse/PostToolUse hooks enabled" appears in the startup banner.');
    }

    if (targets.has(TargetFormat.CURSOR)) {
      md.h3('Cursor');
      md.paragraph(
        'Files: `.cursor/rules.mdc` (Cursor MDC rule file).',
      );
      md.bullet('Install Cursor: download from [cursor.com](https://cursor.com) and open this repository.');
      md.bullet('Cursor auto-discovers `.cursor/rules.mdc`. Open Cursor Settings → Rules to confirm it appears.');
      md.bullet('In Cursor chat, ask: "What rules are you currently following?" — it should summarize the project rules.');
    }

    if (targets.has(TargetFormat.COPILOT)) {
      md.h3('GitHub Copilot');
      md.paragraph(
        'Files: `.github/copilot-instructions.md` (project-wide), `.github/instructions/*.md` (scoped per directory).',
      );
      md.bullet('Install Copilot: GitHub Copilot subscription required, then the GitHub Copilot extension for your IDE (VS Code, JetBrains, Visual Studio, Neovim).');
      md.bullet('Copilot Chat reads the instructions file automatically — restart your IDE after the files land.');
      md.bullet('In Copilot Chat, ask: "What instructions are currently active for this project?" to verify.');
    }

    if (targets.has(TargetFormat.GEMINI)) {
      md.h3('Gemini Code Assist');
      md.paragraph(
        'Files: `GEMINI.md` (project memory).',
      );
      md.bullet('Install: enable Gemini Code Assist in your IDE (VS Code or JetBrains) — requires a Google Cloud project.');
      md.bullet('Gemini reads `GEMINI.md` on workspace open. Restart the IDE if you add the file after opening the project.');
    }

    if (targets.has(TargetFormat.WINDSURF)) {
      md.h3('Windsurf');
      md.paragraph(
        'Files: `.windsurfrules` (Windsurf rule file).',
      );
      md.bullet('Install Windsurf: download from [codeium.com/windsurf](https://codeium.com/windsurf).');
      md.bullet('Windsurf reads `.windsurfrules` automatically on workspace open.');
    }

    if (targets.has(TargetFormat.AGENTS_MD)) {
      md.h3('AGENTS.md (universal)');
      md.paragraph(
        'File: `AGENTS.md`. Read by Codex, Cursor (alongside `.cursor/rules.mdc`), Aider, and other tools that support the universal format.',
      );
      md.bullet('No installation step — `AGENTS.md` lives at the repository root and is picked up by any tool that supports the format.');
    }

    if (profile.localAiEnabled) {
      md.h3('Local AI (Ollama)');
      md.paragraph(
        'Files: `OLLAMA.md` (setup runbook). If `Continue.dev` / `Aider` / `Zed AI` are selected, additional config files were written.',
      );
      md.bullet('Install Ollama: `curl -fsSL https://ollama.com/install.sh | sh` (Linux/macOS) or download from [ollama.com](https://ollama.com).');
      md.bullet('Pull the recommended models per `OLLAMA.md` (the runbook lists exact `ollama pull` commands).');
      md.bullet('Start the Ollama daemon: `ollama serve` (runs on `localhost:11434` by default).');
      md.bullet('Air-gapped: skip the `pull` step on the air-gapped host; instead, `ollama pull` on a connected machine, then transfer `~/.ollama/models/` to the target host.');
    }

    if (profile.routerEnabled) {
      md.h3('PHI-safe Local Router');
      md.paragraph(
        'Files: `router/` — runnable Express dispatch service.',
      );
      md.bullet('Install: `cd router && npm install && npm start`.');
      md.bullet('Configure hosted-LLM credentials in `router/.env` (see `router/.env.example`).');
      md.bullet('Test routing: `curl -X POST http://localhost:8080/route -H "Content-Type: application/json" -d \'{"prompt":"What is 2+2?"}\'`.');
    }

    // Verification across all agents
    md.h2('Verification — confirm the harness is wired correctly');
    md.bullet('Open the generated `CLAUDE.md` (or `AGENTS.md` / `GEMINI.md` / etc.) and confirm the project name, languages, and frameworks are correct.');
    md.bullet('In your agent of choice, ask: "What compliance frameworks am I configured for?" — the answer should include: ' + (profile.complianceFrameworks.join(', ') || 'general best practices'));
    md.bullet('Try editing a file in a protected directory. The agent should refuse or surface a blocking hook message.');

    if (profile.complianceFrameworks.includes('hipaa')) {
      md.bullet('HIPAA check: ask the agent to paste a sample SSN or MRN into a code comment. It should refuse and reference the PHI rule.');
    }
    if (profile.complianceFrameworks.includes('pci') || profile.complianceFrameworks.includes('pci-dss')) {
      md.bullet('PCI check: ask the agent to paste a test credit card number. It should refuse and reference the cardholder-data rule.');
    }

    // Troubleshooting
    md.h2('Common troubleshooting');
    md.bullet('**Rules don\'t seem to apply** — the agent often caches rules at startup. Restart the IDE / CLI session after adding or editing rule files.');
    md.bullet('**Permission denied errors on hooks** — Python hooks must be executable. Run `chmod +x .claude/hooks/*.py` from the repo root.');
    md.bullet('**Settings.local.json not respected** — Claude Code only reads it when the file is at the repository root in `.claude/`. Confirm path and re-check `.gitignore` excludes it from commits.');
    md.bullet('**Configuration drifted** — run `make drift` from the EmbedIQ repository to compare the current state against the expected harness. The drift report flags what changed.');
    md.bullet('**Need to regenerate** — re-run the EmbedIQ wizard with the same answers. Output is deterministic — re-running with the same inputs always produces byte-identical files.');

    // Updating
    md.h2('Keeping the harness in sync with policy changes');
    md.paragraph(
      'When your team\'s policies change (new compliance framework, new domain pack, updated permission tier), re-run the EmbedIQ wizard with the updated answers. The new harness is byte-identical for unchanged answers and differs only where your input changed.',
    );
    md.bullet('Re-run interactively: `npm start` from the EmbedIQ repository (or `make start`).');
    md.bullet('Re-run headlessly via the web API: `POST /api/generate` with the updated answer set.');
    md.bullet('Continuous monitoring: set up the EmbedIQ autopilot to scan this repository on a schedule and open a PR when drift is detected.');

    // Where to learn more
    md.h2('Further reading');
    md.bullet('[EmbedIQ project README](https://github.com/asq-sheriff/embediq)');
    md.bullet('[Per-vertical deployment runbooks](https://github.com/asq-sheriff/embediq/tree/main/docs)');
    if (profile.complianceFrameworks.length > 0) {
      md.bullet('Domain-pack documentation: see `docs/extension-guide/` in the EmbedIQ repo for the framework(s) you selected.');
    }

    md.paragraph('');
    md.paragraph('---');
    md.paragraph(`*Generated by EmbedIQ. Re-run the wizard at any time to refresh this guide.*`);

    return md.build();
  }
}
