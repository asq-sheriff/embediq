<!-- audience: public -->

# GitHub PR integration

With `--git-pr`, EmbedIQ opens a pull request containing the generated
configuration instead of (or in addition to) writing files to disk.
The PR body includes the profile summary, per-generator file list,
validation results, contributor attribution (from multi-stakeholder
sessions), and drift context (when triggered by autopilot). The team
reviews and approves in the tool they already know, using branch
protection and review rules they already have.

> **When to use this.** You want generated configuration changes to
> flow through the same review pipeline as your application code, or
> you want multiple stakeholders (developer, compliance officer,
> security engineer) to sign off on the regenerated configuration
> before it lands.

## Prerequisites

- A GitHub repository you can push to.
- A personal access token (classic or fine-grained) with:
  - `contents: write` on the target repo
  - `pull_requests: write` on the target repo
- The `main` (or other) branch existing in the repo.

GitHub Enterprise is supported via the `EMBEDIQ_GIT_API_BASE_URL`
override. GitLab and Bitbucket adapters are on the roadmap — the
`GitPlatform` interface is already platform-agnostic.

## Enable it

**Environment variables**:

```bash
export EMBEDIQ_GIT_PROVIDER=github            # default
export EMBEDIQ_GIT_REPO=acme/patient-portal   # owner/repo
export EMBEDIQ_GIT_TOKEN=ghp_…                # contents:write + pull_requests:write
export EMBEDIQ_GIT_BASE_BRANCH=main           # default: main
# Optional — GitHub Enterprise only:
# export EMBEDIQ_GIT_API_BASE_URL=https://github.example.com/api/v3
```

**Then run the wizard with `--git-pr`**:

```bash
npm start -- --git-pr
```

EmbedIQ still writes files to the target directory first — the PR is
an *additional* output. If you only want the PR (no local write),
point `--targets` at a throwaway directory.

## How it works

EmbedIQ uses GitHub's REST v3 **Git Data API** for atomic multi-file
commits — no local clone, no working tree, no chance of leaving dirty
state behind if the process crashes.

```
1. GET  /repos/:owner/:repo/git/ref/heads/:baseBranch   → base commit SHA
2. GET  /repos/:owner/:repo/git/commits/:sha            → base tree SHA
3. POST /repos/:owner/:repo/git/blobs                   × N (one per file)
4. POST /repos/:owner/:repo/git/trees                   → new tree from base + blobs
5. POST /repos/:owner/:repo/git/commits                 → new commit on top of base
6. POST /repos/:owner/:repo/git/refs                    → create branch refs/heads/embediq/<timestamp>
   (PATCH /git/refs/heads/<name> if the branch already exists)
7. POST /repos/:owner/:repo/pulls                       → open PR branch → baseBranch
```

Default branch name is `embediq/YYYYMMDD-HHMMSS`. Override with
`--branch-name` (coming) or by providing `branchName` directly to the
`openPrForGeneration` API if you're integrating programmatically.

## PR body anatomy

A typical PR body includes these sections, in order:

```md
## Summary

Developer configuration for **Patient portal** (healthcare) — 16 files.

**Compliance frameworks:** HIPAA

## Changes

- **CLAUDE.md** (1 file)
  - `CLAUDE.md`
- **settings.json** (1 file)
  - `.claude/settings.json`
- **rules** (7 files)
  - `.claude/rules/hipaa-compliance.md`
  - `.claude/rules/hipaa-phi-handling.md`
  - …
- **hooks** (3 files)
  - `.claude/hooks/dlp-scanner.py`
  - …

## Validation

**Status:** ✅ passed — 15 pass / 0 fail / 0 warn

## Contributors

| Contributor | Answers |
|---|---|
| `alice@acme.com` | 12 |
| `compliance@acme.com` | 6 |

## Drift that triggered this PR

Total drift: **3** — 1 missing, 0 modified-by-user, 1 modified-stale-stamp, 0 version-mismatch, 1 extra.

---
_PR opened by EmbedIQ — review and approve to adopt the regenerated configuration._
```

Sections included conditionally:

- **Validation** — present when `generateWithValidation` is used
  (the default for the web server and CLI).
- **Contributors** — present when the session's answers carry
  `contributedBy`. See
  [session and resume](07-session-and-resume.md) — requires auth on.
- **Drift that triggered this PR** — present when autopilot (6E)
  calls `openPrForGeneration` with a drift summary. Manual runs skip
  this section.

Override the title and commit message via the programmatic API
(`titleOverride` / `commitMessageOverride`). The default title is
`"EmbedIQ: regenerate configuration"`.

