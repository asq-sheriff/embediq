import type { GeneratedFile, UserProfile, ValidationResult } from '../../types/index.js';
import { BitbucketAdapter } from './bitbucket-adapter.js';
import { GitHubAdapter } from './github-adapter.js';
import { GitLabAdapter } from './gitlab-adapter.js';
import {
  GitConfigurationError,
  GitIntegrationError,
  type GitCommitFileSpec,
  type GitPlatform,
  type GitPlatformOptions,
  type GitProviderId,
  type GitPullRequestRef,
} from './git-platform.js';
import { buildPrTemplate, type BuildPrTemplateInput } from './pr-template.js';

export interface OpenPrOptions {
  /** Files produced by the synthesizer orchestrator. */
  files: readonly GeneratedFile[];
  /** Used to compose the PR title/body summary. */
  profile: UserProfile;
  /** Optional — attach validation results to the PR body. */
  validation?: ValidationResult;
  /** Optional — attach drift + contributor context from autopilot / session. */
  driftSummary?: BuildPrTemplateInput['driftSummary'];
  contributors?: BuildPrTemplateInput['contributors'];
  /** Branch name. Defaults to `embediq/<timestamp>`. */
  branchName?: string;
  /** Override the default title. */
  titleOverride?: string;
  /** Inject a pre-built platform adapter. When omitted, built from env. */
  platform?: GitPlatform;
  /** Provider/repo/token/base — consulted when `platform` is not supplied. */
  provider?: GitProviderId;
  platformOptions?: GitPlatformOptions;
}

export interface OpenPrResult {
  pullRequest: GitPullRequestRef;
  branchName: string;
  fileCount: number;
}

/**
 * Orchestrate the full "push to branch + open PR" flow. Never invoked
 * as a side-effect of generate(): callers must opt-in explicitly (CLI
 * `--git-pr`, or a web endpoint that takes the same flag). The zero-
 * external-service default is preserved.
 */
export async function openPrForGeneration(options: OpenPrOptions): Promise<OpenPrResult> {
  const platform = options.platform ?? buildPlatform(options.provider, options.platformOptions);

  const branchName = options.branchName ?? defaultBranchName();
  const template = buildPrTemplate({
    profile: options.profile,
    files: options.files,
    validation: options.validation,
    driftSummary: options.driftSummary,
    contributors: options.contributors,
    titleOverride: options.titleOverride,
  });

  const commitFiles: GitCommitFileSpec[] = options.files.map((f) => ({
    path: f.relativePath,
    content: f.content,
    encoding: 'utf-8',
  }));

  try {
    await platform.createBranchWithFiles(branchName, commitFiles, template.commitMessage);
    const pullRequest = await platform.openPullRequest(branchName, template.title, template.body);
    return { pullRequest, branchName, fileCount: options.files.length };
  } catch (err) {
    if (err instanceof GitIntegrationError) throw err;
    throw new GitIntegrationError(
      `Failed to open PR: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      err,
    );
  }
}

/**
 * Resolve a platform from explicit options or environment variables.
 * Exported for tests — production callers should usually use
 * `resolveGitConfigFromEnv` directly when they need to inspect config.
 */
export function buildPlatform(
  providerOverride?: GitProviderId,
  optionsOverride?: GitPlatformOptions,
): GitPlatform {
  const { provider, platformOptions } = resolveGitConfigFromEnv(providerOverride, optionsOverride);
  switch (provider) {
    case 'github':
      return new GitHubAdapter(platformOptions);
    case 'gitlab':
      return new GitLabAdapter(platformOptions);
    case 'bitbucket':
      return new BitbucketAdapter(platformOptions);
  }
}

/**
 * Read git config from the environment, letting explicit overrides win.
 * Keeping this separate makes "what did EmbedIQ pick up?" diagnosable
 * from the CLI without actually opening a PR.
 */
export function resolveGitConfigFromEnv(
  providerOverride?: GitProviderId,
  optionsOverride?: GitPlatformOptions,
): { provider: GitProviderId; platformOptions: GitPlatformOptions } {
  if (providerOverride && optionsOverride) {
    return { provider: providerOverride, platformOptions: optionsOverride };
  }

  const provider = (providerOverride ?? process.env.EMBEDIQ_GIT_PROVIDER ?? 'github') as GitProviderId;
  if (!(['github', 'gitlab', 'bitbucket'] as const).includes(provider)) {
    throw new GitConfigurationError(
      `Unknown git provider "${provider}". Valid values: github, gitlab, bitbucket.`,
    );
  }

  const repo = optionsOverride?.repo ?? process.env.EMBEDIQ_GIT_REPO ?? '';
  const token = optionsOverride?.token ?? process.env.EMBEDIQ_GIT_TOKEN ?? '';
  const baseBranch = optionsOverride?.baseBranch ?? process.env.EMBEDIQ_GIT_BASE_BRANCH ?? 'main';
  const apiBaseUrl = optionsOverride?.apiBaseUrl ?? process.env.EMBEDIQ_GIT_API_BASE_URL;

  if (!repo) throw new GitConfigurationError('EMBEDIQ_GIT_REPO is required (e.g. "owner/repo")');
  if (!token) throw new GitConfigurationError('EMBEDIQ_GIT_TOKEN is required');

  return {
    provider,
    platformOptions: {
      repo,
      token,
      baseBranch,
      apiBaseUrl,
      fetchImpl: optionsOverride?.fetchImpl,
    },
  };
}

function defaultBranchName(now: Date = new Date()): string {
  // YYYYMMDD-HHmmss — lexically sortable, safe in branch names.
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`
    + `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `embediq/${stamp}`;
}
