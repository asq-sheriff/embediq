#!/usr/bin/env -S npx tsx
/**
 * verify-audit-log — offline integrity check for an EmbedIQ
 * tamper-evident audit log (v4.0 / 8F).
 *
 * Usage:
 *   npm run verify-audit-log -- --input <path/to/audit.jsonl>
 *   npm run verify-audit-log -- --input <path> --format json
 *
 * Exit codes:
 *   0   chain verified clean (every entry's prevHash matches)
 *   1   chain broken (tampered entry, truncation, or out-of-order writes)
 *   2   configuration error (missing --input, file not found, etc.)
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { verifyAuditChain, GENESIS_HASH } from '../src/util/audit-chain.js';

interface Args {
  input?: string;
  format: 'text' | 'json';
  noColor: boolean;
  help: boolean;
}

const USAGE = `Usage:
  npm run verify-audit-log -- --input <path/to/audit.jsonl> [options]

Options:
  --input <path>     Path to the JSONL audit log to verify (required).
  --format text|json Output format (default: text).
  --no-color         Disable ANSI color in text output.
  -h, --help         Print this help and exit.

Exit codes:
  0  chain verified clean
  1  chain broken
  2  configuration error
`;

function parseArgs(argv: string[]): Args {
  const out: Args = { format: 'text', noColor: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help':
        out.help = true;
        break;
      case '--input':
        out.input = argv[++i];
        break;
      case '--format':
        out.format = argv[++i] === 'json' ? 'json' : 'text';
        break;
      case '--no-color':
        out.noColor = true;
        break;
      default:
        process.stderr.write(`Unknown argument: ${arg}\n${USAGE}`);
        process.exit(2);
    }
  }
  return out;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (!args.input) {
    process.stderr.write(`error: --input is required\n${USAGE}`);
    return 2;
  }

  const path = resolve(args.input);
  let content: string;
  try {
    content = await readFile(path, 'utf-8');
  } catch (err) {
    process.stderr.write(`error: cannot read ${path}: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  const result = verifyAuditChain(lines);

  if (args.format === 'json') {
    process.stdout.write(JSON.stringify({
      input: path,
      genesisHash: GENESIS_HASH,
      ...result,
    }, null, 2) + '\n');
    return result.ok ? 0 : 1;
  }

  // Text format
  const c = args.noColor ? identity : ansi;
  process.stdout.write('\n');
  process.stdout.write(c.bold('EmbedIQ audit-chain verification') + '\n');
  process.stdout.write(`  Input:        ${path}\n`);
  process.stdout.write(`  Genesis hash: ${c.dim(GENESIS_HASH)}\n`);
  process.stdout.write(`  Entries:      ${result.totalEntries}\n`);
  process.stdout.write('\n');

  if (result.ok) {
    process.stdout.write(c.green(`  ✓ Chain verified clean. ${result.entriesVerified} entries.\n\n`));
    return 0;
  }

  process.stdout.write(c.red(`  ✗ Chain broken at line ${result.brokenAtLine}.\n`));
  if (result.reason) process.stdout.write(`    Reason:   ${result.reason}\n`);
  if (result.expectedPrevHash) process.stdout.write(`    Expected: ${result.expectedPrevHash}\n`);
  if (result.actualPrevHash) process.stdout.write(`    Actual:   ${result.actualPrevHash}\n`);
  process.stdout.write(`    Verified up to: ${result.entriesVerified} of ${result.totalEntries}\n\n`);
  return 1;
}

interface Painter {
  red: (s: string) => string;
  green: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
}

const ansi: Painter = {
  red:   (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim:   (s) => `\x1b[2m${s}\x1b[22m`,
  bold:  (s) => `\x1b[1m${s}\x1b[22m`,
};

const identity: Painter = {
  red: (s) => s, green: (s) => s, dim: (s) => s, bold: (s) => s,
};

main().then((code) => process.exit(code)).catch((err) => {
  process.stderr.write(`Unexpected error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(2);
});
