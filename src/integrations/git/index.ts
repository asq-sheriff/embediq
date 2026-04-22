export {
  GitConfigurationError,
  GitIntegrationError,
  type GitCommitFileSpec,
  type GitPlatform,
  type GitPlatformOptions,
  type GitProviderId,
  type GitPullRequestRef,
} from './git-platform.js';

export { BitbucketAdapter } from './bitbucket-adapter.js';
export { GitHubAdapter } from './github-adapter.js';
export { GitLabAdapter } from './gitlab-adapter.js';

export {
  buildPrTemplate,
  type BuildPrTemplateInput,
  type BuiltPrTemplate,
} from './pr-template.js';

export {
  buildPlatform,
  openPrForGeneration,
  resolveGitConfigFromEnv,
  type OpenPrOptions,
  type OpenPrResult,
} from './open-pr.js';
