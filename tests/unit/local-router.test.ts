import { describe, it, expect } from 'vitest';
import {
  LocalRouterGenerator,
  shouldEmitLocalRouter,
} from '../../src/synthesizer/generators/local-router.js';
import { createEmptyProfile, type UserProfile, type SetupConfig } from '../../src/types/index.js';

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  const p = createEmptyProfile();
  p.role = 'developer';
  p.businessDomain = 'RouterTestProject';
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
  p.ollamaModels = ['qwen2.5-coder:32b', 'llama3.1:8b'];
  p.ideIntegrations = ['continue-dev'];
  p.defaultLocalModel = 'qwen2.5-coder:32b';
  p.routerEnabled = true;
  p.externalApis = ['anthropic'];
  p.confidenceEscalation = true;
  return { ...p, ...overrides };
}

function makeConfig(profile: UserProfile): SetupConfig {
  return { profile, targetDir: '/test' };
}

describe('LocalRouterGenerator', () => {
  describe('gating', () => {
    it('emits nothing when routerEnabled is false', () => {
      const profile = makeProfile({ routerEnabled: false });
      const files = new LocalRouterGenerator().generate(makeConfig(profile));
      expect(files).toHaveLength(0);
    });

    it('emits the full file set when routerEnabled is true', () => {
      const files = new LocalRouterGenerator().generate(makeConfig(makeProfile()));
      const paths = files.map((f) => f.relativePath).sort();
      expect(paths).toContain('router/package.json');
      expect(paths).toContain('router/.env.example');
      expect(paths).toContain('router/README.md');
      expect(paths).toContain('router/src/server.ts');
      expect(paths).toContain('router/src/classifier.ts');
      expect(paths).toContain('router/src/local-client.ts');
      expect(paths).toContain('router/src/hosted-client.ts');
      expect(paths).toContain('router/src/audit.ts');
      expect(paths).toContain('ROUTER_RUNBOOK.md');
      expect(paths).toContain('.claude/rules/router-conventions.md');
    });

    it('shouldEmitLocalRouter gates strictly on routerEnabled', () => {
      expect(shouldEmitLocalRouter(makeProfile())).toBe(true);
      expect(shouldEmitLocalRouter(makeProfile({ routerEnabled: false }))).toBe(false);
      expect(shouldEmitLocalRouter(makeProfile({ routerEnabled: undefined }))).toBe(false);
    });
  });

  describe('PHI redactor (HIPAA gate)', () => {
    it('emits router/src/redactor.ts when HIPAA is in the compliance frameworks', () => {
      const profile = makeProfile({ complianceFrameworks: ['hipaa'] });
      const files = new LocalRouterGenerator().generate(makeConfig(profile));
      const paths = files.map((f) => f.relativePath);
      expect(paths).toContain('router/src/redactor.ts');
    });

    it('omits redactor when HIPAA is not declared', () => {
      const files = new LocalRouterGenerator().generate(makeConfig(makeProfile()));
      const paths = files.map((f) => f.relativePath);
      expect(paths).not.toContain('router/src/redactor.ts');
    });

    it('redactor body matches SSN / phone / email / MRN / DOB / ZIP', () => {
      const profile = makeProfile({ complianceFrameworks: ['hipaa'] });
      const files = new LocalRouterGenerator().generate(makeConfig(profile));
      const redactor = files.find((f) => f.relativePath === 'router/src/redactor.ts')!;
      expect(redactor.content).toContain("label: 'SSN'");
      expect(redactor.content).toContain("label: 'PHONE'");
      expect(redactor.content).toContain("label: 'EMAIL'");
      expect(redactor.content).toContain("label: 'MRN'");
      expect(redactor.content).toContain("label: 'DOB'");
      expect(redactor.content).toContain("label: 'ZIP5'");
    });

    it('server.ts imports redactPhi only when HIPAA is active', () => {
      const hipaaServer = new LocalRouterGenerator()
        .generate(makeConfig(makeProfile({ complianceFrameworks: ['hipaa'] })))
        .find((f) => f.relativePath === 'router/src/server.ts')!;
      expect(hipaaServer.content).toMatch(/import\s+\{\s*redactPhi\s*\}/);

      const plainServer = new LocalRouterGenerator()
        .generate(makeConfig(makeProfile()))
        .find((f) => f.relativePath === 'router/src/server.ts')!;
      expect(plainServer.content).not.toMatch(/redactPhi/);
    });
  });

  describe('confidence escalation', () => {
    it('emits router/src/confidence.ts when confidenceEscalation is true', () => {
      const files = new LocalRouterGenerator().generate(makeConfig(makeProfile()));
      const paths = files.map((f) => f.relativePath);
      expect(paths).toContain('router/src/confidence.ts');
    });

    it('omits confidence.ts when confidenceEscalation is false', () => {
      const profile = makeProfile({ confidenceEscalation: false });
      const files = new LocalRouterGenerator().generate(makeConfig(profile));
      const paths = files.map((f) => f.relativePath);
      expect(paths).not.toContain('router/src/confidence.ts');
    });

    it('server.ts wires the score → re-dispatch path when confidence is enabled', () => {
      const files = new LocalRouterGenerator().generate(makeConfig(makeProfile()));
      const server = files.find((f) => f.relativePath === 'router/src/server.ts')!;
      expect(server.content).toMatch(/scoreConfidence\(/);
      expect(server.content).toMatch(/ROUTER_CONFIDENCE_THRESHOLD/);
    });

    it('env template includes the confidence threshold knob when enabled', () => {
      const files = new LocalRouterGenerator().generate(makeConfig(makeProfile()));
      const env = files.find((f) => f.relativePath === 'router/.env.example')!;
      expect(env.content).toMatch(/ROUTER_CONFIDENCE_THRESHOLD/);
    });
  });

  describe('hosted-client wiring', () => {
    it('emits a stub when no externalApis are declared', () => {
      const profile = makeProfile({ externalApis: [] });
      const files = new LocalRouterGenerator().generate(makeConfig(profile));
      const hosted = files.find((f) => f.relativePath === 'router/src/hosted-client.ts')!;
      expect(hosted.content).toMatch(/Hosted LLM not configured/);
      expect(hosted.content).toMatch(/statusCode: 501/);
    });

    it('wires the Anthropic branch when anthropic is in externalApis', () => {
      const profile = makeProfile({ externalApis: ['anthropic'] });
      const files = new LocalRouterGenerator().generate(makeConfig(profile));
      const hosted = files.find((f) => f.relativePath === 'router/src/hosted-client.ts')!;
      expect(hosted.content).toMatch(/api\.anthropic\.com\/v1\/messages/);
      expect(hosted.content).toMatch(/ANTHROPIC_API_KEY/);
    });

    it('wires the OpenAI branch when openai is in externalApis', () => {
      const profile = makeProfile({ externalApis: ['openai'] });
      const files = new LocalRouterGenerator().generate(makeConfig(profile));
      const hosted = files.find((f) => f.relativePath === 'router/src/hosted-client.ts')!;
      expect(hosted.content).toMatch(/api\.openai\.com\/v1\/chat\/completions/);
      expect(hosted.content).toMatch(/OPENAI_API_KEY/);
    });

    it('wires both branches when both APIs are declared', () => {
      const profile = makeProfile({ externalApis: ['anthropic', 'openai'] });
      const files = new LocalRouterGenerator().generate(makeConfig(profile));
      const hosted = files.find((f) => f.relativePath === 'router/src/hosted-client.ts')!;
      expect(hosted.content).toMatch(/callAnthropic/);
      expect(hosted.content).toMatch(/callOpenai/);
    });

    it('env template includes only the keys for the declared APIs', () => {
      const onlyAnthropic = new LocalRouterGenerator()
        .generate(makeConfig(makeProfile({ externalApis: ['anthropic'] })))
        .find((f) => f.relativePath === 'router/.env.example')!;
      expect(onlyAnthropic.content).toMatch(/ANTHROPIC_API_KEY/);
      expect(onlyAnthropic.content).not.toMatch(/OPENAI_API_KEY/);
    });
  });

  describe('local-client default model', () => {
    it('uses the profile defaultLocalModel as the configured local model', () => {
      const files = new LocalRouterGenerator().generate(makeConfig(makeProfile()));
      const local = files.find((f) => f.relativePath === 'router/src/local-client.ts')!;
      expect(local.content).toMatch(/'qwen2\.5-coder:32b'/);
    });

    it('falls back to a sensible default when no model is configured', () => {
      const profile = makeProfile({
        defaultLocalModel: undefined,
        ollamaModels: undefined,
      });
      const files = new LocalRouterGenerator().generate(makeConfig(profile));
      const local = files.find((f) => f.relativePath === 'router/src/local-client.ts')!;
      expect(local.content).toMatch(/'llama3\.1:8b'/);
    });
  });

  describe('audit logger', () => {
    it('warns about the missing hash key when compliance is active', () => {
      const profile = makeProfile({ complianceFrameworks: ['hipaa'] });
      const files = new LocalRouterGenerator().generate(makeConfig(profile));
      const audit = files.find((f) => f.relativePath === 'router/src/audit.ts')!;
      expect(audit.content).toMatch(/Compliance frameworks active: hipaa/);
      expect(audit.content).toMatch(/ROUTER_AUDIT_HASH_KEY is unset/);
    });

    it('never logs raw prompts — only the HMAC-hashed value', () => {
      const files = new LocalRouterGenerator().generate(makeConfig(makeProfile()));
      const audit = files.find((f) => f.relativePath === 'router/src/audit.ts')!;
      expect(audit.content).toMatch(/createHmac\('sha256'/);
      expect(audit.content).toMatch(/promptHash/);
    });
  });

  describe('classifier', () => {
    it('exposes a token-count and regex-hint signal', () => {
      const files = new LocalRouterGenerator().generate(makeConfig(makeProfile()));
      const classifier = files.find((f) => f.relativePath === 'router/src/classifier.ts')!;
      expect(classifier.content).toMatch(/ROUTER_MAX_LOCAL_TOKENS/);
      expect(classifier.content).toMatch(/ESCALATION_HINTS/);
    });
  });

  describe('rule + runbook', () => {
    it('rule file is path-scoped to router/**', () => {
      const files = new LocalRouterGenerator().generate(makeConfig(makeProfile()));
      const rule = files.find(
        (f) => f.relativePath === '.claude/rules/router-conventions.md',
      )!;
      expect(rule.content).toMatch(/pathScope: router\/\*\*/);
    });

    it('runbook includes hosted-API hardening when externalApis are configured', () => {
      const files = new LocalRouterGenerator().generate(makeConfig(makeProfile()));
      const runbook = files.find((f) => f.relativePath === 'ROUTER_RUNBOOK.md')!;
      expect(runbook.content).toMatch(/ANTHROPIC_API_KEY/);
    });

    it('runbook includes HIPAA hardening when HIPAA is active', () => {
      const profile = makeProfile({ complianceFrameworks: ['hipaa'] });
      const files = new LocalRouterGenerator().generate(makeConfig(profile));
      const runbook = files.find((f) => f.relativePath === 'ROUTER_RUNBOOK.md')!;
      expect(runbook.content).toMatch(/PHI redaction \(HIPAA\)/);
      expect(runbook.content).toMatch(/six years/);
    });
  });
});
