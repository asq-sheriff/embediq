import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  detectDrift,
  DriftError,
  renderDriftJson,
  renderDriftText,
} from './index.js';
import type { DriftReport } from './drift-detector.js';

const USAGE = `Usage:
  npm run drift -- --target <path> (--answers <yaml> | --archetype <id>) [options]

Options:
  --target <path>                Directory to scan for managed EmbedIQ files
  --answers <path>               Path to an answers.yaml file
  --archetype <id>               Shorthand for tests/fixtures/golden-configs/<id>/answers.yaml
  --targets <list>               Output targets to regenerate for (default: claude)
                                 Accepts same values as --targets in evaluate/benchmark
  --format text|json             Output format (default: text)
  --out <path>                   Write the report to a file instead of stdout
  --show-content                 Include full expected/on-disk content in text output
  --no-color                     Disable ANSI color in text output
  -h, --help                     Print this help and exit

Exit codes:
  0  target is in sync with expected generation (clean)
  1  drift detected
  2  configuration error (bad flags, missing files, malformed YAML, etc.)
`;

interface ParsedArgs {
  target?: string;
  answers?: string;
  archetype?: string;
  targets?: string;
  format: 'text' | 'json';
  out?: string;
  showContent: boolean;
  noColor: boolean;
  help: boolean;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.stderr.write(USAGE);
    return 2;
  }

  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (!args.target) {
    process.stderr.write('--target is required\n');
    process.stderr.write(USAGE);
    return 2;
  }
  if (!args.answers && !args.archetype) {
    process.stderr.write('Either --answers or --archetype is required\n');
    process.stderr.write(USAGE);
    return 2;
  }

  const answersPath = args.answers
    ? resolve(args.answers)
    : resolveArchetypeAnswers(args.archetype!);

  if (!existsSync(answersPath)) {
    process.stderr.write(`Answer file does not exist: ${answersPath}\n`);
    return 2;
  }

  let report: DriftReport;
  try {
    report = await detectDrift({
      targetDir: resolve(args.target),
      answers: answersPath,
      targets: args.targets,
      answerSourceLabel: args.archetype
        ? `archetype:${args.archetype}`
        : answersPath,
    });
  } catch (err) {
    if (err instanceof DriftError) {
      process.stderr.write(`Drift configuration error: ${err.message}\n`);
      return 2;
    }
    process.stderr.write(
      `Unexpected error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
    );
    return 2;
  }

  const output = args.format === 'json'
    ? renderDriftJson(report)
    : renderDriftText(report, { noColor: args.noColor, showContent: args.showContent });

  if (args.out) {
    await writeFile(resolve(args.out), output, 'utf-8');
  } else {
    process.stdout.write(output);
  }

  return report.clean ? 0 : 1;
}

function resolveArchetypeAnswers(archetypeId: string): string {
  return resolve(
    join('tests', 'fixtures', 'golden-configs', archetypeId, 'answers.yaml'),
  );
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    format: 'text',
    showContent: false,
    noColor: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help':
        out.help = true;
        break;
      case '--target':
        out.target = requireValue(argv[++i], '--target');
        break;
      case '--answers':
        out.answers = requireValue(argv[++i], '--answers');
        break;
      case '--archetype':
        out.archetype = requireValue(argv[++i], '--archetype');
        break;
      case '--targets':
        out.targets = requireValue(argv[++i], '--targets');
        break;
      case '--format':
        out.format = requireEnum(argv[++i], ['text', 'json'], '--format');
        break;
      case '--out':
        out.out = requireValue(argv[++i], '--out');
        break;
      case '--show-content':
        out.showContent = true;
        break;
      case '--no-color':
        out.noColor = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return out;
}

function requireValue(v: string | undefined, flag: string): string {
  if (!v || v.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return v;
}

function requireEnum<T extends string>(
  v: string | undefined,
  allowed: readonly T[],
  flag: string,
): T {
  const value = requireValue(v, flag);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${flag} must be one of ${allowed.join(', ')}, got "${value}"`);
  }
  return value as T;
}

// Direct-run handling — when executed via `tsx src/autopilot/cli.ts`.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then((code) => process.exit(code));
}
