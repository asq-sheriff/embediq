import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Evaluator } from './evaluator.js';
import { Benchmark } from './benchmark.js';
import { renderText, renderJson, writeReport } from './reporter.js';
import { EvaluationError } from './types.js';
import type { EvaluationReport, ProgressEvent } from './types.js';
import {
  loadCorpus,
  runEligibilityGate,
  renderEligibilityReport,
  scenarioProfile,
  type EligibilityScenario,
} from './eligibility-gate.js';

const USAGE = `Usage:
  npm run evaluate -- [options]
  npm run benchmark -- --candidate <path> --label <name> [options]

  npm run evaluate -- --mode router-eligibility [--scenario airgapped|covered|mixed]

Options:
  --mode evaluate|benchmark|router-eligibility
                                 Run mode (default: evaluate)
  --corpus <path>                (router-eligibility) Corpus YAML
                                 (default: tests/fixtures/eligibility-corpus.yaml)
  --scenario airgapped|covered|mixed
                                 (router-eligibility) Egress posture to verify
                                 (default: airgapped). Exit 1 on any violation.
  --archetypes-root <path>       Directory of archetype fixtures
                                 (default: tests/fixtures/golden-configs)
  --archetype <id>               Restrict to a specific archetype id (repeatable)
  --threshold <0..1>             Pass threshold per archetype (default: 0.75)
  --baseline <path>              Prior report JSON for regression detection
  --candidate <path>             (benchmark) Candidate output directory
  --candidate-label <name>       (benchmark) Label for the candidate tool
  --candidate-layout flat|per-archetype  (benchmark) Layout of --candidate (default: per-archetype)
  --format text|json|scorecard|pdf       Output format (default: text)
                                         scorecard = customer-facing HTML
                                         pdf       = HTML rendered to PDF (requires puppeteer)
  --out <path>                   Write output to file instead of stdout
                                 Required for scorecard and pdf formats
  --show-failures                Include the worst failing checks per archetype
  --failure-limit <n>            Max failing checks shown per archetype (default: 10)
  --no-color                     Disable ANSI color in text output

Scorecard / PDF options (apply when --format is scorecard or pdf):
  --scorecard-title <string>     Override the scorecard heading
  --scorecard-subtitle <string>  Override the scorecard subtitle
  --scorecard-theme light|dark   Color theme (default: light)
  --scorecard-layout full|email-safe   Layout variant (default: full)
  --scorecard-logo <path>        Embed a logo image (PNG / JPG / SVG)
  --scorecard-include-failures   Include the failure-detail tables (default: hidden)

  -h, --help                     Print this help and exit

Exit codes:
  0  run completed and passed
  1  run completed but below threshold
  2  configuration error (e.g. missing fixtures)
`;

