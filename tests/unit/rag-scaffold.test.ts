import { describe, it, expect } from 'vitest';
import {
  RagScaffoldGenerator,
  shouldEmitRagScaffold,
  isFhirChunker,
} from '../../src/synthesizer/generators/rag-scaffold.js';
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
  p.ollamaModels = ['qwen2.5-coder:32b', 'nomic-embed-text'];
  p.ideIntegrations = ['continue-dev'];
  p.defaultLocalModel = 'qwen2.5-coder:32b';
  return { ...p, ...overrides };
}

function makeConfig(profile: UserProfile): SetupConfig {
  return { profile, targetDir: '/test' };
}

function findFile(files: { relativePath: string; content: string }[], path: string) {
  return files.find((f) => f.relativePath === path);
}

describe('shouldEmitRagScaffold — gating', () => {
  it('returns true when localAiEnabled is true', () => {
    expect(shouldEmitRagScaffold(makeProfile())).toBe(true);
  });

  it('returns false when localAiEnabled is false', () => {
    expect(shouldEmitRagScaffold(makeProfile({ localAiEnabled: false }))).toBe(false);
  });

  it('returns false when localAiEnabled is undefined', () => {
    const p = makeProfile();
    delete p.localAiEnabled;
    expect(shouldEmitRagScaffold(p)).toBe(false);
  });

  it('does NOT require healthcare industry (Option B — industry-agnostic)', () => {
    expect(shouldEmitRagScaffold(makeProfile({ industry: 'saas' }))).toBe(true);
    expect(shouldEmitRagScaffold(makeProfile({ industry: 'finance' }))).toBe(true);
    expect(shouldEmitRagScaffold(makeProfile({ industry: '' }))).toBe(true);
  });
});

describe('isFhirChunker — chunker variant selection', () => {
  it('returns true only when industry is healthcare', () => {
    expect(isFhirChunker(makeProfile({ industry: 'healthcare' }))).toBe(true);
    expect(isFhirChunker(makeProfile({ industry: 'saas' }))).toBe(false);
    expect(isFhirChunker(makeProfile({ industry: 'finance' }))).toBe(false);
    expect(isFhirChunker(makeProfile({ industry: '' }))).toBe(false);
  });
});

describe('RagScaffoldGenerator — file emission', () => {
  it('emits no files when localAiEnabled is false', () => {
    const profile = makeProfile({ localAiEnabled: false });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    expect(files).toHaveLength(0);
  });

  it('emits 9 TypeScript scaffold files + 1 rule file for a non-regulated profile', () => {
    const profile = makeProfile({ industry: 'saas' });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    expect(files).toHaveLength(10);
    expect(findFile(files, 'rag/README.md')).toBeDefined();
    expect(findFile(files, 'rag/package.json')).toBeDefined();
    expect(findFile(files, 'rag/.env.example')).toBeDefined();
    expect(findFile(files, 'rag/src/chunker.ts')).toBeDefined();
    expect(findFile(files, 'rag/src/embedder.ts')).toBeDefined();
    expect(findFile(files, 'rag/src/store.ts')).toBeDefined();
    expect(findFile(files, 'rag/src/audit.ts')).toBeDefined();
    expect(findFile(files, 'rag/src/cli.ts')).toBeDefined();
    expect(findFile(files, 'RAG_RUNBOOK.md')).toBeDefined();
    expect(findFile(files, '.claude/rules/rag-conventions.md')).toBeDefined();
  });

  it('emits Python scaffold when Python-only', () => {
    const profile = makeProfile({ languages: ['python'], industry: 'saas' });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    expect(findFile(files, 'rag/pyproject.toml')).toBeDefined();
    expect(findFile(files, 'rag/src/chunker.py')).toBeDefined();
    expect(findFile(files, 'rag/src/cli.py')).toBeDefined();
    expect(findFile(files, 'rag/package.json')).toBeUndefined();
    expect(findFile(files, 'rag/src/chunker.ts')).toBeUndefined();
  });

  it('emits TypeScript scaffold for mixed TS+Python stacks', () => {
    const profile = makeProfile({ languages: ['typescript', 'python'], industry: 'healthcare' });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    expect(findFile(files, 'rag/package.json')).toBeDefined();
    expect(findFile(files, 'rag/src/chunker.ts')).toBeDefined();
    expect(findFile(files, 'rag/pyproject.toml')).toBeUndefined();
  });
});

