import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildPlatform,
  openPrForGeneration,
  resolveGitConfigFromEnv,
} from '../../src/integrations/git/open-pr.js';
import {
  GitConfigurationError,
  type GitCommitFileSpec,
  type GitPlatform,
  type GitPullRequestRef,
} from '../../src/integrations/git/git-platform.js';
import { createEmptyProfile, type GeneratedFile } from '../../src/types/index.js';

function makeStubPlatform(): {
  platform: GitPlatform;
  log: Array<{ op: 'branch' | 'pr'; [k: string]: unknown }>;
} {
  const log: Array<{ op: 'branch' | 'pr'; [k: string]: unknown }> = [];
  const platform: GitPlatform = {
    providerId: 'github',
    async createBranchWithFiles(branchName, files, message) {
      log.push({ op: 'branch', branchName, files, message });
    },
    async openPullRequest(branchName, title, body): Promise<GitPullRequestRef> {
      log.push({ op: 'pr', branchName, title, body });
      return {
        url: `https://example.com/${branchName}`,
        number: 7,
        title,
        branch: branchName,
      };
    },
  };
  return { platform, log };
}

describe('openPrForGeneration', () => {
  it('calls createBranchWithFiles then openPullRequest on the injected platform', async () => {
    const { platform, log } = makeStubPlatform();
    const result = await openPrForGeneration({
      files: [
        { relativePath: 'CLAUDE.md', content: '# P', description: '' },
        { relativePath: '.claude/settings.json', content: '{}', description: '' },
      ] as GeneratedFile[],
      profile: createEmptyProfile(),
      platform,
      branchName: 'embediq/test-branch',
    });

    expect(log.map((l) => l.op)).toEqual(['branch', 'pr']);
    expect(result.branchName).toBe('embediq/test-branch');
    expect(result.pullRequest.number).toBe(7);
    expect(result.fileCount).toBe(2);

    const branch = log[0] as { files: GitCommitFileSpec[] };
    expect(branch.files.map((f) => f.path).sort()).toEqual([
      '.claude/settings.json',
      'CLAUDE.md',
    ]);
  });

  it('generates a default branch name when none is supplied', async () => {
    const { platform } = makeStubPlatform();
    const result = await openPrForGeneration({
      files: [{ relativePath: 'CLAUDE.md', content: '#', description: '' }] as GeneratedFile[],
      profile: createEmptyProfile(),
      platform,
    });
    expect(result.branchName).toMatch(/^embediq\/\d{8}-\d{6}$/);
  });

  it('uses the builtPrTemplate result for title and body', async () => {
    const { platform, log } = makeStubPlatform();
    await openPrForGeneration({
      files: [{ relativePath: 'CLAUDE.md', content: '#', description: '' }] as GeneratedFile[],
      profile: createEmptyProfile(),
      platform,
    });
    const pr = log[1] as { title: string; body: string };
    expect(pr.title).toBe('EmbedIQ: regenerate configuration');
    expect(pr.body).toContain('## Summary');
    expect(pr.body).toContain('## Changes');
  });
});

describe('resolveGitConfigFromEnv', () => {
  const ENV_KEYS = [
    'EMBEDIQ_GIT_PROVIDER',
    'EMBEDIQ_GIT_REPO',
    'EMBEDIQ_GIT_TOKEN',
    'EMBEDIQ_GIT_BASE_BRANCH',
    'EMBEDIQ_GIT_API_BASE_URL',
  ] as const;

  let snapshot: Record<string, string | undefined>;
  beforeEach(() => {
    snapshot = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (snapshot[k] !== undefined) process.env[k] = snapshot[k]!;
      else delete process.env[k];
    }
  });

  it('reads the canonical env vars and defaults baseBranch to "main"', () => {
    process.env.EMBEDIQ_GIT_PROVIDER = 'github';
    process.env.EMBEDIQ_GIT_REPO = 'acme/project';
    process.env.EMBEDIQ_GIT_TOKEN = 'tkn';
    const { provider, platformOptions } = resolveGitConfigFromEnv();
    expect(provider).toBe('github');
    expect(platformOptions.repo).toBe('acme/project');
    expect(platformOptions.token).toBe('tkn');
    expect(platformOptions.baseBranch).toBe('main');
  });

  it('throws GitConfigurationError when repo or token is missing', () => {
    expect(() => resolveGitConfigFromEnv()).toThrow(GitConfigurationError);

    process.env.EMBEDIQ_GIT_REPO = 'acme/project';
    expect(() => resolveGitConfigFromEnv()).toThrow(/EMBEDIQ_GIT_TOKEN/);
  });

  it('throws on an unknown provider', () => {
    process.env.EMBEDIQ_GIT_PROVIDER = 'fossil';
    process.env.EMBEDIQ_GIT_REPO = 'acme/project';
    process.env.EMBEDIQ_GIT_TOKEN = 'tkn';
    expect(() => resolveGitConfigFromEnv()).toThrow(/Unknown git provider/);
  });

  it('buildPlatform returns a GitHubAdapter when provider=github', () => {
    process.env.EMBEDIQ_GIT_PROVIDER = 'github';
    process.env.EMBEDIQ_GIT_REPO = 'acme/project';
    process.env.EMBEDIQ_GIT_TOKEN = 'tkn';
    const platform = buildPlatform();
    expect(platform.providerId).toBe('github');
  });

  it('buildPlatform throws a clear error for gitlab/bitbucket (deferred)', () => {
    process.env.EMBEDIQ_GIT_PROVIDER = 'gitlab';
    process.env.EMBEDIQ_GIT_REPO = 'acme/project';
    process.env.EMBEDIQ_GIT_TOKEN = 'tkn';
    expect(() => buildPlatform()).toThrow(/not supported/);
  });
});
