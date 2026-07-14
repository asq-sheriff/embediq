/**
 * The LIVE layer of the agent-effectiveness eval — the opt-in piece that costs
 * money and runs a real agent. Everything here has side effects (spawns
 * processes, writes temp dirs) and is deliberately NOT unit-tested; the pure
 * decision logic in harness.ts is. Wire this up when you have Claude Code
 * installed and authenticated. See docs/evaluators/agent-effectiveness-eval.md.
 *
 * The TREATMENT arm injects EmbedIQ's REAL generated config (not a fixture copy)
 * by running the actual synthesizer for the task's archetype — so the eval
 * measures the config we ship, not a stand-in.
 */

import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { ProfileBuilder } from '../../engine/profile-builder.js';
import { SynthesizerOrchestrator } from '../../synthesizer/orchestrator.js';
import { FileOutputManager } from '../../util/file-output.js';
import { TargetFormat } from '../../synthesizer/target-format.js';
import { loadArchetype } from '../golden-config.js';
import type {
  AgentEvalDeps,
  AgentRunResult,
  AgentRunner,
  AgentTask,
  Arm,
  TaskVerifier,
  WorkspacePreparer,
} from './types.js';

// ─── Task loading ────────────────────────────────────────────────────────

/** Load every `<dir>/<task>/task.yaml` into an AgentTask. */
export function loadTasks(dir: string): AgentTask[] {
  const root = resolve(dir);
  if (!existsSync(root)) throw new Error(`agent-task dir does not exist: ${root}`);
  const tasks: AgentTask[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const taskFile = join(root, entry.name, 'task.yaml');
    if (!existsSync(taskFile)) continue;
    const raw = parseYaml(readFileSync(taskFile, 'utf-8')) as Partial<AgentTask>;
    tasks.push({
      id: raw.id ?? entry.name,
      description: raw.description ?? entry.name,
      prompt: required(raw.prompt, `${taskFile}: prompt`),
      archetype: required(raw.archetype, `${taskFile}: archetype`),
      verifyCommand: required(raw.verifyCommand, `${taskFile}: verifyCommand`),
      // Agent-visible starting code under `workspace/`; HIDDEN checker under
      // `verify/` (copied in only at verification time).
      workspaceFixture: join(root, entry.name, 'workspace'),
      verifyFixture: join(root, entry.name, 'verify'),
    });
  }
  return tasks;
}

function required<T>(v: T | undefined, what: string): T {
  if (v == null) throw new Error(`missing ${what}`);
  return v;
}

// ─── Workspace preparation (copies fixture; injects real config on treatment) ─

export class FsWorkspacePreparer implements WorkspacePreparer {
  constructor(private archetypesRoot: string) {}

  async prepare({ task, arm }: { task: AgentTask; arm: Arm }): Promise<string> {
    const ws = mkdtempSync(join(tmpdir(), `embediq-agenteval-${task.id}-${arm}-`));
    cpSync(task.workspaceFixture, ws, { recursive: true });
    if (arm === 'treatment') {
      await this.injectConfig(ws, task.archetype);
    }
    return ws;
  }

  async cleanup(workspaceDir: string): Promise<void> {
    rmSync(workspaceDir, { recursive: true, force: true });
  }

  /** Generate EmbedIQ's actual Claude-target config for the archetype into the workspace. */
  private async injectConfig(workspaceDir: string, archetype: string): Promise<void> {
    const loaded = await loadArchetype(join(this.archetypesRoot, archetype));
    const profile = new ProfileBuilder().build(loaded.answers);
    const files = await new SynthesizerOrchestrator().generate({
      profile,
      targetDir: workspaceDir,
      targets: [TargetFormat.CLAUDE],
    });
    new FileOutputManager(workspaceDir).writeAll(files);
  }
}

// ─── Verifier (runs the task's success command) ──────────────────────────

export class CommandVerifier implements TaskVerifier {
  async verify({ workspaceDir, task }: { workspaceDir: string; task: AgentTask }): Promise<boolean> {
    // Copy the hidden checker in NOW — after the agent is done, so it never saw it.
    if (existsSync(task.verifyFixture)) {
      cpSync(task.verifyFixture, workspaceDir, { recursive: true });
    }
    const code = await exec('/bin/sh', ['-c', task.verifyCommand], workspaceDir);
    return code === 0;
  }
}

// ─── Agent runner (Claude Code headless — the faithful agent) ─────────────

/**
 * Drives Claude Code in headless mode over the workspace. The treatment
 * workspace already contains the generated `.claude/` config; the baseline does
 * not — so this measures whether that config helps the SAME agent.
 *
 * Requires the `claude` CLI installed and authenticated. Flags/output-format
 * should be confirmed against your Claude Code version.
 */
export class ClaudeCodeRunner implements AgentRunner {
  constructor(private opts: { model?: string; timeoutMs?: number } = {}) {}

  async run({ workspaceDir, prompt }: { workspaceDir: string; prompt: string; arm: Arm }): Promise<AgentRunResult> {
    const args = ['-p', prompt, '--output-format', 'json', '--permission-mode', 'acceptEdits'];
    if (this.opts.model) args.push('--model', this.opts.model);
    const started = Date.now();
    const { stdout } = await execCapture('claude', args, workspaceDir, this.opts.timeoutMs ?? 300_000);
    const wallMs = Date.now() - started;
    return parseClaudeResult(stdout, wallMs);
  }
}

/** Parse the headless JSON result. Defensive — fields vary across versions. */
export function parseClaudeResult(stdout: string, wallMs: number): AgentRunResult {
  let obj: Record<string, unknown> = {};
  try {
    // Headless json can emit one result object, or a stream of json lines.
    const trimmed = stdout.trim();
    const lastLine = trimmed.includes('\n') ? trimmed.slice(trimmed.lastIndexOf('\n') + 1) : trimmed;
    obj = JSON.parse(lastLine) as Record<string, unknown>;
  } catch {
    /* leave obj empty — reported as zero tokens, non-fatal */
  }
  const usage = (obj.usage ?? {}) as Record<string, number>;
  const tokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
  const costUsd = typeof obj.total_cost_usd === 'number' ? obj.total_cost_usd : undefined;
  return { tokens, costUsd, wallMs };
}

// ─── Wiring ──────────────────────────────────────────────────────────────

export function liveDeps(archetypesRoot: string, runnerOpts?: { model?: string; timeoutMs?: number }): AgentEvalDeps {
  return {
    workspace: new FsWorkspacePreparer(archetypesRoot),
    runner: new ClaudeCodeRunner(runnerOpts),
    verifier: new CommandVerifier(),
  };
}

// ─── process helpers ─────────────────────────────────────────────────────

function exec(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { cwd, stdio: 'ignore' });
    child.on('close', (code) => resolvePromise(code ?? 1));
    child.on('error', () => resolvePromise(1));
  });
}

function execCapture(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd });
    let stdout = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`agent run timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.on('close', () => {
      clearTimeout(timer);
      resolvePromise({ stdout });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
