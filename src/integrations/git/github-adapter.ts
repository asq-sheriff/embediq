import {
  GitConfigurationError,
  GitIntegrationError,
  type GitCommitFileSpec,
  type GitPlatform,
  type GitPlatformOptions,
  type GitPullRequestRef,
} from './git-platform.js';

/**
 * GitHub adapter using the REST v3 Git Data API. Flow for
 * createBranchWithFiles:
 *
 *   1. GET  /repos/:owner/:repo/git/ref/heads/:baseBranch  → base SHA
 *   2. GET  /repos/:owner/:repo/git/commits/:sha           → base tree
 *   3. POST /repos/:owner/:repo/git/blobs                  (per file)
 *   4. POST /repos/:owner/:repo/git/trees                  → new tree
 *   5. POST /repos/:owner/:repo/git/commits                → new commit
 *   6. POST|PATCH /repos/:owner/:repo/git/refs             → create/move branch
 *
 * Step 6 is `POST /git/refs` the first time and `PATCH /git/refs/heads/X`
 * if the branch already exists. We probe with GET and choose the
 * appropriate verb.
 *
 * Token needs `contents:write` + `pull_requests:write` on the target repo.
 */
export class GitHubAdapter implements GitPlatform {
  readonly providerId = 'github' as const;

  private readonly fetchImpl: typeof fetch;
  private readonly apiBaseUrl: string;

  constructor(private readonly options: GitPlatformOptions) {
    if (!options.repo.includes('/')) {
      throw new GitConfigurationError(
        `GitHub repo must be in "owner/repo" form (got: "${options.repo}")`,
      );
    }
    if (!options.token) {
      throw new GitConfigurationError('GitHub token is required');
    }
    if (!options.baseBranch) {
      throw new GitConfigurationError('Base branch is required');
    }
    this.apiBaseUrl = (options.apiBaseUrl ?? 'https://api.github.com').replace(/\/$/, '');
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
    const baseRef = await this.getRef(`heads/${this.options.baseBranch}`);
    const baseCommit = await this.getCommit(baseRef.object.sha);

    const treeEntries: Array<{ path: string; mode: string; type: 'blob'; sha: string }> = [];
    for (const file of files) {
      const blob = await this.createBlob(file);
      treeEntries.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      });
    }

    const newTree = await this.createTree(baseCommit.tree.sha, treeEntries);
    const newCommit = await this.createCommit(message, newTree.sha, baseRef.object.sha);

    const existing = await this.getRefOrNull(`heads/${branchName}`);
    if (existing) {
      await this.updateRef(`heads/${branchName}`, newCommit.sha);
    } else {
      await this.createRef(`refs/heads/${branchName}`, newCommit.sha);
    }
  }

  async openPullRequest(
    branchName: string,
    title: string,
    body: string,
  ): Promise<GitPullRequestRef> {
    const response = await this.request<GitHubPullResponse>(
      'POST',
      `/repos/${this.options.repo}/pulls`,
      {
        title,
        body,
        head: branchName,
        base: this.options.baseBranch,
      },
    );
    return {
      url: response.html_url,
      number: response.number,
      title: response.title,
      branch: branchName,
    };
  }

  // ─── Git Data API helpers ─────────────────────────────────────────────

  private async getRef(ref: string): Promise<GitHubRefResponse> {
    return this.request<GitHubRefResponse>(
      'GET',
      `/repos/${this.options.repo}/git/ref/${ref}`,
    );
  }

  private async getRefOrNull(ref: string): Promise<GitHubRefResponse | null> {
    try {
      return await this.getRef(ref);
    } catch (err) {
      if (err instanceof GitIntegrationError && err.status === 404) return null;
      throw err;
    }
  }

  private getCommit(sha: string): Promise<GitHubCommitResponse> {
    return this.request<GitHubCommitResponse>(
      'GET',
      `/repos/${this.options.repo}/git/commits/${sha}`,
    );
  }

  private createBlob(file: GitCommitFileSpec): Promise<GitHubBlobResponse> {
    const body = file.encoding === 'base64'
      ? { content: file.content, encoding: 'base64' }
      : { content: file.content, encoding: 'utf-8' };
    return this.request<GitHubBlobResponse>(
      'POST',
      `/repos/${this.options.repo}/git/blobs`,
      body,
    );
  }

  private createTree(
    baseTree: string,
    entries: Array<{ path: string; mode: string; type: 'blob'; sha: string }>,
  ): Promise<GitHubTreeResponse> {
    return this.request<GitHubTreeResponse>(
      'POST',
      `/repos/${this.options.repo}/git/trees`,
      { base_tree: baseTree, tree: entries },
    );
  }

  private createCommit(
    message: string,
    tree: string,
    parent: string,
  ): Promise<GitHubCommitResponse> {
    return this.request<GitHubCommitResponse>(
      'POST',
      `/repos/${this.options.repo}/git/commits`,
      { message, tree, parents: [parent] },
    );
  }

  private createRef(ref: string, sha: string): Promise<GitHubRefResponse> {
    return this.request<GitHubRefResponse>(
      'POST',
      `/repos/${this.options.repo}/git/refs`,
      { ref, sha },
    );
  }

  private updateRef(ref: string, sha: string): Promise<GitHubRefResponse> {
    return this.request<GitHubRefResponse>(
      'PATCH',
      `/repos/${this.options.repo}/git/refs/${ref}`,
      { sha, force: false },
    );
  }

  // ─── Transport ────────────────────────────────────────────────────────

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.apiBaseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${this.options.token}`,
      'User-Agent': 'embediq',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new GitIntegrationError(
        `Network error calling GitHub (${method} ${path}): ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        err,
      );
    }

    if (!response.ok) {
      const text = await safeReadText(response);
      throw new GitIntegrationError(
        `GitHub ${method} ${path} failed: ${response.status} ${response.statusText}${text ? ` — ${text}` : ''}`,
        response.status,
      );
    }

    if (response.status === 204) return undefined as T;
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

// ─── GitHub API response shapes (narrowed to the fields we consume) ─────

interface GitHubRefResponse {
  ref: string;
  object: { sha: string; type: string };
}

interface GitHubCommitResponse {
  sha: string;
  tree: { sha: string };
}

interface GitHubBlobResponse {
  sha: string;
}

interface GitHubTreeResponse {
  sha: string;
}

interface GitHubPullResponse {
  html_url: string;
  number: number;
  title: string;
}
