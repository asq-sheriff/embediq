import { input, select, checkbox, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import type { Question, QuestionType, Answer, AnswerOption, DimensionProgress, Dimension } from '../types/index.js';

export class ConsoleUI {
  banner(): void {
    console.log('');
    console.log(chalk.white('  ┌─────────────────────────────────────────┐'));
    console.log(chalk.white('  │                                         │'));
    console.log(chalk.white('  │   ') + chalk.bold.white('EmbedIQ') + chalk.dim(' by Praglogic') + chalk.white('                │'));
    console.log(chalk.white('  │   ') + chalk.dim('Claude Code Setup Wizard') + chalk.white('          │'));
    console.log(chalk.white('  │                                         │'));
    console.log(chalk.white('  └─────────────────────────────────────────┘'));
    console.log('');
    console.log(chalk.dim('  Answer a few questions. We\'ll handle the rest.'));
    console.log('');
  }

  dimensionHeader(dimension: string, index: number, total: number): void {
    console.log('');
    console.log(chalk.yellow(`─── ${dimension} (${index}/${total}) ───`));
    console.log('');
  }

  progressBar(progress: DimensionProgress[]): void {
    for (const p of progress) {
      const pct = p.total > 0 ? Math.round((p.answered / p.total) * 100) : 0;
      const filled = Math.round(pct / 5);
      const bar = chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(20 - filled));
      const label = p.dimension.padEnd(28);
      console.log(`  ${chalk.dim(label)} ${bar} ${pct}%`);
    }
    console.log('');
  }

  async askQuestion(question: Question, questionNum: number, totalInDimension: number): Promise<Answer> {
    const prefix = chalk.dim(`[${questionNum}/${totalInDimension}]`);

    if (question.helpText) {
      console.log(chalk.dim(`  ℹ ${question.helpText}`));
    }

    let value: string | string[] | number | boolean;

    switch (question.type) {
      case 'free_text':
        value = await input({
          message: `${prefix} ${question.text}`,
          required: question.required,
        });
        break;

      case 'single_choice':
        value = await select({
          message: `${prefix} ${question.text}`,
          choices: (question.options ?? []).map(o => ({
            value: o.key,
            name: o.label,
            description: o.description,
          })),
        });
        break;

      case 'multi_choice':
        value = await checkbox({
          message: `${prefix} ${question.text}`,
          choices: (question.options ?? []).map(o => ({
            value: o.key,
            name: o.label,
            description: o.description,
          })),
          required: question.required,
        });
        break;

      case 'scale':
        value = await select({
          message: `${prefix} ${question.text}`,
          choices: [
            { value: '1', name: '1 - Not at all' },
            { value: '2', name: '2 - Slightly' },
            { value: '3', name: '3 - Moderately' },
            { value: '4', name: '4 - Very' },
            { value: '5', name: '5 - Extremely' },
          ],
        });
        value = parseInt(value as string, 10);
        break;

      case 'yes_no':
        value = await confirm({
          message: `${prefix} ${question.text}`,
          default: false,
        });
        break;

      default:
        value = await input({
          message: `${prefix} ${question.text}`,
        });
    }

    return {
      questionId: question.id,
      value,
      timestamp: new Date(),
    };
  }

  info(message: string): void {
    console.log(chalk.blue(`  ${message}`));
  }

  success(message: string): void {
    console.log(chalk.green(`  ✓ ${message}`));
  }

  warn(message: string): void {
    console.log(chalk.yellow(`  ⚠ ${message}`));
  }

  error(message: string): void {
    console.log(chalk.red(`  ✗ ${message}`));
  }

  separator(): void {
    console.log(chalk.dim('  ─────────────────────────────────────────'));
  }

  blank(): void {
    console.log('');
  }

  heading(text: string): void {
    console.log('');
    console.log(chalk.bold.white(text));
    console.log(chalk.dim('═'.repeat(text.length)));
    console.log('');
  }

  keyValue(key: string, value: string): void {
    console.log(`  ${chalk.bold(key.padEnd(24))} ${value}`);
  }

  list(items: string[]): void {
    for (const item of items) {
      console.log(`    • ${item}`);
    }
  }
}
