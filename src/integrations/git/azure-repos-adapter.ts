import {
  GitConfigurationError,
  GitIntegrationError,
  type GitCommitFileSpec,
  type GitPlatform,
  type GitPlatformOptions,
  type GitPullRequestRef,
} from './git-platform.js';

/** All-zeros object id — Azure DevOps' sentinel for "this ref does not exist yet". */
const ZERO_OBJECT_ID = '0000000000000000000000000000000000000000';

/** Azure DevOps REST API version. GA on dev.azure.com. */
const API_VERSION = '7.1';

/**
 * Azure DevOps Repos adapter using the Git REST API.
 *
 * Repo addressing is three-part — `organization/project/repository` —
 * encoded in `EMBEDIQ_GIT_REPO` (e.g. `acme-org/PatientPortal/patient-portal-config`).
 * The project segment may contain spaces, so each segment is
 * `encodeURIComponent`-ed when building the repository root URL.
 *
 * Auth is the one deliberate divergence from the GitHub / GitLab /
 * Bitbucket adapters: Azure DevOps personal access tokens authenticate
 * via HTTP Basic with an empty username — `Authorization: Basic
 * base64(":" + PAT)` — not a Bearer header.
 *
 * Branch + commit are two calls rather than the GitHub blob/tree/commit
 * dance:
 *   1. Update the target ref to point at the base-branch tip (creating it
 *      if absent, resetting it if present) — this forks the branch from
 *      base, matching the other adapters' branch-move semantic.
 *   2. POST a single push whose commit is parented on the base tip and
 *      carries one change entry per file (add for new paths, edit for
 *      paths already in the base tree).
 *
 * Self-hosted Azure DevOps Server: set `EMBEDIQ_GIT_API_BASE_URL` to the
 * collection URL (e.g. `https://tfs.example.com/tfs/DefaultCollection`).
 */
export class AzureReposAdapter implements GitPlatform {
  // 'azure-repos' is added to GitProviderId in git-platform.ts.
  readonly providerId = 'azure-repos' as const;

  private readonly fetchImpl: typeof fetch;
  private readonly apiBaseUrl: string;
  private readonly org: string;
  private readonly project: string;
  private readonly repository: string;

  constructor(private readonly options: GitPlatformOptions) {
    const segments = options.repo.split('/');
    if (segments.length !== 3 || segments.some((s) => s.trim() === '')) {
      throw new GitConfigurationError(
        `Azure DevOps repo must be in "organization/project/repository" form (got: "${options.repo}")`,
      );
    }
    if (!options.token) {
      throw new GitConfigurationError('Azure DevOps token (PAT) is required');
    }
    if (!options.baseBranch) {
      throw new GitConfigurationError('Base branch is required');
    }
    [this.org, this.project, this.repository] = segments;
    this.apiBaseUrl = (options.apiBaseUrl ?? 'https://dev.azure.com').replace(/\/$/, '');
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
      throw new GitConfigurationError('Azure DevOps requires at least one file per commit');
    }

    const targetRef = `refs/heads/${branchName}`;

    // 1) Resolve the base-branch tip.
    const baseObjectId = await this.getRefObjectId(this.options.baseBranch);
    if (!baseObjectId) {
      throw new GitIntegrationError(
        `Azure DevOps base branch "${this.options.baseBranch}" not found`,
      );
    }

    // 2) Point the target ref at the base tip — create if new, reset if it
    //    already exists. This forks the branch from base (or resets it),
    //    giving the push below a clean, known parent.
    const existingTargetId = await this.getRefObjectId(branchName);
    await this.updateRef(targetRef, existingTargetId ?? ZERO_OBJECT_ID, baseObjectId);

    // 3) Classify each file add-vs-edit against the base tree. Azure item
    //    paths are absolute (leading "/"); GitCommitFileSpec paths are
    //    repo-relative, so normalize before comparing.
    const existingPaths = await this.listBasePaths();
    const changes = files.map((file) => {
      const normalized = file.path.replace(/^\//, '');
      return {
        changeType: existingPaths.has(normalized) ? 'edit' : 'add',
        item: { path: `/${normalized}` },
        newContent: {
          content: file.content,
          contentType: file.encoding === 'base64' ? 'base64encoded' : 'rawtext',
        },
      };
    });

    // 4) Single push: commit parented on the base tip lands on the target ref.
    await this.request<unknown>('POST', '/pushes', {
      body: {
        refUpdates: [{ name: targetRef, oldObjectId: baseObjectId }],
        commits: [{ comment: message, changes }],
      },
    });
  }

