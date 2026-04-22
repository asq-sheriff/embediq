import { describe, it, expect, beforeEach } from 'vitest';
import { GitHubAdapter } from '../../src/integrations/git/github-adapter.js';
import { GitConfigurationError, GitIntegrationError } from '../../src/integrations/git/git-platform.js';

interface Call {
  method: string;
  url: string;
  body?: unknown;
  headers: Record<string, string>;
}

/**
 * Minimal fetch stub — records each call and returns a scripted response
 * from `responses` in FIFO order. Each entry is [status, body]. Missing
 * responses fall back to 500.
 */
function makeFetch(responses: Array<[number, unknown]>, calls: Call[] = []) {
  let i = 0;
  const impl: typeof fetch = async (input, init = {}) => {
    const [status, body] = responses[i++] ?? [500, { message: 'no scripted response' }];
    const url = typeof input === 'string' ? input : (input as URL | Request).toString();
    const bodyIn = init.body ? JSON.parse(String(init.body)) : undefined;
    const headersIn = asHeaderRecord(init.headers);
    calls.push({
      method: init.method ?? 'GET',
      url,
      body: bodyIn,
      headers: headersIn,
    });
    return new Response(JSON.stringify(body ?? {}), {
      status,
      headers: { 'content-type': 'application/json' },
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

describe('GitHubAdapter — construction', () => {
  it('rejects a repo without an owner slash', () => {
    expect(() => new GitHubAdapter({
      repo: 'invalid',
      token: 't',
      baseBranch: 'main',
      fetchImpl: (async () => new Response('{}')) as typeof fetch,
    })).toThrow(GitConfigurationError);
  });

  it('rejects a missing token', () => {
    expect(() => new GitHubAdapter({
      repo: 'owner/repo',
      token: '',
      baseBranch: 'main',
      fetchImpl: (async () => new Response('{}')) as typeof fetch,
    })).toThrow(GitConfigurationError);
  });

  it('rejects a missing baseBranch', () => {
    expect(() => new GitHubAdapter({
      repo: 'owner/repo',
      token: 't',
      baseBranch: '',
      fetchImpl: (async () => new Response('{}')) as typeof fetch,
    })).toThrow(GitConfigurationError);
  });
});

describe('GitHubAdapter.createBranchWithFiles', () => {
  let calls: Call[];
  let fetchImpl: typeof fetch;

  beforeEach(() => {
    calls = [];
  });

  it('executes the Git Data API flow for a new branch', async () => {
    ({ impl: fetchImpl } = makeFetch([
      [200, { ref: 'refs/heads/main', object: { sha: 'base-sha', type: 'commit' } }], // get base ref
      [200, { sha: 'base-sha', tree: { sha: 'base-tree-sha' } }],                      // get base commit
      [201, { sha: 'blob-sha-1' }],                                                    // blob 1
      [201, { sha: 'blob-sha-2' }],                                                    // blob 2
      [201, { sha: 'new-tree-sha' }],                                                  // tree
      [201, { sha: 'new-commit-sha', tree: { sha: 'new-tree-sha' } }],                 // commit
      [404, { message: 'Not Found' }],                                                 // branch probe -> not exists
      [201, { ref: 'refs/heads/embediq/foo', object: { sha: 'new-commit-sha', type: 'commit' } }], // create ref
    ], calls));

    const adapter = new GitHubAdapter({
      repo: 'acme/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl,
    });

    await adapter.createBranchWithFiles(
      'embediq/foo',
      [
        { path: 'CLAUDE.md', content: '# Project' },
        { path: '.claude/settings.json', content: '{}' },
      ],
      'commit msg',
    );

    expect(calls.map((c) => `${c.method} ${c.url.replace('https://api.github.com', '')}`)).toEqual([
      'GET /repos/acme/project/git/ref/heads/main',
      'GET /repos/acme/project/git/commits/base-sha',
      'POST /repos/acme/project/git/blobs',
      'POST /repos/acme/project/git/blobs',
      'POST /repos/acme/project/git/trees',
      'POST /repos/acme/project/git/commits',
      'GET /repos/acme/project/git/ref/heads/embediq/foo',
      'POST /repos/acme/project/git/refs',
    ]);

    // blob payloads carry the file contents verbatim
    expect(calls[2].body).toEqual({ content: '# Project', encoding: 'utf-8' });
    expect(calls[3].body).toEqual({ content: '{}', encoding: 'utf-8' });

    // tree uses base_tree + entries with blob SHAs
    expect(calls[4].body).toEqual({
      base_tree: 'base-tree-sha',
      tree: [
        { path: 'CLAUDE.md', mode: '100644', type: 'blob', sha: 'blob-sha-1' },
        { path: '.claude/settings.json', mode: '100644', type: 'blob', sha: 'blob-sha-2' },
      ],
    });

    // commit uses the new tree and the base commit as parent
    expect(calls[5].body).toEqual({
      message: 'commit msg',
      tree: 'new-tree-sha',
      parents: ['base-sha'],
    });

    // create-ref carries refs/heads/ prefix
    expect(calls[7].body).toEqual({ ref: 'refs/heads/embediq/foo', sha: 'new-commit-sha' });
  });

  it('updates the ref when the branch already exists (PATCH instead of POST)', async () => {
    ({ impl: fetchImpl } = makeFetch([
      [200, { ref: 'refs/heads/main', object: { sha: 'base-sha', type: 'commit' } }],
      [200, { sha: 'base-sha', tree: { sha: 'base-tree-sha' } }],
      [201, { sha: 'blob-sha' }],
      [201, { sha: 'new-tree-sha' }],
      [201, { sha: 'new-commit-sha', tree: { sha: 'new-tree-sha' } }],
      // Branch probe returns 200 — branch already exists
      [200, { ref: 'refs/heads/embediq/existing', object: { sha: 'old-commit-sha', type: 'commit' } }],
      [200, { ref: 'refs/heads/embediq/existing', object: { sha: 'new-commit-sha', type: 'commit' } }],
    ], calls));

    const adapter = new GitHubAdapter({
      repo: 'acme/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl,
    });

    await adapter.createBranchWithFiles(
      'embediq/existing',
      [{ path: 'CLAUDE.md', content: '# Project' }],
      'msg',
    );

    const last = calls[calls.length - 1];
    expect(last.method).toBe('PATCH');
    expect(last.url).toContain('/git/refs/heads/embediq/existing');
    expect(last.body).toEqual({ sha: 'new-commit-sha', force: false });
  });

  it('wraps API failures in GitIntegrationError with the status code', async () => {
    ({ impl: fetchImpl } = makeFetch([
      [401, { message: 'Bad credentials' }],
    ], calls));

    const adapter = new GitHubAdapter({
      repo: 'acme/project',
      token: 'bad',
      baseBranch: 'main',
      fetchImpl,
    });

    await expect(adapter.createBranchWithFiles('b', [{ path: 'x', content: 'y' }], 'm'))
      .rejects.toBeInstanceOf(GitIntegrationError);
  });
});

describe('GitHubAdapter.openPullRequest', () => {
  it('POSTs to /pulls with head/base/title/body', async () => {
    const calls: Call[] = [];
    const { impl } = makeFetch([
      [201, {
        html_url: 'https://github.com/acme/project/pull/42',
        number: 42,
        title: 'Regenerate configuration',
      }],
    ], calls);

    const adapter = new GitHubAdapter({
      repo: 'acme/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl: impl,
    });
    const ref = await adapter.openPullRequest('embediq/foo', 'Regenerate configuration', 'Body');

    expect(ref).toEqual({
      url: 'https://github.com/acme/project/pull/42',
      number: 42,
      title: 'Regenerate configuration',
      branch: 'embediq/foo',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('/repos/acme/project/pulls');
    expect(calls[0].body).toEqual({
      title: 'Regenerate configuration',
      body: 'Body',
      head: 'embediq/foo',
      base: 'main',
    });
    expect(calls[0].headers.Authorization).toBe('Bearer tkn');
  });
});
