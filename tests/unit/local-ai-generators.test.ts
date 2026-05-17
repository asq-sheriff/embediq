import { describe, it, expect } from 'vitest';
import {
  ContinueDevGenerator,
  shouldEmitContinueDev,
} from '../../src/synthesizer/generators/continue-dev.js';
import {
  AiderGenerator,
  shouldEmitAider,
} from '../../src/synthesizer/generators/aider.js';
import {
  ZedAiGenerator,
  shouldEmitZedAi,
} from '../../src/synthesizer/generators/zed-ai.js';
import {
  OllamaSetupGenerator,
  shouldEmitOllamaSetup,
} from '../../src/synthesizer/generators/ollama-setup.js';
import { createEmptyProfile, type UserProfile, type SetupConfig } from '../../src/types/index.js';

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  const p = createEmptyProfile();
  p.role = 'developer';
  p.businessDomain = 'TestProject';
  p.languages = ['typescript'];
  p.devOps = {
    ide: ['vscode'],
    buildTools: ['npm'],
    testFrameworks: [],
    cicd: 'github_actions',
    monitoring: [],
    containerization: [],
  };
  p.localAiEnabled = true;
  p.ollamaModels = ['qwen2.5-coder:32b', 'llama3.1:8b', 'nomic-embed-text'];
  p.ideIntegrations = ['continue-dev', 'aider', 'zed-ai'];
  p.defaultLocalModel = 'qwen2.5-coder:32b';
  return { ...p, ...overrides };
}

function makeConfig(profile: UserProfile): SetupConfig {
  return { profile, targetDir: '/test' };
}

describe('ContinueDevGenerator', () => {
  it('emits .continue/config.json with all selected non-embedding models', () => {
    const files = new ContinueDevGenerator().generate(makeConfig(makeProfile()));
    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('.continue/config.json');
    const parsed = JSON.parse(files[0].content);
    expect(parsed.models).toHaveLength(2); // excludes nomic-embed-text
    expect(parsed.models[0].model).toBe('qwen2.5-coder:32b');
    expect(parsed.tabAutocompleteModel.model).toBe('qwen2.5-coder:32b');
  });

  it('wires embedding model when present', () => {
    const files = new ContinueDevGenerator().generate(makeConfig(makeProfile()));
    const parsed = JSON.parse(files[0].content);
    expect(parsed.embeddingsProvider.model).toBe('nomic-embed-text');
  });

  it('disables anonymous telemetry by default', () => {
    const files = new ContinueDevGenerator().generate(makeConfig(makeProfile()));
    const parsed = JSON.parse(files[0].content);
    expect(parsed.allowAnonymousTelemetry).toBe(false);
  });

  it('emits a usable fallback when no models selected', () => {
    const profile = makeProfile({ ollamaModels: [], defaultLocalModel: undefined });
    const files = new ContinueDevGenerator().generate(makeConfig(profile));
    const parsed = JSON.parse(files[0].content);
    expect(parsed.models.length).toBeGreaterThan(0);
  });

  it('shouldEmitContinueDev gates on localAiEnabled + ide selection', () => {
    expect(shouldEmitContinueDev(makeProfile())).toBe(true);
    expect(shouldEmitContinueDev(makeProfile({ ideIntegrations: ['aider'] }))).toBe(false);
    expect(shouldEmitContinueDev(makeProfile({ localAiEnabled: false }))).toBe(false);
  });
});

describe('AiderGenerator', () => {
  it('emits both .aider.conf.yml and .aiderignore', () => {
    const files = new AiderGenerator().generate(makeConfig(makeProfile()));
    const paths = files.map((f) => f.relativePath).sort();
    expect(paths).toEqual(['.aider.conf.yml', '.aiderignore']);
  });

  it('uses the default local model in the config', () => {
    const files = new AiderGenerator().generate(makeConfig(makeProfile()));
    const conf = files.find((f) => f.relativePath === '.aider.conf.yml')!.content;
    expect(conf).toMatch(/model:\s*ollama\/qwen2\.5-coder:32b/);
  });

  it('infers npm test command for TypeScript projects', () => {
    const files = new AiderGenerator().generate(makeConfig(makeProfile()));
    const conf = files.find((f) => f.relativePath === '.aider.conf.yml')!.content;
    expect(conf).toMatch(/test-cmd:\s*npm test/);
  });

  it('keeps auto-commits disabled (conservative default)', () => {
    const files = new AiderGenerator().generate(makeConfig(makeProfile()));
    const conf = files.find((f) => f.relativePath === '.aider.conf.yml')!.content;
    expect(conf).toMatch(/auto-commits:\s*false/);
  });

  it('adds HIPAA-specific entries to .aiderignore when HIPAA active', () => {
    const profile = makeProfile({ complianceFrameworks: ['hipaa'] });
    const files = new AiderGenerator().generate(makeConfig(profile));
    const ignore = files.find((f) => f.relativePath === '.aiderignore')!.content;
    expect(ignore).toContain('HIPAA');
    expect(ignore).toContain('phi/');
  });

  it('omits HIPAA section when HIPAA not active', () => {
    const files = new AiderGenerator().generate(makeConfig(makeProfile()));
    const ignore = files.find((f) => f.relativePath === '.aiderignore')!.content;
    expect(ignore).not.toContain('HIPAA');
  });

  it('shouldEmitAider gates correctly', () => {
    expect(shouldEmitAider(makeProfile())).toBe(true);
    expect(shouldEmitAider(makeProfile({ ideIntegrations: ['continue-dev'] }))).toBe(false);
  });
});

