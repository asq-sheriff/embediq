import { describe, it, expect, beforeEach } from 'vitest';
import { GitLabAdapter } from '../../src/integrations/git/gitlab-adapter.js';
import { GitConfigurationError, GitIntegrationError } from '../../src/integrations/git/git-platform.js';

interface Call {
  method: string;
  url: string;
  body?: unknown;
  headers: Record<string, string>;
}

interface ScriptedResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

function makeFetch(responses: ScriptedResponse[], calls: Call[] = []) {
  let i = 0;
  const impl: typeof fetch = async (input, init = {}) => {
    const r = responses[i++] ?? { status: 500, body: { message: 'no scripted response' } };
    const url = typeof input === 'string' ? input : (input as URL | Request).toString();
    const bodyIn = init.body ? JSON.parse(String(init.body)) : undefined;
    const headersIn = asHeaderRecord(init.headers);
    calls.push({
      method: init.method ?? 'GET',
      url,
      body: bodyIn,
      headers: headersIn,
    });
    return new Response(r.body !== undefined ? JSON.stringify(r.body) : null, {
      status: r.status,
      headers: { 'content-type': 'application/json', ...(r.headers ?? {}) },
    });
  };
  return { impl, calls };
}

function asHeaderRecord(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) {
    const out: Record<string, string> = {};
    h.forEach((v, k) => { out[k] = v; });
    return out;
  }
  if (Array.isArray(h)) return Object.fromEntries(h);
  return h as Record<string, string>;
}

describe('GitLabAdapter — construction', () => {
  it('rejects an empty repo path', () => {
    expect(() => new GitLabAdapter({
      repo: '',
      token: 't',
      baseBranch: 'main',
      fetchImpl: (async () => new Response('{}')) as typeof fetch,
    })).toThrow(GitConfigurationError);
  });

  it('rejects a missing token', () => {
    expect(() => new GitLabAdapter({
      repo: 'group/project',
      token: '',
      baseBranch: 'main',
      fetchImpl: (async () => new Response('{}')) as typeof fetch,
    })).toThrow(GitConfigurationError);
  });

  it('rejects a missing base branch', () => {
    expect(() => new GitLabAdapter({
      repo: 'group/project',
      token: 't',
      baseBranch: '',
      fetchImpl: (async () => new Response('{}')) as typeof fetch,
    })).toThrow(GitConfigurationError);
  });

  it('URL-encodes the project path in API URLs', async () => {
    const calls: Call[] = [];
    const { impl } = makeFetch([
      { status: 404, body: { message: 'branch not found' } },         // branch probe
      { status: 200, body: [], headers: { 'x-next-page': '' } },      // tree listing empty
      { status: 201, body: { id: 'commit-sha', short_id: 'abc1234', title: 't' } }, // commit
    ], calls);

    const adapter = new GitLabAdapter({
      repo: 'parent-group/sub-group/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl: impl,
    });
    await adapter.createBranchWithFiles(
      'embediq/foo',
      [{ path: 'CLAUDE.md', content: '# Project' }],
      'msg',
    );

    // Slashes in the project path arrive URL-encoded
    expect(calls[0].url).toContain('parent-group%2Fsub-group%2Fproject');
    expect(calls[2].url).toContain('parent-group%2Fsub-group%2Fproject');
  });
});