  async openPullRequest(
    branchName: string,
    title: string,
    body: string,
  ): Promise<GitPullRequestRef> {
    const response = await this.request<AzurePullRequestResponse>('POST', '/pullrequests', {
      body: {
        sourceRefName: `refs/heads/${branchName}`,
        targetRefName: `refs/heads/${this.options.baseBranch}`,
        title,
        description: body,
      },
    });
    // Azure's PR JSON omits a browser URL; construct the standard one.
    const url = `${this.apiBaseUrl}/${enc(this.org)}/${enc(this.project)}`
      + `/_git/${enc(this.repository)}/pullrequest/${response.pullRequestId}`;
    return {
      url,
      number: response.pullRequestId,
      title: response.title,
      branch: branchName,
    };
  }

  // ─── Azure DevOps API helpers ─────────────────────────────────────────

  /** Return the objectId of `refs/heads/<branch>`, or null if it doesn't exist. */
  private async getRefObjectId(branch: string): Promise<string | null> {
    const response = await this.request<AzureRefsResponse>('GET', '/refs', {
      query: { filter: `heads/${branch}` },
    });
    const fullName = `refs/heads/${branch}`;
    const match = response.value?.find((r) => r.name === fullName);
    return match?.objectId ?? null;
  }

  /** Create or move a branch ref. */
  private async updateRef(name: string, oldObjectId: string, newObjectId: string): Promise<void> {
    await this.request<unknown>('POST', '/refs', {
      body: [{ name, oldObjectId, newObjectId }],
    });
  }

  /** Set of blob paths (normalized, no leading slash) present on the base branch. */
  private async listBasePaths(): Promise<Set<string>> {
    let response: AzureItemsResponse;
    try {
      response = await this.request<AzureItemsResponse>('GET', '/items', {
        query: {
          recursionLevel: 'Full',
          'versionDescriptor.version': this.options.baseBranch,
          'versionDescriptor.versionType': 'branch',
        },
      });
    } catch (err) {
      // Empty repository → no items endpoint content; treat all files as new.
      if (err instanceof GitIntegrationError && err.status === 404) return new Set();
      throw err;
    }
    const paths = new Set<string>();
    for (const item of response.value ?? []) {
      if (item.gitObjectType === 'blob') {
        paths.add(item.path.replace(/^\//, ''));
      }
    }
    return paths;
  }

  // ─── Transport ────────────────────────────────────────────────────────

  private repositoryRoot(): string {
    return `${this.apiBaseUrl}/${enc(this.org)}/${enc(this.project)}`
      + `/_apis/git/repositories/${enc(this.repository)}`;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    init: { query?: Record<string, string>; body?: unknown } = {},
  ): Promise<T> {
    // api-version is mandatory — omitting it returns an HTML redirect, not a clean error.
    const params = new URLSearchParams({ ...(init.query ?? {}), 'api-version': API_VERSION });
    const url = `${this.repositoryRoot()}${path}?${params.toString()}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      // Azure DevOps PAT auth: Basic with an empty username.
      Authorization: `Basic ${Buffer.from(`:${this.options.token}`).toString('base64')}`,
      'User-Agent': 'embediq',
    };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
    } catch (err) {
      throw new GitIntegrationError(
        `Network error calling Azure DevOps (${method} ${path}): ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        err,
      );
    }

    if (!response.ok) {
      const text = await safeReadText(response);
      throw new GitIntegrationError(
        `Azure DevOps ${method} ${path} failed: ${response.status} ${response.statusText}${text ? ` — ${text}` : ''}`,
        response.status,
      );
    }

    if (response.status === 204) return undefined as T;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return undefined as T;
    return (await response.json()) as T;
  }
}

function enc(segment: string): string {
  return encodeURIComponent(segment);
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

// ─── Azure DevOps API response shapes (narrowed to the fields we consume) ─

interface AzureRefsResponse {
  value?: { name: string; objectId: string }[];
}

interface AzureItemsResponse {
  value?: { path: string; gitObjectType: string }[];
}

interface AzurePullRequestResponse {
  pullRequestId: number;
  title: string;
}