interface ParsedArgs {
  mode: 'evaluate' | 'benchmark' | 'router-eligibility';
  corpus?: string;
  scenario: EligibilityScenario;
  archetypesRoot: string;
  archetypes: string[];
  threshold?: number;
  baseline?: string;
  candidate?: string;
  candidateLabel?: string;
  candidateLayout: 'flat' | 'per-archetype';
  format: 'text' | 'json' | 'scorecard' | 'pdf';
  out?: string;
  showFailures: boolean;
  failureLimit?: number;
  noColor: boolean;
  help: boolean;
  // Scorecard / PDF options
  scorecardTitle?: string;
  scorecardSubtitle?: string;
  scorecardTheme: 'light' | 'dark';
  scorecardLayout: 'full' | 'email-safe';
  scorecardLogo?: string;
  scorecardIncludeFailures: boolean;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      process.stdout.write(USAGE);
      return 0;
    }

    if (args.mode === 'router-eligibility') {
      return runEligibilityMode(args);
    }

    const report = args.mode === 'benchmark'
      ? await runBenchmark(args)
      : await runEvaluate(args);

    await emitReport(report, args);
    return report.passed ? 0 : 1;
  } catch (err) {
    if (err instanceof EvaluationError) {
      process.stderr.write(`Evaluation configuration error: ${err.message}\n`);
      return 2;
    }
    process.stderr.write(
      `Unexpected error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
    );
    return 2;
  }
}

function runEligibilityMode(args: ParsedArgs): number {
  const corpusPath = resolve(args.corpus ?? 'tests/fixtures/eligibility-corpus.yaml');
  let corpus;
  try {
    corpus = loadCorpus(corpusPath);
  } catch (err) {
    throw new EvaluationError(
      `cannot load eligibility corpus at ${corpusPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const report = runEligibilityGate(corpus, scenarioProfile(args.scenario));
  report.scenario = args.scenario;
  process.stdout.write(renderEligibilityReport(report));
  return report.passed ? 0 : 1;
}

async function runEvaluate(args: ParsedArgs): Promise<EvaluationReport> {
  const evaluator = new Evaluator();
  return evaluator.evaluateRoot({
    archetypesRoot: resolve(args.archetypesRoot),
    archetypes: args.archetypes.length > 0 ? args.archetypes : undefined,
    threshold: args.threshold,
    baselinePath: args.baseline ? resolve(args.baseline) : undefined,
    onProgress: progressPrinter(args),
  });
}

async function runBenchmark(args: ParsedArgs): Promise<EvaluationReport> {
  if (!args.candidate) {
    throw new EvaluationError('Benchmark mode requires --candidate <path>');
  }
  if (!args.candidateLabel) {
    throw new EvaluationError('Benchmark mode requires --candidate-label <name>');
  }
  const benchmark = new Benchmark();
  return benchmark.run({
    archetypesRoot: resolve(args.archetypesRoot),
    archetypes: args.archetypes.length > 0 ? args.archetypes : undefined,
    threshold: args.threshold,
    candidateRoot: resolve(args.candidate),
    candidateLabel: args.candidateLabel,
    candidateLayout: args.candidateLayout,
    onProgress: progressPrinter(args),
  });
}

async function emitReport(report: EvaluationReport, args: ParsedArgs): Promise<void> {
  if (args.format === 'json') {
    const serialized = renderJson(report);
    if (args.out) {
      await writeReport(report, { format: 'json', jsonPath: resolve(args.out) });
    } else {
      process.stdout.write(serialized);
    }
    return;
  }

  if (args.format === 'scorecard' || args.format === 'pdf') {
    if (!args.out) {
      throw new EvaluationError(
        `--format ${args.format} requires --out <path> to specify the output file.`,
      );
    }
    await writeReport(report, {
      format: args.format,
      outputPath: resolve(args.out),
      scorecard: {
        title: args.scorecardTitle,
        subtitle: args.scorecardSubtitle,
        theme: args.scorecardTheme,
        layout: args.scorecardLayout,
        logoPath: args.scorecardLogo ? resolve(args.scorecardLogo) : undefined,
        includeFailures: args.scorecardIncludeFailures,
        failureLimit: args.failureLimit,
      },
    });
    process.stderr.write(
      `  ✓ ${args.format === 'pdf' ? 'PDF' : 'Scorecard'} written to ${args.out}\n`,
    );
    return;
  }

  const text = renderText(report, {
    showFailures: args.showFailures,
    failureLimit: args.failureLimit,
    noColor: args.noColor,
  });
  if (args.out) {
    await writeReport(report, { format: 'text', noColor: true });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(resolve(args.out), text, 'utf-8');
  } else {
    process.stdout.write(text);
  }
}

function progressPrinter(args: ParsedArgs): ((event: ProgressEvent) => void) | undefined {
  if (args.format === 'json') return undefined; // keep JSON stream clean
  return (event) => {
    if (event.kind === 'archetype:started') {
      process.stderr.write(`  ▶ ${event.archetypeId}\n`);
    } else if (event.kind === 'archetype:scored') {
      process.stderr.write(
        `  ◼ ${event.archetypeId}  ${(event.score * 100).toFixed(2)}%\n`,
      );
    }
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    mode: 'evaluate',
    scenario: 'airgapped',
    archetypesRoot: 'tests/fixtures/golden-configs',
    archetypes: [],
    candidateLayout: 'per-archetype',
    format: 'text',
    showFailures: false,
    noColor: false,
    help: false,
    scorecardTheme: 'light',
    scorecardLayout: 'full',
    scorecardIncludeFailures: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help':
        out.help = true;
        break;
      case '--mode':
        out.mode = expectEnum(argv[++i], ['evaluate', 'benchmark', 'router-eligibility'], '--mode');
        break;
      case '--corpus':
        out.corpus = expectValue(argv[++i], '--corpus');
        break;
      case '--scenario':
        out.scenario = expectEnum(argv[++i], ['airgapped', 'covered', 'mixed'], '--scenario');
        break;
      case '--archetypes-root':
        out.archetypesRoot = expectValue(argv[++i], '--archetypes-root');
        break;
      case '--archetype':
        out.archetypes.push(expectValue(argv[++i], '--archetype'));
        break;
      case '--threshold':
        out.threshold = expectFloat(argv[++i], '--threshold');
        break;
      case '--baseline':
        out.baseline = expectValue(argv[++i], '--baseline');
        break;
      case '--candidate':
        out.candidate = expectValue(argv[++i], '--candidate');
        out.mode = 'benchmark';
        break;
      case '--candidate-label':
        out.candidateLabel = expectValue(argv[++i], '--candidate-label');
        break;
      case '--candidate-layout':
        out.candidateLayout = expectEnum(
          argv[++i],
          ['flat', 'per-archetype'],
          '--candidate-layout',
        );
        break;
      case '--format':
        out.format = expectEnum(
          argv[++i],
          ['text', 'json', 'scorecard', 'pdf'],
          '--format',
        );
        break;
      case '--out':
        out.out = expectValue(argv[++i], '--out');
        break;
      case '--show-failures':
        out.showFailures = true;
        break;
      case '--failure-limit':
        out.failureLimit = expectInt(argv[++i], '--failure-limit');
        break;
      case '--no-color':
        out.noColor = true;
        break;
      case '--scorecard-title':
        out.scorecardTitle = expectValue(argv[++i], '--scorecard-title');
        break;
      case '--scorecard-subtitle':
        out.scorecardSubtitle = expectValue(argv[++i], '--scorecard-subtitle');
        break;
      case '--scorecard-theme':
        out.scorecardTheme = expectEnum(
          argv[++i],
          ['light', 'dark'],
          '--scorecard-theme',
        );
        break;
      case '--scorecard-layout':
        out.scorecardLayout = expectEnum(
          argv[++i],
          ['full', 'email-safe'],
          '--scorecard-layout',
        );
        break;
      case '--scorecard-logo':
        out.scorecardLogo = expectValue(argv[++i], '--scorecard-logo');
        break;
      case '--scorecard-include-failures':
        out.scorecardIncludeFailures = true;
        break;
      default:
        throw new EvaluationError(`Unknown argument: ${arg}`);
    }
  }

  return out;
}

function expectValue(v: string | undefined, flag: string): string {
  if (!v || v.startsWith('--')) {
    throw new EvaluationError(`${flag} requires a value`);
  }
  return v;
}

function expectInt(v: string | undefined, flag: string): number {
  const s = expectValue(v, flag);
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n)) throw new EvaluationError(`${flag} expects an integer`);
  return n;
}

function expectFloat(v: string | undefined, flag: string): number {
  const s = expectValue(v, flag);
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) throw new EvaluationError(`${flag} expects a number`);
  return n;
}

function expectEnum<T extends string>(
  v: string | undefined,
  allowed: readonly T[],
  flag: string,
): T {
  const s = expectValue(v, flag);
  if (!(allowed as readonly string[]).includes(s)) {
    throw new EvaluationError(
      `${flag} must be one of ${allowed.join(', ')}, got "${s}"`,
    );
  }
  return s as T;
}

// When executed directly (tsx src/evaluation/cli.ts), run main and exit.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then((code) => process.exit(code));
}
