import { describe, it, expect, beforeEach } from 'vitest';
import { BitbucketAdapter } from '../../src/integrations/git/bitbucket-adapter.js';
import { GitConfigurationError, GitIntegrationError } from '../../src/integrations/git/git-platform.js';

interface Call {
  method: string;
  url: string;
  contentType?: string;
  authorization?: string;
  // Captured before the response is sent so the test can inspect either
  // a JSON request body or a multipart form body.
  json?: unknown;
  formFields?: Record<string, string>;
}

interface ScriptedResponse {
  status: number;
  body?: unknown;
  /** Optional content type — defaults to application/json. */
  contentType?: string;
}

function makeFetch(responses: ScriptedResponse[], calls: Call[] = []) {
  let i = 0;
  const impl: typeof fetch = async (input, init = {}) => {
    const r = responses[i++] ?? { status: 500, body: { error: 'no scripted response' } };
    const url = typeof input === 'string' ? input : (input as URL | Request).toString();
    const headersIn = asHeaderRecord(init.headers);
    const contentType = headersIn['Content-Type'] ?? headersIn['content-type'];

    let json: unknown | undefined;
    let formFields: Record<string, string> | undefined;
    if (init.body instanceof FormData) {
      formFields = {};
      for (const [k, v] of init.body.entries()) {
        // Blob values represent file content; coerce to a string label
        // so the test can at least see which paths got registered.
        formFields[k] = typeof v === 'string' ? v : `[blob:${v.size}b]`;
      }
    } else if (typeof init.body === 'string' && init.body.length > 0) {
      try { json = JSON.parse(init.body); } catch { /* non-JSON body */ }
    }

    calls.push({
      method: init.method ?? 'GET',
      url,
      contentType,
      authorization: headersIn.Authorization ?? headersIn.authorization,
      json,
      formFields,
    });

    const ct = r.contentType ?? 'application/json';
    return new Response(r.body !== undefined ? (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) : null, {
      status: r.status,
      headers: { 'content-type': ct },
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

describe('BitbucketAdapter — construction', () => {
  it('rejects a repo without a workspace slash', () => {
    expect(() => new BitbucketAdapter({
      repo: 'just-a-name',
      token: 't',
      baseBranch: 'main',
      fetchImpl: (async () => new Response('{}')) as typeof fetch,
    })).toThrow(GitConfigurationError);
  });

  it('rejects a missing token', () => {
    expect(() => new BitbucketAdapter({
      repo: 'workspace/repo',
      token: '',
      baseBranch: 'main',
      fetchImpl: (async () => new Response('{}')) as typeof fetch,
    })).toThrow(GitConfigurationError);
  });

  it('rejects a missing base branch', () => {
    expect(() => new BitbucketAdapter({
      repo: 'workspace/repo',
      token: 't',
      baseBranch: '',
      fetchImpl: (async () => new Response('{}')) as typeof fetch,
    })).toThrow(GitConfigurationError);
  });
});

describe('BitbucketAdapter.createBranchWithFiles', () => {
  let calls: Call[];

  beforeEach(() => { calls = []; });

  it('looks up the base SHA and POSTs multipart /src with branch + parents + files', async () => {
    const { impl } = makeFetch([
      { status: 404, body: { error: 'branch not found' } },                       // probe
      { status: 200, body: { name: 'main', target: { hash: 'base-sha-123' } } }, // base SHA
      { status: 201, contentType: 'text/plain', body: '' },                      // /src
    ], calls);

    const adapter = new BitbucketAdapter({
      repo: 'acme/project',
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
    expect(calls[0].url).toContain('/refs/branches/embediq%2Ffoo');
    expect(calls[1].method).toBe('GET');
    expect(calls[1].url).toContain('/refs/branches/main');

    expect(calls[2].method).toBe('POST');
    expect(calls[2].url).toContain('/2.0/repositories/acme/project/src');
    // Content-Type for multipart is set by fetch from the FormData boundary,
    // so we don't expect our adapter to override it.
    expect(calls[2].contentType).toBeUndefined();
    expect(calls[2].formFields).toEqual({
      branch: 'embediq/foo',
      parents: 'base-sha-123',
      message: 'commit msg',
      'CLAUDE.md': '# Project',
      '.claude/settings.json': '{}',
    });
  });

  it('deletes an existing branch first to mirror GitHub branch-move semantics', async () => {
    const { impl } = makeFetch([
      { status: 200, body: { name: 'embediq/foo', target: { hash: 'old-sha' } } }, // probe — exists
      { status: 204 },                                                              // delete
      { status: 200, body: { name: 'main', target: { hash: 'base-sha' } } },        // base SHA
      { status: 201, contentType: 'text/plain', body: '' },                         // /src
    ], calls);

    const adapter = new BitbucketAdapter({
      repo: 'acme/project',
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
    expect(calls[1].url).toContain('/refs/branches/embediq%2Ffoo');
    expect(calls[2].method).toBe('GET');  // base sha lookup
    expect(calls[3].method).toBe('POST'); // /src
  });

  it('rejects an empty file list', async () => {
    const { impl } = makeFetch([], []);
    const adapter = new BitbucketAdapter({
      repo: 'acme/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl: impl,
    });
    await expect(adapter.createBranchWithFiles('b', [], 'm'))
      .rejects.toBeInstanceOf(GitConfigurationError);
  });

  it('errors when the base branch has no target hash', async () => {
    const { impl } = makeFetch([
      { status: 404, body: { error: 'no branch' } },                       // probe
      { status: 200, body: { name: 'main' /* no target */ } as unknown },  // base lookup
    ], calls);

    const adapter = new BitbucketAdapter({
      repo: 'acme/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl: impl,
    });

    await expect(adapter.createBranchWithFiles('b', [{ path: 'x', content: 'y' }], 'm'))
      .rejects.toBeInstanceOf(GitIntegrationError);
  });

  it('encodes binary file specs as Blob entries on the multipart form', async () => {
    const { impl } = makeFetch([
      { status: 404, body: { error: 'no branch' } },
      { status: 200, body: { name: 'main', target: { hash: 'base' } } },
      { status: 201, contentType: 'text/plain', body: '' },
    ], calls);

    const adapter = new BitbucketAdapter({
      repo: 'acme/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl: impl,
    });

    await adapter.createBranchWithFiles(
      'embediq/foo',
      [{ path: 'image.png', content: Buffer.from('hello').toString('base64'), encoding: 'base64' }],
      'msg',
    );

    // Blob entries land as `[blob:Nb]` in our test capture
    expect(calls[2].formFields?.['image.png']).toMatch(/^\[blob:\d+b\]$/);
  });

  it('wraps API failures in GitIntegrationError with the status code', async () => {
    const { impl } = makeFetch([
      { status: 401, body: { error: 'Unauthorized' } },
    ], calls);

    const adapter = new BitbucketAdapter({
      repo: 'acme/project',
      token: 'bad',
      baseBranch: 'main',
      fetchImpl: impl,
    });

    await expect(adapter.createBranchWithFiles('b', [{ path: 'x', content: 'y' }], 'm'))
      .rejects.toBeInstanceOf(GitIntegrationError);
  });

  it('uses Bearer authentication on every call', async () => {
    const { impl } = makeFetch([
      { status: 404, body: { error: 'no branch' } },
      { status: 200, body: { name: 'main', target: { hash: 'base' } } },
      { status: 201, contentType: 'text/plain', body: '' },
    ], calls);

    const adapter = new BitbucketAdapter({
      repo: 'acme/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl: impl,
    });

    await adapter.createBranchWithFiles(
      'embediq/foo',
      [{ path: 'CLAUDE.md', content: '# Project' }],
      'msg',
    );

    for (const c of calls) {
      expect(c.authorization).toBe('Bearer tkn');
    }
  });
});

describe('BitbucketAdapter.openPullRequest', () => {
  it('POSTs to /pullrequests with source/destination/title/description', async () => {
    const calls: Call[] = [];
    const { impl } = makeFetch([
      { status: 201, body: {
        id: 11,
        title: 'Regenerate configuration',
        links: { html: { href: 'https://bitbucket.org/acme/project/pull-requests/11' } },
      } },
    ], calls);

    const adapter = new BitbucketAdapter({
      repo: 'acme/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl: impl,
    });
    const ref = await adapter.openPullRequest('embediq/foo', 'Regenerate configuration', 'Body');

    expect(ref).toEqual({
      url: 'https://bitbucket.org/acme/project/pull-requests/11',
      number: 11,
      title: 'Regenerate configuration',
      branch: 'embediq/foo',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('/2.0/repositories/acme/project/pullrequests');
    expect(calls[0].contentType).toBe('application/json');
    expect(calls[0].json).toEqual({
      title: 'Regenerate configuration',
      description: 'Body',
      source: { branch: { name: 'embediq/foo' } },
      destination: { branch: { name: 'main' } },
    });
  });

  it('falls back to a constructed URL when the response omits links.html', async () => {
    const { impl } = makeFetch([
      { status: 201, body: { id: 22, title: 'T' /* no links */ } },
    ]);

    const adapter = new BitbucketAdapter({
      repo: 'acme/project',
      token: 'tkn',
      baseBranch: 'main',
      fetchImpl: impl,
    });
    const ref = await adapter.openPullRequest('embediq/foo', 'T', 'B');

    expect(ref.url).toBe('https://bitbucket.org/acme/project/pull-requests/22');
  });
});

describe('BitbucketAdapter — apiBaseUrl override', () => {
  it('respects a self-hosted Bitbucket Server base URL', async () => {
    const calls: Call[] = [];
    const { impl } = makeFetch([
      { status: 404, body: { error: 'no branch' } },
      { status: 200, body: { name: 'main', target: { hash: 'base' } } },
      { status: 201, contentType: 'text/plain', body: '' },
    ], calls);

    const adapter = new BitbucketAdapter({
      repo: 'acme/project',
      token: 'tkn',
      baseBranch: 'main',
      apiBaseUrl: 'https://bitbucket.example.com/',
      fetchImpl: impl,
    });

    await adapter.createBranchWithFiles(
      'embediq/foo',
      [{ path: 'CLAUDE.md', content: '# Project' }],
      'msg',
    );

    expect(calls[0].url).toMatch(/^https:\/\/bitbucket\.example\.com\/2\.0\//);
  });
});
