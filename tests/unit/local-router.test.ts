import { describe, it, expect } from 'vitest';
import {
  LocalRouterGenerator,
  shouldEmitLocalRouter,
} from '../../src/synthesizer/generators/local-router.js';
import { buildRoutingPolicy } from '../../src/synthesizer/policy/index.js';
import { createEmptyProfile, type UserProfile, type GenerationContext } from '../../src/types/index.js';

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

function makeConfig(profile: UserProfile): GenerationContext {
  return { profile, policy: buildRoutingPolicy(profile) };
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
      expect(paths).toContain('router/src/dispatch.ts');
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

  describe('decision-only — no credentials, no direct provider call', () => {
    it('emits dispatch.ts and never a hosted-client or redactor', () => {
      const profile = makeProfile({ complianceFrameworks: ['hipaa'] });
      const paths = new LocalRouterGenerator()
        .generate(makeConfig(profile))
        .map((f) => f.relativePath);
      expect(paths).toContain('router/src/dispatch.ts');
      expect(paths).not.toContain('router/src/hosted-client.ts');
      expect(paths).not.toContain('router/src/redactor.ts');
    });

    it('dispatch.ts forwards to GATEWAY_BASE_URL and holds no provider keys', () => {
      const files = new LocalRouterGenerator().generate(makeConfig(makeProfile()));
      const dispatch = files.find((f) => f.relativePath === 'router/src/dispatch.ts')!;
      expect(dispatch.content).toMatch(/forwardToGateway/);
      expect(dispatch.content).toMatch(/GATEWAY_BASE_URL/);
      expect(dispatch.content).not.toMatch(/ANTHROPIC_API_KEY/);
      expect(dispatch.content).not.toMatch(/OPENAI_API_KEY/);
      expect(dispatch.content).not.toMatch(/api\.anthropic\.com/);
      expect(dispatch.content).not.toMatch(/api\.openai\.com/);
    });

    it('server.ts forwards escalations to the gateway, never redacts or calls a provider', () => {
      const server = new LocalRouterGenerator()
        .generate(makeConfig(makeProfile({ complianceFrameworks: ['hipaa'] })))
        .find((f) => f.relativePath === 'router/src/server.ts')!;
      expect(server.content).toMatch(/import\s+\{\s*forwardToGateway\s*\}/);
      expect(server.content).not.toMatch(/redactPhi/);
      expect(server.content).not.toMatch(/hosted-client/);
    });

    it('env template carries GATEWAY_BASE_URL and no provider keys', () => {
      const env = new LocalRouterGenerator()
        .generate(makeConfig(makeProfile({ externalApis: ['anthropic', 'openai'] })))
        .find((f) => f.relativePath === 'router/.env.example')!;
      expect(env.content).toMatch(/GATEWAY_BASE_URL/);
      expect(env.content).not.toMatch(/ANTHROPIC_API_KEY/);
      expect(env.content).not.toMatch(/OPENAI_API_KEY/);
    });
  });

  describe('routing policy artifact', () => {
    it('emits router/routing-policy.yaml when the context carries a policy', () => {
      const files = new LocalRouterGenerator().generate(makeConfig(makeProfile()));
      const paths = files.map((f) => f.relativePath);
      expect(paths).toContain('router/routing-policy.yaml');
    });

    it('omits the policy artifact when the context has no policy', () => {
      const files = new LocalRouterGenerator().generate({ profile: makeProfile() });
      const paths = files.map((f) => f.relativePath);
      expect(paths).not.toContain('router/routing-policy.yaml');
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

    it('server.ts wires the score → gateway-forward path when confidence is enabled', () => {
      const files = new LocalRouterGenerator().generate(makeConfig(makeProfile()));
      const server = files.find((f) => f.relativePath === 'router/src/server.ts')!;
      expect(server.content).toMatch(/scoreConfidence\(/);
      expect(server.content).toMatch(/ROUTER_CONFIDENCE_THRESHOLD/);
      expect(server.content).toMatch(/forwardToGateway\(/);
    });

    it('env template includes the confidence threshold knob when enabled', () => {
      const files = new LocalRouterGenerator().generate(makeConfig(makeProfile()));
      const env = files.find((f) => f.relativePath === 'router/.env.example')!;
      expect(env.content).toMatch(/ROUTER_CONFIDENCE_THRESHOLD/);
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

    it('decides between local and escalate — never a provider-named destination', () => {
      const files = new LocalRouterGenerator().generate(makeConfig(makeProfile()));
      const classifier = files.find((f) => f.relativePath === 'router/src/classifier.ts')!;
      expect(classifier.content).toMatch(/'local' \| 'escalate'/);
      expect(classifier.content).not.toMatch(/'hosted'/);
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

    it('runbook documents gateway dispatch and holds no provider keys', () => {
      const files = new LocalRouterGenerator().generate(makeConfig(makeProfile()));
      const runbook = files.find((f) => f.relativePath === 'ROUTER_RUNBOOK.md')!;
      expect(runbook.content).toMatch(/GATEWAY_BASE_URL/);
      expect(runbook.content).not.toMatch(/ANTHROPIC_API_KEY/);
    });

    it('runbook includes HIPAA egress enforcement when HIPAA is active', () => {
      const profile = makeProfile({ complianceFrameworks: ['hipaa'] });
      const files = new LocalRouterGenerator().generate(makeConfig(profile));
      const runbook = files.find((f) => f.relativePath === 'ROUTER_RUNBOOK.md')!;
      expect(runbook.content).toMatch(/PHI egress enforcement \(HIPAA\)/);
      expect(runbook.content).toMatch(/six years/);
    });
  });
});