## Worked example — single wizard run to PR

```bash
export EMBEDIQ_GIT_PROVIDER=github
export EMBEDIQ_GIT_REPO=acme/patient-portal
export EMBEDIQ_GIT_TOKEN=$(cat ~/.tokens/github-embediq)
export EMBEDIQ_GIT_BASE_BRANCH=main

npm start -- --git-pr
# answer the wizard, generate to /srv/patient-portal

# CLI output (tail):
#   ✓ Opened https://github.com/acme/patient-portal/pull/347
#       Branch: embediq/20260421-143052
```

The branch is created, 16 files commit atomically, the PR opens. Merge
in GitHub. Done.

## GitHub Enterprise

```bash
export EMBEDIQ_GIT_API_BASE_URL=https://github.mycorp.com/api/v3
export EMBEDIQ_GIT_REPO=platform/patient-portal
export EMBEDIQ_GIT_TOKEN=…
npm start -- --git-pr
```

Everything else works identically. The adapter uses the
`apiBaseUrl` override as the REST root.

## Programmatic API

If you'd rather call the PR flow from Node directly:

```ts
import { openPrForGeneration } from 'embediq/integrations/git';
import { SynthesizerOrchestrator } from 'embediq/synthesizer';

const orchestrator = new SynthesizerOrchestrator();
const { files, validation } = await orchestrator.generateWithValidation(config);

const result = await openPrForGeneration({
  files,
  profile: config.profile,
  validation,
  provider: 'github',
  platformOptions: {
    repo: 'acme/patient-portal',
    token: process.env.GITHUB_TOKEN!,
    baseBranch: 'main',
  },
});
console.log(result.pullRequest.url);
```

See the source in
[`src/integrations/git/open-pr.ts`](../../src/integrations/git/open-pr.ts)
for the full options surface.

## Security considerations

- **Scope tokens tightly.** `contents:write` + `pull_requests:write`
  on a single repo is enough. Avoid personal tokens with broader
  scope — EmbedIQ never needs `delete:repo` or `admin`.
- **Rotate tokens regularly.** The token lives in your env — treat
  it like a database password. GitHub fine-grained tokens with a
  short expiry + owner approval are the preferred flavor for
  production.
- **Branch protection still applies.** EmbedIQ opens PRs — it doesn't
  bypass review or required status checks. Configure protection on
  `main` as you normally would.
- **Atomic commits.** Even if the CLI crashes after the blobs are
  uploaded but before the commit lands, GitHub's Git Data API has
  no state to clean up — blob objects are reference-counted and the
  branch simply doesn't exist. Safe to retry.

## Troubleshooting

- **`401 Unauthorized` / "Bad credentials".** The token is missing or
  expired. Verify with
  `curl -H "Authorization: Bearer $EMBEDIQ_GIT_TOKEN" https://api.github.com/user`.
- **`404 Not Found` on the base ref.** `EMBEDIQ_GIT_REPO` is wrong
  (typo, or the token can't see the repo), or `EMBEDIQ_GIT_BASE_BRANCH`
  doesn't exist.
- **`422 Unprocessable Entity` on `POST /pulls`.** GitHub rejected
  the PR — most commonly because an identical PR is already open for
  the branch or the base branch is protected from PRs. Check the
  response body (visible in the error message).
- **Branch name collisions.** Successive runs with the same cadence
  (e.g. from autopilot firing twice in the same second) reuse a
  timestamp. The adapter handles this: if the branch already exists,
  it updates the ref rather than erroring.
- **PR opened but commit looks empty.** The profile produced zero
  files. Check the `--targets` flag and the role (non-technical roles
  emit fewer files per target).

## Known limitations (v3.2)

- **GitHub only.** GitLab and Bitbucket adapters are follow-ups.
- **No `addComment` yet.** The `GitPlatform` interface allows it but
  v1 adapters don't implement it. Use the PR body for all context.
- **No per-target PR splitting.** All targets land in one PR. If your
  team wants separate PRs per target (e.g. Claude vs. Cursor), open
  the wizard twice with different `--targets` sets.

## See also

- [Autopilot](08-autopilot.md) — scheduled drift scans (will open PRs
  in a future release)
- [Session and resume](07-session-and-resume.md) — contributor
  attribution drives the PR's Contributors table
- [Multi-agent targets](05-multi-agent-targets.md) — all selected
  targets land in one atomic PR
- [REST API reference](../reference/rest-api.md) — coming: web
  endpoint for PR mode
- [`src/integrations/git/`](../../src/integrations/git/) — adapter
  source