describe('GitLabAdapter.createBranchWithFiles', () => {
  let calls: Call[];

  beforeEach(() => { calls = []; });

  it('uses POST /repository/commits with start_branch when the branch does not yet exist', async () => {
    const { impl } = makeFetch([
      { status: 404, body: { message: 'branch not found' } },        // branch probe
      { status: 200, body: [], headers: { 'x-next-page': '' } },     // empty tree
      { status: 201, body: { id: 'sha', short_id: 's', title: 't' } }, // commit
    ], calls);

    const adapter = new GitLabAdapter({
      repo: 'group/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl: impl,
    });

    await adapter.createBranchWithFiles(
      'embediq/foo',
      [
        { path: 'CLAUDE.md', content: '# Project' },
        { path: '.claude/settings.json', content: '{}' },
      ],
      'commit msg',
    );

    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toContain('/repository/branches/embediq%2Ffoo');
    expect(calls[1].method).toBe('GET');
    expect(calls[1].url).toContain('/repository/tree?recursive=true&ref=main');

    // The commit POST carries the full action set
    expect(calls[2].method).toBe('POST');
    expect(calls[2].url).toContain('/repository/commits');
    expect(calls[2].body).toEqual({
      branch: 'embediq/foo',
      start_branch: 'main',
      commit_message: 'commit msg',
      actions: [
        { action: 'create', file_path: 'CLAUDE.md', content: '# Project', encoding: 'text' },
        { action: 'create', file_path: '.claude/settings.json', content: '{}', encoding: 'text' },
      ],
    });
  });

  it('classifies actions as update when the file already exists on the base branch', async () => {
    const { impl } = makeFetch([
      { status: 404, body: { message: 'branch not found' } },        // branch probe
      // Tree listing returns CLAUDE.md as already present, .claude/settings.json missing
      { status: 200, body: [
        { id: 'b1', name: 'CLAUDE.md', type: 'blob', path: 'CLAUDE.md', mode: '100644' },
        { id: 'b2', name: 'README.md', type: 'blob', path: 'README.md', mode: '100644' },
      ], headers: { 'x-next-page': '' } },
      { status: 201, body: { id: 'sha', short_id: 's', title: 't' } },
    ], calls);

    const adapter = new GitLabAdapter({
      repo: 'group/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl: impl,
    });

    await adapter.createBranchWithFiles(
      'embediq/foo',
      [
        { path: 'CLAUDE.md', content: '# Updated' },
        { path: '.claude/settings.json', content: '{}' },
      ],
      'msg',
    );

    const actions = (calls[2].body as { actions: Array<{ action: string; file_path: string }> }).actions;
    expect(actions).toEqual([
      { action: 'update', file_path: 'CLAUDE.md', content: '# Updated', encoding: 'text' },
      { action: 'create', file_path: '.claude/settings.json', content: '{}', encoding: 'text' },
    ]);
  });

  it('deletes an existing branch first to mirror GitHub branch-move semantics', async () => {
    const { impl } = makeFetch([
      // Branch probe — exists
      { status: 200, body: { name: 'embediq/foo', commit: { id: 'old' } } },
      // Delete the branch
      { status: 204 },
      // Empty tree on base
      { status: 200, body: [], headers: { 'x-next-page': '' } },
      // Final commit
      { status: 201, body: { id: 'sha', short_id: 's', title: 't' } },
    ], calls);

    const adapter = new GitLabAdapter({
      repo: 'group/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl: impl,
    });

    await adapter.createBranchWithFiles(
      'embediq/foo',
      [{ path: 'CLAUDE.md', content: '# Project' }],
      'msg',
    );

    expect(calls[0].method).toBe('GET');
    expect(calls[1].method).toBe('DELETE');
    expect(calls[1].url).toContain('/repository/branches/embediq%2Ffoo');
    expect(calls[2].method).toBe('GET');  // tree
    expect(calls[3].method).toBe('POST'); // commit
  });

  it('paginates the tree listing using the x-next-page header', async () => {
    const page1: unknown[] = Array.from({ length: 100 }, (_, i) => ({
      id: `b${i}`, name: `f${i}`, type: 'blob', path: `f${i}`, mode: '100644',
    }));
    const page2 = [
      { id: 'b100', name: 'CLAUDE.md', type: 'blob', path: 'CLAUDE.md', mode: '100644' },
    ];

    const { impl } = makeFetch([
      { status: 404, body: { message: 'no branch' } },                    // probe
      { status: 200, body: page1, headers: { 'x-next-page': '2' } },      // page 1
      { status: 200, body: page2, headers: { 'x-next-page': '' } },       // page 2 — done
      { status: 201, body: { id: 'sha', short_id: 's', title: 't' } },    // commit
    ], calls);

    const adapter = new GitLabAdapter({
      repo: 'group/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl: impl,
    });

    await adapter.createBranchWithFiles(
      'embediq/foo',
      [{ path: 'CLAUDE.md', content: '# updated' }],
      'msg',
    );

    expect(calls[1].url).toContain('page=1');
    expect(calls[2].url).toContain('page=2');

    // CLAUDE.md was on page 2 — must be classified as update
    const actions = (calls[3].body as { actions: Array<{ action: string }> }).actions;
    expect(actions[0].action).toBe('update');
  });

  it('falls back to all-create when the base branch tree returns 404 (e.g. empty repo)', async () => {
    const { impl } = makeFetch([
      { status: 404, body: { message: 'no branch' } },                  // probe
      { status: 404, body: { message: '404 Tree Not Found' } },         // tree
      { status: 201, body: { id: 'sha', short_id: 's', title: 't' } },  // commit
    ], calls);

    const adapter = new GitLabAdapter({
      repo: 'group/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl: impl,
    });

    await adapter.createBranchWithFiles(
      'embediq/foo',
      [{ path: 'CLAUDE.md', content: '# Project' }],
      'msg',
    );

    const actions = (calls[2].body as { actions: Array<{ action: string }> }).actions;
    expect(actions[0].action).toBe('create');
  });

  it('rejects an empty file list', async () => {
    const { impl } = makeFetch([], []);
    const adapter = new GitLabAdapter({
      repo: 'group/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl: impl,
    });
    await expect(adapter.createBranchWithFiles('embediq/foo', [], 'msg'))
      .rejects.toBeInstanceOf(GitConfigurationError);
  });

  it('wraps API failures in GitIntegrationError with the status code', async () => {
    const { impl } = makeFetch([
      { status: 401, body: { message: 'Unauthorized' } },
    ], calls);

    const adapter = new GitLabAdapter({
      repo: 'group/project',
      token: 'bad',
      baseBranch: 'main',
      fetchImpl: impl,
    });

    await expect(adapter.createBranchWithFiles('b', [{ path: 'x', content: 'y' }], 'm'))
      .rejects.toBeInstanceOf(GitIntegrationError);
  });

  it('encodes binary file contents with encoding: base64', async () => {
    const { impl } = makeFetch([
      { status: 404, body: { message: 'no branch' } },
      { status: 200, body: [], headers: { 'x-next-page': '' } },
      { status: 201, body: { id: 'sha', short_id: 's', title: 't' } },
    ], calls);

    const adapter = new GitLabAdapter({
      repo: 'group/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl: impl,
    });

    await adapter.createBranchWithFiles(
      'embediq/foo',
      [{ path: 'image.png', content: 'AAAA', encoding: 'base64' }],
      'msg',
    );

    const actions = (calls[2].body as { actions: Array<{ encoding: string }> }).actions;
    expect(actions[0].encoding).toBe('base64');
  });
});

