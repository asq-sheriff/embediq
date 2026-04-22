import {
  GitConfigurationError,
  GitIntegrationError,
  type GitCommitFileSpec,
  type GitPlatform,
  type GitPlatformOptions,
  type GitPullRequestRef,
} from './git-platform.js';

/**
 * Bitbucket Cloud adapter using REST API 2.0.
 *
 * Atomic multi-file commit goes through the /src endpoint, which is
 * unusual among git platforms: instead of separate blob/tree/commit
 * primitives or a JSON action array, you POST `multipart/form-data`
 * where each file is a form field whose **name is the file path** and
 * whose value is the file content. Branch creation and the commit are
 * the same call when the branch doesn't yet exist.
 *
 *   POST /2.0/repositories/{workspace}/{repo}/src
 *     branch=<branch>                      (target branch)
 *     parents=<sha>                        (parent commit; baseBranch HEAD)
 *     message=<commit message>
 *     <path/to/file>=<contents>           (one form field per file)
 *
 * Branch idempotency matches the other adapters: if the target branch
 * already exists, it's deleted first and recreated from baseBranch
 * HEAD. Without that, /src would append a commit on top of a stale
 * branch instead of resetting it — surprising behaviour for users
 * coming from GitHub-flavoured PR mode.
 *
 * Auth: Bearer token. Use a Repository or Workspace Access Token from
 * the Bitbucket admin UI. App-password Basic auth is legacy and not
 * supported here — Bearer is the recommended modern path for service
 * automation, and it keeps the header convention identical to the
 * GitHub and GitLab adapters.
 */
export class BitbucketAdapter implements GitPlatform {
  readonly providerId = 'bitbucket' as const;

  private readonly fetchImpl: typeof fetch;
  private readonly apiBaseUrl: string;
  private readonly workspace: string;
  private readonly repoSlug: string;

  constructor(private readonly options: GitPlatformOptions) {
    if (!options.repo.includes('/')) {
      throw new GitConfigurationError(
        `Bitbucket repo must be in "workspace/repo" form (got: "${options.repo}")`,
      );
    }
    if (!options.token) {
      throw new GitConfigurationError('Bitbucket token is required');
    }
    if (!options.baseBranch) {
      throw new GitConfigurationError('Base branch is required');
    }
    [this.workspace, this.repoSlug] = options.repo.split('/', 2);
    this.apiBaseUrl = (options.apiBaseUrl ?? 'https://api.bitbucket.org').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl
      ?? (typeof fetch === 'function' ? fetch : undefined as never);
    if (!this.fetchImpl) {
      throw new GitConfigurationError(
        'Global fetch is unavailable — inject fetchImpl for older Node runtimes',
      );
    }
  }

  async createBranchWithFiles(
    branchName: string,
    files: readonly GitCommitFileSpec[],
    message: string,
  ): Promise<void> {
    if (files.length === 0) {
      throw new GitConfigurationError('Bitbucket requires at least one file per commit');
    }

    // 1) Reset the target branch to mirror GitHub's branch-move semantic.
    if (await this.branchExists(branchName)) {
      await this.deleteBranch(branchName);
    }

    // 2) Look up baseBranch HEAD so the new branch's first commit has
    //    a known parent. /src will create the branch automatically.
    const baseSha = await this.getBranchHeadSha(this.options.baseBranch);

    // 3) Build the multipart form body. `branch` + `parents` + `message`
    //    are reserved field names; everything else is interpreted as a
    //    file path.
    const form = new FormData();
    form.append('branch', branchName);
    form.append('parents', baseSha);
    form.append('message', message);
    for (const file of files) {
      if (file.encoding === 'base64') {
        // Decode to bytes and send as a Blob so multipart carries the
        // raw binary rather than the base64 text.
        const bytes = Buffer.from(file.content, 'base64');
        const blob = new Blob([new Uint8Array(bytes)]);
        form.append(file.path, blob, file.path);
      } else {
        form.append(file.path, file.content);
      }
    }

    // 4) POST /src — single call, branch + commit are atomic.
    await this.requestForm<void>(
      'POST',
      `/2.0/repositories/${this.workspace}/${this.repoSlug}/src`,
      form,
    );
  }

  async openPullRequest(
    branchName: string,
    title: string,
    body: string,
  ): Promise<GitPullRequestRef> {
    const response = await this.requestJson<BitbucketPullRequestResponse>(
      'POST',
      `/2.0/repositories/${this.workspace}/${this.repoSlug}/pullrequests`,
      {
        title,
        description: body,
        source: { branch: { name: branchName } },
        destination: { branch: { name: this.options.baseBranch } },
      },
    );
    const url = response.links?.html?.href
      ?? `https://bitbucket.org/${this.workspace}/${this.repoSlug}/pull-requests/${response.id}`;
    return {
      url,
      number: response.id,
      title: response.title,
      branch: branchName,
    };
  }

  // ─── Bitbucket API helpers ───────────────────────────────────────────

  private async branchExists(branchName: string): Promise<boolean> {
    try {
      await this.requestJson<BitbucketBranchResponse>(
        'GET',
        `/2.0/repositories/${this.workspace}/${this.repoSlug}/refs/branches/${encodeURIComponent(branchName)}`,
      );
      return true;
    } catch (err) {
      if (err instanceof GitIntegrationError && err.status === 404) return false;
      throw err;
    }
  }

  private async deleteBranch(branchName: string): Promise<void> {
    await this.requestJson<void>(
      'DELETE',
      `/2.0/repositories/${this.workspace}/${this.repoSlug}/refs/branches/${encodeURIComponent(branchName)}`,
    );
  }

  private async getBranchHeadSha(branchName: string): Promise<string> {
    const branch = await this.requestJson<BitbucketBranchResponse>(
      'GET',
      `/2.0/repositories/${this.workspace}/${this.repoSlug}/refs/branches/${encodeURIComponent(branchName)}`,
    );
    if (!branch.target?.hash) {
      throw new GitIntegrationError(
        `Bitbucket branch "${branchName}" has no target hash`,
      );
    }
    return branch.target.hash;
  }

  // ─── Transport ────────────────────────────────────────────────────────

  private requestJson<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    return this.execute<T>(method, path, {
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  private requestForm<T>(
    method: 'POST',
    path: string,
    body: FormData,
  ): Promise<T> {
    // Don't set Content-Type for multipart — fetch derives the right
    // boundary header automatically when given FormData.
    return this.execute<T>(method, path, { body });
  }

  private async execute<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    init: { body?: BodyInit; headers?: Record<string, string> },
  ): Promise<T> {
    const url = `${this.apiBaseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.options.token}`,
      'User-Agent': 'embediq',
      ...(init.headers ?? {}),
    };

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: init.body,
      });
    } catch (err) {
      throw new GitIntegrationError(
        `Network error calling Bitbucket (${method} ${path}): ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        err,
      );
    }

    if (!response.ok) {
      const text = await safeReadText(response);
      throw new GitIntegrationError(
        `Bitbucket ${method} ${path} failed: ${response.status} ${response.statusText}${text ? ` — ${text}` : ''}`,
        response.status,
      );
    }

    if (response.status === 204) return undefined as T;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      // /src returns text/plain on success — nothing to deserialize.
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

// ─── Bitbucket API response shapes (narrowed to the fields we consume) ─

interface BitbucketBranchResponse {
  name: string;
  target?: { hash: string };
}

interface BitbucketPullRequestResponse {
  id: number;
  title: string;
  links?: { html?: { href: string } };
}
