import {
  GitConfigurationError,
  GitIntegrationError,
  type GitCommitFileSpec,
  type GitPlatform,
  type GitPlatformOptions,
  type GitPullRequestRef,
} from './git-platform.js';

/**
 * GitLab adapter using the REST v4 API.
 *
 * Atomic multi-file commit:
 *   POST /api/v4/projects/:id/repository/commits
 *     { branch, start_branch, commit_message, actions: [{action, file_path, content, encoding}] }
 *
 * GitLab's `actions[]` API differs from GitHub's tree-builder model in
 * one important way: every action is either `create` (file must not
 * exist) or `update` (file must exist). There is no upsert, so we
 * pre-fetch the base-branch tree once, build a Set of existing paths,
 * and classify each file accordingly. The tree call is recursive,
 * paginated, and capped at the typical EmbedIQ output size (15-40
 * files in a project root) so the per_page=100 default usually means
 * one round trip.
 *
 * Branch idempotency matches the GitHub adapter: if the target branch
 * already exists we delete and recreate it from start_branch HEAD.
 * That mirrors the GitHub "move ref to new commit" behaviour rather
 * than appending a new commit on top of a stale branch.
 *
 * Token: GitLab Personal Access Token with `api` scope (write access
 * to commits + merge requests). Group / project tokens with the same
 * scope work identically.
 */
export class GitLabAdapter implements GitPlatform {
  readonly providerId = 'gitlab' as const;

  private readonly fetchImpl: typeof fetch;
  private readonly apiBaseUrl: string;
  private readonly projectId: string;

  constructor(private readonly options: GitPlatformOptions) {
    if (!options.repo) {
      throw new GitConfigurationError('GitLab repo path is required (e.g. "group/project")');
    }
    if (!options.token) {
      throw new GitConfigurationError('GitLab token is required');
    }
    if (!options.baseBranch) {
      throw new GitConfigurationError('Base branch is required');
    }
    this.apiBaseUrl = (options.apiBaseUrl ?? 'https://gitlab.com').replace(/\/$/, '');
    // GitLab accepts either the numeric project id or the URL-encoded
    // project path. Using the path keeps configuration human-readable;
    // we URL-encode here once.
    this.projectId = encodeURIComponent(options.repo);
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
      throw new GitConfigurationError('GitLab requires at least one file action per commit');
    }

    // 1) Reset the target branch so the commit is applied to a clean
    //    fork of start_branch, matching GitHub's branch-move semantic.
    if (await this.branchExists(branchName)) {
      await this.deleteBranch(branchName);
    }

    // 2) Walk the base-branch tree once to know which file paths already
    //    exist there — drives the create/update choice for each action.
    const existingPaths = await this.listExistingPaths(this.options.baseBranch);

    const actions = files.map((f) => ({
      action: existingPaths.has(f.path) ? 'update' as const : 'create' as const,
      file_path: f.path,
      content: f.content,
      encoding: f.encoding === 'base64' ? 'base64' as const : 'text' as const,
    }));

    // 3) Single commits API call creates the branch from start_branch
    //    and applies all file actions atomically.
    await this.request<GitLabCommitResponse>(
      'POST',
      `/projects/${this.projectId}/repository/commits`,
      {
        branch: branchName,
        start_branch: this.options.baseBranch,
        commit_message: message,
        actions,
      },
    );
  }

  async openPullRequest(
    branchName: string,
    title: string,
    body: string,
  ): Promise<GitPullRequestRef> {
    const response = await this.request<GitLabMergeRequestResponse>(
      'POST',
      `/projects/${this.projectId}/merge_requests`,
      {
        source_branch: branchName,
        target_branch: this.options.baseBranch,
        title,
        description: body,
      },
    );
    return {
      url: response.web_url,
      number: response.iid,
      title: response.title,
      branch: branchName,
    };
  }

  // ─── GitLab API helpers ───────────────────────────────────────────────

  private async branchExists(branchName: string): Promise<boolean> {
    try {
      await this.request<GitLabBranchResponse>(
        'GET',
        `/projects/${this.projectId}/repository/branches/${encodeURIComponent(branchName)}`,
      );
      return true;
    } catch (err) {
      if (err instanceof GitIntegrationError && err.status === 404) return false;
      throw err;
    }
  }

  private async deleteBranch(branchName: string): Promise<void> {
    await this.request<void>(
      'DELETE',
      `/projects/${this.projectId}/repository/branches/${encodeURIComponent(branchName)}`,
    );
  }

  /**
   * Recursive tree listing for the base branch. Returns a Set of all
   * blob paths so action classification is O(1) per file.
   *
   * Pagination uses the `x-next-page` response header; absence (or
   * empty value) signals the final page. If the ref does not yet
   * exist (empty repo, non-existent branch) we return an empty set —
   * every action then defaults to `create`.
   */
  private async listExistingPaths(ref: string): Promise<Set<string>> {
    const out = new Set<string>();
    let page = 1;
    const perPage = 100;
    while (true) {
      const path = `/projects/${this.projectId}/repository/tree`
        + `?recursive=true&ref=${encodeURIComponent(ref)}&per_page=${perPage}&page=${page}`;
      let response: { entries: GitLabTreeEntry[]; nextPage: string | null };
      try {
        response = await this.requestWithHeaders<GitLabTreeEntry[]>('GET', path);
      } catch (err) {
        if (err instanceof GitIntegrationError && err.status === 404) {
          // Empty repo or unknown ref — every action falls back to `create`.
          return out;
        }
        throw err;
      }
      for (const entry of response.entries) {
        if (entry.type === 'blob') out.add(entry.path);
      }
      if (!response.nextPage || response.nextPage === '' || response.entries.length < perPage) {
        return out;
      }
      page = Number(response.nextPage);
      if (!Number.isFinite(page) || page <= 0) return out;
    }
  }

  // ─── Transport ────────────────────────────────────────────────────────

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const { entries } = await this.requestWithHeaders<T>(method, path, body);
    return entries as T;
  }

  private async requestWithHeaders<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<{ entries: T; nextPage: string | null }> {
    const url = `${this.apiBaseUrl}/api/v4${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      // GitLab honours both PRIVATE-TOKEN (PAT) and Authorization Bearer
      // (OAuth + project/group tokens). Bearer keeps us aligned with the
      // GitHub adapter's idiom.
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
        `Network error calling GitLab (${method} ${path}): ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        err,
      );
    }

    if (!response.ok) {
      const text = await safeReadText(response);
      throw new GitIntegrationError(
        `GitLab ${method} ${path} failed: ${response.status} ${response.statusText}${text ? ` — ${text}` : ''}`,
        response.status,
      );
    }

    const nextPage = response.headers.get('x-next-page');
    if (response.status === 204) return { entries: undefined as T, nextPage };
    const json = (await response.json()) as T;
    return { entries: json, nextPage };
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

// ─── GitLab API response shapes (narrowed to the fields we consume) ─────

interface GitLabBranchResponse {
  name: string;
  commit: { id: string };
}

interface GitLabCommitResponse {
  id: string;
  short_id: string;
  title: string;
}

interface GitLabTreeEntry {
  id: string;
  name: string;
  type: 'tree' | 'blob' | 'commit';
  path: string;
  mode: string;
}

interface GitLabMergeRequestResponse {
  web_url: string;
  iid: number;
  title: string;
}