describe('RagScaffoldGenerator — industry-aware chunker', () => {
  it('emits FHIR-aware chunker for healthcare profiles', () => {
    const profile = makeProfile({ industry: 'healthcare' });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    const chunker = findFile(files, 'rag/src/chunker.ts')!;
    expect(chunker.content).toContain('FHIR-aware chunker');
    expect(chunker.content).toContain('chunkFhirBundle');
    expect(chunker.content).toContain('resourceType');
  });

  it('emits plain-text chunker for non-healthcare profiles', () => {
    const profile = makeProfile({ industry: 'saas' });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    const chunker = findFile(files, 'rag/src/chunker.ts')!;
    expect(chunker.content).toContain('Plain-text chunker');
    expect(chunker.content).not.toContain('chunkFhirBundle');
    expect(chunker.content).not.toContain('resourceType');
  });

  it('CLI imports FHIR functions for healthcare profiles', () => {
    const profile = makeProfile({ industry: 'healthcare' });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    const cli = findFile(files, 'rag/src/cli.ts')!;
    expect(cli.content).toContain('chunkFhirBundle');
    expect(cli.content).toContain('isFhirBundle');
  });

  it('CLI omits FHIR functions for non-healthcare profiles', () => {
    const profile = makeProfile({ industry: 'saas' });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    const cli = findFile(files, 'rag/src/cli.ts')!;
    expect(cli.content).not.toContain('chunkFhirBundle');
    expect(cli.content).not.toContain('isFhirBundle');
  });
});

describe('RagScaffoldGenerator — per-framework rule files', () => {
  it('emits rag-conventions.md when no compliance frameworks are active', () => {
    const profile = makeProfile({ industry: 'saas', complianceFrameworks: [] });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    expect(findFile(files, '.claude/rules/rag-conventions.md')).toBeDefined();
    expect(findFile(files, '.claude/rules/rag-hipaa-compliance.md')).toBeUndefined();
    expect(findFile(files, '.claude/rules/rag-pci-compliance.md')).toBeUndefined();
  });

  it('emits rag-hipaa-compliance.md for HIPAA-scoped profiles', () => {
    const profile = makeProfile({ industry: 'healthcare', complianceFrameworks: ['hipaa'] });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    expect(findFile(files, '.claude/rules/rag-hipaa-compliance.md')).toBeDefined();
    expect(findFile(files, '.claude/rules/rag-conventions.md')).toBeUndefined();
  });

  it('emits rag-pci-compliance.md for PCI-scoped profiles', () => {
    const profile = makeProfile({ industry: 'finance', complianceFrameworks: ['pci'] });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    expect(findFile(files, '.claude/rules/rag-pci-compliance.md')).toBeDefined();
    expect(findFile(files, '.claude/rules/rag-conventions.md')).toBeUndefined();
  });

  it('emits rag-soc2-compliance.md for SOC2 profiles', () => {
    const profile = makeProfile({ industry: 'saas', complianceFrameworks: ['soc2'] });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    expect(findFile(files, '.claude/rules/rag-soc2-compliance.md')).toBeDefined();
  });

  it('emits rag-ferpa-compliance.md for FERPA profiles', () => {
    const profile = makeProfile({ industry: 'education', complianceFrameworks: ['ferpa'] });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    expect(findFile(files, '.claude/rules/rag-ferpa-compliance.md')).toBeDefined();
  });

  it('emits multiple rule files when multiple frameworks are active', () => {
    const profile = makeProfile({
      industry: 'healthcare',
      complianceFrameworks: ['hipaa', 'soc2'],
    });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    expect(findFile(files, '.claude/rules/rag-hipaa-compliance.md')).toBeDefined();
    expect(findFile(files, '.claude/rules/rag-soc2-compliance.md')).toBeDefined();
    expect(findFile(files, '.claude/rules/rag-conventions.md')).toBeUndefined();
  });
});

