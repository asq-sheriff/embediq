import { input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { randomUUID } from 'node:crypto';
import { ConsoleUI } from './ui/console.js';
import { AdaptiveEngine } from './engine/adaptive-engine.js';
import { PlaybackRenderer } from './ui/playback.js';
import { EditCorrectFlow } from './ui/edit-correct.js';
import { SynthesizerOrchestrator } from './synthesizer/orchestrator.js';
import { FileOutputManager } from './util/file-output.js';
import { createRequestContext, getRequestContext, runWithContext } from './context/request-context.js';
import { getEventBus, registerDefaultSubscribers } from './events/index.js';
import { parseTargets, parseTargetsFromEnv } from './synthesizer/target-format.js';
import {
  GitConfigurationError,
  GitIntegrationError,
  openPrForGeneration,
} from './integrations/git/index.js';
import type { SetupConfig } from './types/index.js';

async function runWizard(): Promise<void> {
  const ui = new ConsoleUI();
  const bus = getEventBus();
  const sessionId = getRequestContext()?.sessionId ?? randomUUID();

  bus.emit('session:started', { sessionId });

  // ─── Welcome ───
  ui.banner();

  // ─── Phase 1: Dynamic Q&A ───
  ui.heading('Discovery');
  console.log(chalk.dim('  Let\'s understand your needs.\n'));

  const engine = new AdaptiveEngine(ui, bus);
  const profile = await engine.run();

  // ─── Phase 2: Playback ───
  const renderer = new PlaybackRenderer(ui);
  renderer.render(profile);

  // ─── Phase 3: Edit / Correct / Approve ───
  const editFlow = new EditCorrectFlow(ui);
  const approvedProfile = await editFlow.run(profile);

  // ─── Phase 4: Generate Claude Code Setup ───
  ui.heading('Generate');

  const targetDir = await input({
    message: 'Target project directory (where to write config files):',
    default: process.cwd(),
    validate: (val) => {
      if (!val.trim()) return 'Path cannot be empty';
      return true;
    },
  });

  const proceed = await confirm({
    message: `Write configuration files to ${targetDir}?`,
    default: true,
  });

  if (!proceed) {
    console.log(chalk.dim('\n  Cancelled. No files written.\n'));
    bus.emit('session:completed', { sessionId, fileCount: 0 });
    return;
  }

  const targets = resolveCliTargets();
  const config: SetupConfig = {
    profile: approvedProfile,
    targetDir,
    targets,
  };

  const synthesizer = new SynthesizerOrchestrator(bus);
  const { files, validation } = await synthesizer.generateWithValidation(config);

  // Show validation results
  if (validation.checks.length > 0) {
    ui.blank();
    console.log(chalk.bold('  Validation'));
    for (const check of validation.checks) {
      if (check.passed) {
        console.log(chalk.green(`  ✓ ${check.name}`));
      } else if (check.severity === 'error') {
        console.log(chalk.red(`  ✗ ${check.name}`));
        console.log(chalk.dim(`      ${check.message}`));
      } else {
        console.log(chalk.yellow(`  ⚠ ${check.name}`));
        console.log(chalk.dim(`      ${check.message}`));
      }
    }
    ui.blank();
    console.log(chalk.dim(`  ${validation.summary}`));
    ui.blank();
  }

  const outputManager = new FileOutputManager(targetDir);
  outputManager.ensureTargetDir();
  const { written, errors } = outputManager.writeAll(files);

  // ─── Optional: push to a git branch and open a PR ───
  // Opt-in via `--git-pr`. Environment variables supply the repo/token/base
  // (EMBEDIQ_GIT_REPO / EMBEDIQ_GIT_TOKEN / EMBEDIQ_GIT_BASE_BRANCH).
  // Failures here are surfaced but do not fail the on-disk write.
  if (shouldOpenGitPr()) {
    try {
      const result = await openPrForGeneration({
        files,
        profile: approvedProfile,
        validation,
      });
      ui.blank();
      console.log(chalk.green(`  ✓ Opened ${result.pullRequest.url}`));
      console.log(chalk.dim(`      Branch: ${result.branchName}`));
    } catch (err) {
      ui.blank();
      if (err instanceof GitConfigurationError) {
        console.log(chalk.red(`  ✗ Git PR skipped: ${err.message}`));
      } else if (err instanceof GitIntegrationError) {
        console.log(chalk.red(`  ✗ Git PR failed: ${err.message}`));
      } else {
        console.log(chalk.red(`  ✗ Git PR failed: ${err instanceof Error ? err.message : String(err)}`));
      }
    }
  }

  bus.emit('session:completed', { sessionId, fileCount: written.length });

  // Results
  ui.blank();
  console.log(chalk.white('  ┌─────────────────────────────────────────┐'));
  console.log(chalk.white('  │                                         │'));
  console.log(chalk.white('  │   ') + chalk.bold.white('EmbedIQ') + chalk.dim('  Setup Complete') + chalk.white('           │'));
  console.log(chalk.white('  │                                         │'));
  console.log(chalk.white('  └─────────────────────────────────────────┘'));
  ui.blank();

  for (const file of files) {
    const status = written.includes(file.relativePath)
      ? chalk.green('  ✓')
      : chalk.red('  ✗');
    console.log(`${status} ${chalk.white(file.relativePath)}`);
    console.log(chalk.dim(`      ${file.description}`));
  }

  if (errors.length > 0) {
    ui.blank();
    for (const err of errors) {
      ui.error(err);
    }
  }

  ui.blank();
  console.log(chalk.dim(`  ${written.length} files generated in ${targetDir}`));

  const isNonTechnical = ['ba', 'pm', 'executive'].includes(approvedProfile.role);
  if (isNonTechnical) {
    ui.blank();
    console.log(chalk.dim('  Your Claude coworker setup is ready.'));
    console.log(chalk.dim('  Run `claude` in your project directory to start.'));
  } else {
    ui.blank();
    console.log(chalk.dim('  Your Claude Code development environment is ready.'));
    console.log(chalk.dim('  Run `claude` in your project directory to start.'));
    console.log(chalk.dim('  Copy .mcp.json.template to .mcp.json and add your API keys.'));
  }

  ui.blank();
}

/**
 * Resolve output targets for the CLI from `--targets a,b,c` (argv) first,
 * falling back to `EMBEDIQ_OUTPUT_TARGETS` env, then the default (Claude).
 */
function resolveCliTargets() {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--targets' && argv[i + 1]) return parseTargets(argv[i + 1]);
    if (arg.startsWith('--targets=')) return parseTargets(arg.slice('--targets='.length));
  }
  return parseTargetsFromEnv();
}

/**
 * Trigger the git PR flow only when `--git-pr` is present on argv. Env
 * vars alone are not enough — PR creation is a user-visible action
 * and must be requested explicitly.
 */
function shouldOpenGitPr(): boolean {
  return process.argv.slice(2).includes('--git-pr');
}

async function main(): Promise<void> {
  const { teardown } = registerDefaultSubscribers(getEventBus(), {
    enableAudit: true,
    enableMetrics: true,
  });
  const ctx = createRequestContext({ sessionId: randomUUID() });
  try {
    await runWithContext(ctx, runWizard);
  } finally {
    teardown();
  }
}

main().catch((err) => {
  if (err instanceof Error && err.message.includes('User force closed')) {
    console.log(chalk.dim('\n  Goodbye.\n'));
  } else {
    console.error(chalk.red(`\n  Error: ${err instanceof Error ? err.message : err}\n`));
    process.exit(1);
  }
});
