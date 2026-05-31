import { describe, it, expect, beforeEach } from 'vitest';
import { AzureReposAdapter } from '../../src/integrations/git/azure-repos-adapter.js';
import { GitConfigurationError, GitIntegrationError } from '../../src/integrations/git/git-platform.js';

interface Call {
  method: string;
  url: string;
  contentType?: string;
  authorization?: string;
  json?: unknown;
}

interface ScriptedResponse {
  status: number;
  body?: unknown;
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
    if (typeof init.body === 'string' && init.body.length > 0) {
      try { json = JSON.parse(init.body); } catch { /* non-JSON body */ }
    }

    calls.push({
      method: init.method ?? 'GET',
      url,
      contentType,
      authorization: headersIn.Authorization ?? headersIn.authorization,
      json,
    });

    const ct = r.contentType ?? 'application/json';
    return new Response(
      r.body !== undefined ? (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) : null,
      { status: r.status, headers: { 'content-type': ct } },
    );
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

const EXPECTED_AUTH = `Basic ${Buffer.from(':tkn').toString('base64')}`;

describe('AzureReposAdapter — construction', () => {
  const fetchStub = (async () => new Response('{}')) as typeof fetch;

  it('rejects a repo that is not org/project/repo', () => {
    expect(() => new AzureReposAdapter({
      repo: 'acme/project', token: 't', baseBranch: 'main', fetchImpl: fetchStub,
    })).toThrow(GitConfigurationError);
    expect(() => new AzureReposAdapter({
      repo: 'just-a-name', token: 't', baseBranch: 'main', fetchImpl: fetchStub,
    })).toThrow(GitConfigurationError);
  });

  it('rejects a missing token', () => {
    expect(() => new AzureReposAdapter({
      repo: 'org/project/repo', token: '', baseBranch: 'main', fetchImpl: fetchStub,
    })).toThrow(GitConfigurationError);
  });

  it('rejects a missing base branch', () => {
    expect(() => new AzureReposAdapter({
      repo: 'org/project/repo', token: 't', baseBranch: '', fetchImpl: fetchStub,
    })).toThrow(GitConfigurationError);
  });
});

describe('AzureReposAdapter.createBranchWithFiles', () => {
  let calls: Call[];
  beforeEach(() => { calls = []; });

  function newBranchResponses(): ScriptedResponse[] {
    return [
      { status: 200, body: { value: [{ name: 'refs/heads/main', objectId: 'base-sha' }] } }, // base ref
      { status: 200, body: { value: [] } },                                                   // target ref (absent)
      { status: 200, body: { value: [] } },                                                   // updateRef
      { status: 200, body: { value: [{ path: '/CLAUDE.md', gitObjectType: 'blob' }] } },       // base tree
      { status: 201, body: { commits: [{ commitId: 'new' }] } },                               // push
    ];
  }

  it('forks from base, classifies add vs edit, and pushes a single commit', async () => {
    const { impl } = makeFetch(newBranchResponses(), calls);
    const adapter = new AzureReposAdapter({
      repo: 'acme-org/Patient Portal/config', token: 'tkn', baseBranch: 'main', fetchImpl: impl,
    });

    await adapter.createBranchWithFiles(
      'embediq/foo',
      [
        { path: 'CLAUDE.md', content: '# Project' },         // exists in base → edit
        { path: '.claude/settings.json', content: '{}' },    // new → add
      ],
      'commit msg',
    );

    // Every call carries api-version and Basic PAT auth.
    for (const c of calls) {
      expect(c.url).toContain('api-version=7.1');
      expect(c.authorization).toBe(EXPECTED_AUTH);
    }

    // Project segment with a space is URL-encoded in the repo root.
    expect(calls[0].url).toContain('/acme-org/Patient%20Portal/_apis/git/repositories/config/refs');
    expect(calls[0].url).toContain('filter=heads%2Fmain');

    // updateRef creates the branch at the base tip.
    expect(calls[2].method).toBe('POST');
    expect(calls[2].url).toContain('/refs?');
    expect(calls[2].json).toEqual([
      { name: 'refs/heads/embediq/foo', oldObjectId: '0000000000000000000000000000000000000000', newObjectId: 'base-sha' },
    ]);

    // The push: parented on base, one add + one edit change.
    expect(calls[4].method).toBe('POST');
    expect(calls[4].url).toContain('/pushes');
    const push = calls[4].json as {
      refUpdates: { name: string; oldObjectId: string }[];
      commits: { comment: string; changes: { changeType: string; item: { path: string }; newContent: { content: string; contentType: string } }[] }[];
    };
    expect(push.refUpdates[0]).toEqual({ name: 'refs/heads/embediq/foo', oldObjectId: 'base-sha' });
    expect(push.commits[0].comment).toBe('commit msg');
    const byPath = Object.fromEntries(push.commits[0].changes.map((c) => [c.item.path, c]));
    expect(byPath['/CLAUDE.md'].changeType).toBe('edit');
    expect(byPath['/.claude/settings.json'].changeType).toBe('add');
    expect(byPath['/CLAUDE.md'].newContent.contentType).toBe('rawtext');
  });

  it('resets an existing branch to base (idempotency)', async () => {
    const responses = newBranchResponses();
    responses[1] = { status: 200, body: { value: [{ name: 'refs/heads/embediq/foo', objectId: 'stale-sha' }] } };
    const { impl } = makeFetch(responses, calls);
    const adapter = new AzureReposAdapter({
      repo: 'org/project/repo', token: 'tkn', baseBranch: 'main', fetchImpl: impl,
    });

    await adapter.createBranchWithFiles('embediq/foo', [{ path: 'CLAUDE.md', content: 'x' }], 'm');

    // updateRef's oldObjectId is the existing tip, force-moving the branch to base.
    expect(calls[2].json).toEqual([
      { name: 'refs/heads/embediq/foo', oldObjectId: 'stale-sha', newObjectId: 'base-sha' },
    ]);
  });

  it('treats an empty base repo (404 items) as all-new files', async () => {
    const responses = newBranchResponses();
    responses[3] = { status: 404, body: { error: 'no items' } }; // base tree 404
    const { impl } = makeFetch(responses, calls);
    const adapter = new AzureReposAdapter({
      repo: 'org/project/repo', token: 'tkn', baseBranch: 'main', fetchImpl: impl,
    });

    await adapter.createBranchWithFiles('embediq/foo', [{ path: 'CLAUDE.md', content: 'x' }], 'm');
    const push = calls[4].json as { commits: { changes: { changeType: string }[] }[] };
    expect(push.commits[0].changes[0].changeType).toBe('add');
  });

  it('encodes base64 content as base64encoded', async () => {
    const { impl } = makeFetch(newBranchResponses(), calls);
    const adapter = new AzureReposAdapter({
      repo: 'org/project/repo', token: 'tkn', baseBranch: 'main', fetchImpl: impl,
    });
    await adapter.createBranchWithFiles(
      'embediq/foo',
      [{ path: 'logo.png', content: 'AAAA', encoding: 'base64' }],
      'm',
    );
    const push = calls[4].json as { commits: { changes: { newContent: { contentType: string } }[] }[] };
    expect(push.commits[0].changes[0].newContent.contentType).toBe('base64encoded');
  });

  it('rejects an empty file list', async () => {
    const { impl } = makeFetch([], []);
    const adapter = new AzureReposAdapter({
      repo: 'org/project/repo', token: 'tkn', baseBranch: 'main', fetchImpl: impl,
    });
    await expect(adapter.createBranchWithFiles('b', [], 'm'))
      .rejects.toBeInstanceOf(GitConfigurationError);
  });

  it('errors when the base branch is not found', async () => {
    const { impl } = makeFetch([{ status: 200, body: { value: [] } }], calls);
    const adapter = new AzureReposAdapter({
      repo: 'org/project/repo', token: 'tkn', baseBranch: 'main', fetchImpl: impl,
    });
    await expect(adapter.createBranchWithFiles('b', [{ path: 'x', content: 'y' }], 'm'))
      .rejects.toBeInstanceOf(GitIntegrationError);
  });

  it('wraps an API failure in GitIntegrationError with the status', async () => {
    const { impl } = makeFetch([{ status: 401, body: { message: 'unauthorized' } }], calls);
    const adapter = new AzureReposAdapter({
      repo: 'org/project/repo', token: 'tkn', baseBranch: 'main', fetchImpl: impl,
    });
    await expect(adapter.createBranchWithFiles('b', [{ path: 'x', content: 'y' }], 'm'))
      .rejects.toMatchObject({ name: 'GitIntegrationError', status: 401 });
  });
});

describe('AzureReposAdapter.openPullRequest', () => {
  it('POSTs the PR and constructs the browser URL', async () => {
    const calls: Call[] = [];
    const { impl } = makeFetch([
      { status: 201, body: { pullRequestId: 11, title: 'Regenerate configuration' } },
    ], calls);
    const adapter = new AzureReposAdapter({
      repo: 'acme-org/Patient Portal/config', token: 'tkn', baseBranch: 'main', fetchImpl: impl,
    });

    const pr = await adapter.openPullRequest('embediq/foo', 'Regenerate configuration', 'body text');

    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('/pullrequests');
    expect(calls[0].json).toEqual({
      sourceRefName: 'refs/heads/embediq/foo',
      targetRefName: 'refs/heads/main',
      title: 'Regenerate configuration',
      description: 'body text',
    });
    expect(pr).toEqual({
      url: 'https://dev.azure.com/acme-org/Patient%20Portal/_git/config/pullrequest/11',
      number: 11,
      title: 'Regenerate configuration',
      branch: 'embediq/foo',
    });
  });

  it('honors an apiBaseUrl override for Azure DevOps Server', async () => {
    const calls: Call[] = [];
    const { impl } = makeFetch([
      { status: 201, body: { pullRequestId: 3, title: 'T' } },
    ], calls);
    const adapter = new AzureReposAdapter({
      repo: 'org/project/repo',
      token: 'tkn',
      baseBranch: 'main',
      apiBaseUrl: 'https://tfs.example.com/tfs/DefaultCollection',
      fetchImpl: impl,
    });
    const pr = await adapter.openPullRequest('embediq/x', 'T', 'b');
    expect(calls[0].url).toContain('https://tfs.example.com/tfs/DefaultCollection/org/project/_apis/git/repositories/repo/pullrequests');
    expect(pr.url).toBe('https://tfs.example.com/tfs/DefaultCollection/org/project/_git/repo/pullrequest/3');
  });
});