describe('GitLabAdapter.openPullRequest', () => {
  it('POSTs to /merge_requests with source/target/title/description', async () => {
    const calls: Call[] = [];
    const { impl } = makeFetch([
      { status: 201, body: {
        web_url: 'https://gitlab.com/group/project/-/merge_requests/7',
        iid: 7,
        title: 'Regenerate configuration',
      } },
    ], calls);

    const adapter = new GitLabAdapter({
      repo: 'group/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl: impl,
    });
    const ref = await adapter.openPullRequest('embediq/foo', 'Regenerate configuration', 'Body');

    expect(ref).toEqual({
      url: 'https://gitlab.com/group/project/-/merge_requests/7',
      number: 7,
      title: 'Regenerate configuration',
      branch: 'embediq/foo',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('/merge_requests');
    expect(calls[0].body).toEqual({
      source_branch: 'embediq/foo',
      target_branch: 'main',
      title: 'Regenerate configuration',
      description: 'Body',
    });
    expect(calls[0].headers.Authorization).toBe('Bearer tkn');
  });
});

describe('GitLabAdapter — apiBaseUrl override', () => {
  it('respects a self-hosted GitLab base URL', async () => {
    const calls: Call[] = [];
    const { impl } = makeFetch([
      { status: 404, body: { message: 'no branch' } },
      { status: 200, body: [], headers: { 'x-next-page': '' } },
      { status: 201, body: { id: 'sha', short_id: 's', title: 't' } },
    ], calls);

    const adapter = new GitLabAdapter({
      repo: 'group/project',
      token: 'tkn',
      baseBranch: 'main',
      apiBaseUrl: 'https://gitlab.example.com/',
      fetchImpl: impl,
    });

    await adapter.createBranchWithFiles(
      'embediq/foo',
      [{ path: 'CLAUDE.md', content: '# Project' }],
      'msg',
    );

    expect(calls[0].url).toMatch(/^https:\/\/gitlab\.example\.com\/api\/v4\//);
  });
});