describe('RagScaffoldGenerator — rule file content', () => {
  it('HIPAA rule references 45 CFR and six-year retention', () => {
    const profile = makeProfile({ industry: 'healthcare', complianceFrameworks: ['hipaa'] });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    const rule = findFile(files, '.claude/rules/rag-hipaa-compliance.md')!.content;
    expect(rule).toContain('45 CFR');
    expect(rule).toMatch(/six-year|6-year/);
    expect(rule).toContain('PHI');
    expect(rule).toContain('BAA');
  });

  it('PCI rule warns against indexing full PANs and SAD', () => {
    const profile = makeProfile({ industry: 'finance', complianceFrameworks: ['pci'] });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    const rule = findFile(files, '.claude/rules/rag-pci-compliance.md')!.content;
    expect(rule).toMatch(/full PANs/i);
    expect(rule).toContain('SAD');
    expect(rule).toMatch(/CVV|CVC/);
  });

  it('SOC 2 rule cites Trust Services Criteria controls', () => {
    const profile = makeProfile({ industry: 'saas', complianceFrameworks: ['soc2'] });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    const rule = findFile(files, '.claude/rules/rag-soc2-compliance.md')!.content;
    expect(rule).toMatch(/CC[678]\.\d/);
    expect(rule).toContain('Trust Services Criteria');
  });

  it('FERPA rule covers directory information opt-out and parental consent', () => {
    const profile = makeProfile({ industry: 'education', complianceFrameworks: ['ferpa'] });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    const rule = findFile(files, '.claude/rules/rag-ferpa-compliance.md')!.content;
    expect(rule).toContain('directory information');
    expect(rule).toContain('parental consent');
  });

  it('conventions rule covers generic best practices without framework refs', () => {
    const profile = makeProfile({ industry: 'saas', complianceFrameworks: [] });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    const rule = findFile(files, '.claude/rules/rag-conventions.md')!.content;
    expect(rule).toContain('RAG Conventions');
    expect(rule).not.toContain('HIPAA');
    expect(rule).not.toContain('PCI-DSS');
  });
});

describe('RagScaffoldGenerator — runbook industry-awareness', () => {
  it('runbook mentions active compliance frameworks', () => {
    const profile = makeProfile({
      industry: 'healthcare',
      complianceFrameworks: ['hipaa'],
    });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    const runbook = findFile(files, 'RAG_RUNBOOK.md')!.content;
    expect(runbook).toContain('HIPAA');
    expect(runbook).toContain('rag-hipaa-compliance.md');
  });

  it('runbook lists HIPAA-specific hardening items when HIPAA active', () => {
    const profile = makeProfile({
      industry: 'healthcare',
      complianceFrameworks: ['hipaa'],
    });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    const runbook = findFile(files, 'RAG_RUNBOOK.md')!.content;
    expect(runbook).toMatch(/six-year retention/);
    expect(runbook).toContain('BAA');
    expect(runbook).toContain('45 CFR 164.514');
  });

  it('runbook omits framework-specific blocks when no frameworks active', () => {
    const profile = makeProfile({ industry: 'saas', complianceFrameworks: [] });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    const runbook = findFile(files, 'RAG_RUNBOOK.md')!.content;
    expect(runbook).toContain('No regulated frameworks');
    expect(runbook).not.toContain('45 CFR');
    expect(runbook).not.toContain('CDE');
  });
});

describe('RagScaffoldGenerator — runnable scaffold artifacts', () => {
  it('package.json declares the expected deps', () => {
    const profile = makeProfile({ industry: 'saas' });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    const pkg = JSON.parse(findFile(files, 'rag/package.json')!.content);
    expect(pkg.dependencies).toHaveProperty('better-sqlite3');
    expect(pkg.dependencies).toHaveProperty('sqlite-vss');
    expect(pkg.dependencies).toHaveProperty('ollama');
    expect(pkg.scripts.index).toContain('cli.ts index');
    expect(pkg.scripts.query).toContain('cli.ts query');
  });

  it('.env.example documents the required env vars', () => {
    const profile = makeProfile({ industry: 'saas' });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    const env = findFile(files, 'rag/.env.example')!.content;
    expect(env).toContain('OLLAMA_HOST');
    expect(env).toContain('OLLAMA_EMBED_MODEL');
    expect(env).toContain('RAG_DB_PATH');
    expect(env).toContain('RAG_AUDIT_LOG_PATH');
    expect(env).toContain('RAG_QUERY_HASH_KEY');
  });

  it('audit module never writes raw query strings', () => {
    const profile = makeProfile({ industry: 'saas' });
    const files = new RagScaffoldGenerator().generate(makeConfig(profile));
    const audit = findFile(files, 'rag/src/audit.ts')!.content;
    // The audit module hashes queries (HMAC) — should NOT include
    // raw `entry.query` in the JSON line written to the log.
    expect(audit).toContain('createHmac');
    expect(audit).toMatch(/queryHash/);
    // The JSON line is built from these fields; raw query should not be one.
    const jsonStringifyMatch = audit.match(/JSON\.stringify\(\{[\s\S]*?\}\)/);
    expect(jsonStringifyMatch).toBeTruthy();
    expect(jsonStringifyMatch![0]).not.toMatch(/\bquery\b\s*:/);
  });
});
