/**
 * Specification for a single file to commit as part of a multi-file
 * branch update. `content` is always supplied as-is for utf-8 text; for
 * binary payloads callers should base64-encode and set `encoding: 'base64'`.
 */
export interface GitCommitFileSpec {
  path: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
}

/** Identity of a pull / merge request created on the remote platform. */
export interface GitPullRequestRef {
  url: string;
  number: number;
  title: string;
  /** Branch name the PR was opened from. */
  branch: string;
}

export interface GitPlatformOptions {
  /** Repository slug — GitHub: `owner/repo`. */
  repo: string;
  /** Auth token with write scope (contents + pull requests). */
  token: string;
  /** Branch the new branch is forked from and the PR targets. */
  baseBranch: string;
  /** Override for self-hosted platforms (GitHub Enterprise, etc.). */
  apiBaseUrl?: string;
  /** Override the HTTP client — tests inject a stub. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

export type GitProviderId = 'github' | 'gitlab' | 'bitbucket';

/**
 * The minimal surface every platform adapter must implement to serve
 * EmbedIQ's PR-mode output. GitLab and Bitbucket adapters are documented
 * as v3.2 follow-ups — GitHub is the v1 target because it dominates the
 * AI coding agent user base and its Git Data API gives us atomic
 * multi-file commits without a local working tree.
 */
export interface GitPlatform {
  readonly providerId: GitProviderId;

  /**
   * Create (or move) a branch at HEAD of the base branch and commit the
   * supplied files as a single commit. Idempotent: if the branch already
   * exists, its ref is moved to the new commit rather than erroring.
   */
  createBranchWithFiles(
    branchName: string,
    files: readonly GitCommitFileSpec[],
    message: string,
  ): Promise<void>;

  /** Open a PR from `branchName` → the configured base branch. */
  openPullRequest(
    branchName: string,
    title: string,
    body: string,
  ): Promise<GitPullRequestRef>;
}

export class GitIntegrationError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GitIntegrationError';
  }
}

export class GitConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitConfigurationError';
  }
}
