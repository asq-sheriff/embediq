import { describe, it, expect } from 'vitest';
import { ProfileBuilder } from '../../src/engine/profile-builder.js';
import { SynthesizerOrchestrator } from '../../src/synthesizer/orchestrator.js';
import { InMemoryEventBus } from '../../src/events/bus.js';
import type { Answer } from '../../src/types/index.js';

/**
 * End-to-end coverage for the isolation-enforcement layer: real answers →
 * ProfileBuilder (TECH_023 → devOps.isolationModel) → SynthesizerOrchestrator
 * (registered ManagedSettings/DevContainer generators). The vdi golden covers
 * the managed-settings path; this adds the dev_container path and the negative
 * case, which no golden exercises.
 */
function answerMap(entries: [string, string | string[]][]): Map<string, Answer> {
  const m = new Map<string, Answer>();
  for (const [id, value] of entries) m.set(id, { questionId: id, value, timestamp: new Date(0) });
  return m;
}

async function generatedPaths(isolation?: string): Promise<string[]> {
  const bus = new InMemoryEventBus();
  const base: [string, string | string[]][] = [
    ['STRAT_000', 'developer'], ['STRAT_000a', 'advanced'], ['STRAT_000b', 'admin'],
    ['STRAT_002', 'healthcare'], ['TECH_001', ['python']], ['REG_002', ['hipaa']], ['REG_008', 'strict'],
  ];
  if (isolation) base.push(['TECH_023', isolation]);
  const profile = new ProfileBuilder(bus).build(answerMap(base));
  const files = await new SynthesizerOrchestrator(bus).generate({ profile, targetDir: '/tmp/out' });
  return files.map((f) => f.relativePath);
}

describe('isolation enforcement — full pipeline (answers → profile → orchestrator)', () => {
  it('dev_container emits both the dev container and the managed-settings floor', async () => {
    const paths = await generatedPaths('dev_container');
    expect(paths).toContain('.devcontainer/devcontainer.json');
    expect(paths).toContain('deploy/claude-code/managed-settings.json');
  });

  it('vdi emits the managed-settings floor but no dev container', async () => {
    const paths = await generatedPaths('vdi');
    expect(paths).toContain('deploy/claude-code/managed-settings.json');
    expect(paths).not.toContain('.devcontainer/devcontainer.json');
  });

  it('no isolation posture emits neither enforcement artifact (baseline harness)', async () => {
    const paths = await generatedPaths(undefined);
    expect(paths).not.toContain('deploy/claude-code/managed-settings.json');
    expect(paths).not.toContain('.devcontainer/devcontainer.json');
  });
});
