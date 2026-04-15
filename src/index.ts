#!/usr/bin/env node
import { input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { ConsoleUI } from './ui/console.js';
import { AdaptiveEngine } from './engine/adaptive-engine.js';
import { PlaybackRenderer } from './ui/playback.js';
import { EditCorrectFlow } from './ui/edit-correct.js';
import { SynthesizerOrchestrator } from './synthesizer/orchestrator.js';
import { FileOutputManager } from './util/file-output.js';
import type { SetupConfig } from './types/index.js';

async function main(): Promise<void> {
  const ui = new ConsoleUI();

  // ─── Welcome ───
  ui.banner();

  // ─── Phase 1: Dynamic Q&A ───
  ui.heading('Discovery');
  console.log(chalk.dim('  Let\'s understand your needs.\n'));

  const engine = new AdaptiveEngine(ui);
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
    return;
  }

  const config: SetupConfig = {
    profile: approvedProfile,
    targetDir,
  };

  const synthesizer = new SynthesizerOrchestrator();
  const { files, validation } = synthesizer.generateWithValidation(config);

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

main().catch((err) => {
  if (err instanceof Error && err.message.includes('User force closed')) {
    console.log(chalk.dim('\n  Goodbye.\n'));
  } else {
    console.error(chalk.red(`\n  Error: ${err instanceof Error ? err.message : err}\n`));
    process.exit(1);
  }
});