describe('ZedAiGenerator', () => {
  it('emits .zed/settings.json with the default model wired', () => {
    const files = new ZedAiGenerator().generate(makeConfig(makeProfile()));
    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('.zed/settings.json');
    const parsed = JSON.parse(files[0].content);
    expect(parsed.assistant.default_model.provider).toBe('ollama');
    expect(parsed.assistant.default_model.model).toBe('qwen2.5-coder:32b');
  });

  it('registers all selected non-embedding models', () => {
    const files = new ZedAiGenerator().generate(makeConfig(makeProfile()));
    const parsed = JSON.parse(files[0].content);
    const available = parsed.language_models.ollama.available_models;
    const names = available.map((m: { name: string }) => m.name);
    expect(names).toContain('qwen2.5-coder:32b');
    expect(names).toContain('llama3.1:8b');
    expect(names).not.toContain('nomic-embed-text');
  });

  it('points at localhost:11434 (default Ollama port)', () => {
    const files = new ZedAiGenerator().generate(makeConfig(makeProfile()));
    const parsed = JSON.parse(files[0].content);
    expect(parsed.language_models.ollama.api_url).toBe('http://localhost:11434');
  });

  it('shouldEmitZedAi gates correctly', () => {
    expect(shouldEmitZedAi(makeProfile())).toBe(true);
    expect(shouldEmitZedAi(makeProfile({ ideIntegrations: ['aider'] }))).toBe(false);
  });
});

describe('OllamaSetupGenerator', () => {
  it('emits OLLAMA_SETUP.md at project root', () => {
    const files = new OllamaSetupGenerator().generate(makeConfig(makeProfile()));
    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('OLLAMA_SETUP.md');
  });

  it('lists ollama pull commands for each selected model', () => {
    const md = new OllamaSetupGenerator().generate(makeConfig(makeProfile()))[0].content;
    expect(md).toContain('ollama pull qwen2.5-coder:32b');
    expect(md).toContain('ollama pull llama3.1:8b');
    expect(md).toContain('ollama pull nomic-embed-text');
  });

  it('lists wired-up IDEs in the runbook', () => {
    const md = new OllamaSetupGenerator().generate(makeConfig(makeProfile()))[0].content;
    expect(md).toMatch(/Continue\.dev/);
    expect(md).toMatch(/Aider/);
    expect(md).toMatch(/Zed AI/);
  });

  it('includes hardware-tier notes when ram is set', () => {
    const profile = makeProfile();
    profile.hardwareProfile = { ram: '128gb+' };
    const md = new OllamaSetupGenerator().generate(makeConfig(profile))[0].content;
    expect(md).toMatch(/128 GB/);
    expect(md).toMatch(/M-series|MLX/);
  });

  it('includes HIPAA reminder when HIPAA active', () => {
    const profile = makeProfile({ complianceFrameworks: ['hipaa'] });
    const md = new OllamaSetupGenerator().generate(makeConfig(profile))[0].content;
    expect(md).toContain('HIPAA reminder');
    expect(md).toContain('BAA');
  });

  it('falls back to a starter set when no models selected', () => {
    const profile = makeProfile({ ollamaModels: [] });
    const md = new OllamaSetupGenerator().generate(makeConfig(profile))[0].content;
    expect(md).toContain('starter set');
  });

  it('shouldEmitOllamaSetup runs whenever localAiEnabled is true', () => {
    expect(shouldEmitOllamaSetup(makeProfile())).toBe(true);
    expect(shouldEmitOllamaSetup(makeProfile({ localAiEnabled: false }))).toBe(false);
    // Runs even if no IDE picked — Ollama runtime is independent
    expect(shouldEmitOllamaSetup(makeProfile({ ideIntegrations: [] }))).toBe(true);
  });
});
