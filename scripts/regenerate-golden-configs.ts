/**
 * One-shot script: regenerates the `expected/` tree for each archetype
 * under `tests/fixtures/golden-configs/` from the current orchestrator
 * output. Run after intentional generator changes to update the baseline.
 *
 *   npx tsx scripts/regenerate-golden-configs.ts
 */
import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { QuestionBank } from '../src/bank/question-bank.js';
import { ProfileBuilder } from '../src/engine/profile-builder.js';
import { PriorityAnalyzer } from '../src/engine/priority-analyzer.js';
import { domainPackRegistry } from '../src/domain-packs/registry.js';
import { SynthesizerOrchestrator } from '../src/synthesizer/orchestrator.js';
import { InMemoryEventBus } from '../src/events/bus.js';
import { parseTargets } from '../src/synthesizer/target-format.js';
import type { Answer, SetupConfig } from '../src/types/index.js';

const ROOT = resolve(process.cwd(), 'tests/fixtures/golden-configs');
const FIXED_TIMESTAMP = new Date('2026-01-01T00:00:00Z');

async function main(): Promise<void> {
  const entries = await readdir(ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(ROOT, entry.name);
    if (!existsSync(join(dir, 'archetype.yaml'))) continue;
    await regenerate(dir);
  }
}

async function regenerate(dir: string): Promise<void> {
  const answers = await loadAnswers(join(dir, 'answers.yaml'));
  const targets = await loadArchetypeTargets(join(dir, 'archetype.yaml'));

  // Run the same pipeline the evaluator uses.
  const silentBus = new InMemoryEventBus();
  const builder = new ProfileBuilder(silentBus);
  const profile = builder.build(answers);
  const domainPack = domainPackRegistry.getForIndustry(profile.industry);
  const bank = new QuestionBank(domainPack);
  profile.priorities = new PriorityAnalyzer().analyze(answers, bank.getAll());

  const setup: SetupConfig = { profile, targetDir: '/evaluation', domainPack, targets };
  const orchestrator = new SynthesizerOrchestrator(silentBus);
  const files = await orchestrator.generate(setup);

  const expectedDir = join(dir, 'expected');
  if (existsSync(expectedDir)) await rm(expectedDir, { recursive: true });
  await mkdir(expectedDir, { recursive: true });

  for (const file of files) {
    const outPath = join(expectedDir, file.relativePath);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, file.content, 'utf-8');
  }

  process.stdout.write(`  ✓ ${dir}  (${files.length} files)\n`);
}

async function loadAnswers(path: string): Promise<Map<string, Answer>> {
  const raw = await readFile(path, 'utf-8');
  const parsed = parseYaml(raw) as Record<string, string | string[] | number | boolean>;
  const out = new Map<string, Answer>();
  for (const [id, value] of Object.entries(parsed)) {
    out.set(id, { questionId: id, value, timestamp: FIXED_TIMESTAMP });
  }
  return out;
}

async function loadArchetypeTargets(path: string): Promise<ReturnType<typeof parseTargets> | undefined> {
  if (!existsSync(path)) return undefined;
  const raw = await readFile(path, 'utf-8');
  const parsed = parseYaml(raw) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') return undefined;
  const t = parsed.targets;
  if (t === undefined) return undefined;
  if (typeof t !== 'string' && !Array.isArray(t)) return undefined;
  return parseTargets(t as string | string[]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
