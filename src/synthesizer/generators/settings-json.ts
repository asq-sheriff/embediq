import type { ConfigGenerator } from '../generator.js';
import type { SetupConfig, GeneratedFile } from '../../types/index.js';

export class SettingsJsonGenerator implements ConfigGenerator {
  name = 'settings.json';

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    const settings: Record<string, unknown> = {};

    // Hooks
    const hooks: Record<string, unknown[]> = {};

    // PreToolUse hooks
    const preToolUse: unknown[] = [];

    // DLP / PHI / PII detection hook
    if (profile.securityConcerns.includes('dlp') ||
        profile.securityConcerns.includes('phi') ||
        profile.securityConcerns.includes('pii') ||
        profile.securityConcerns.includes('secret_scanning')) {
      preToolUse.push({
        type: 'command',
        if: 'Edit',
        command: 'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/dlp-scanner.py"',
        timeout: 500,
      });
      preToolUse.push({
        type: 'command',
        if: 'Write',
        command: 'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/dlp-scanner.py"',
        timeout: 500,
      });
      preToolUse.push({
        type: 'command',
        if: 'Bash',
        command: 'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/dlp-scanner.py"',
        timeout: 500,
      });
    }

    // Dangerous command blocking
    preToolUse.push({
      type: 'command',
      if: 'Bash',
      command: 'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/command-guard.py"',
      timeout: 300,
    });

    // Network egress control
    if (profile.securityConcerns.includes('network_egress')) {
      preToolUse.push({
        type: 'command',
        if: 'Bash',
        command: 'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/egress-guard.py"',
        timeout: 300,
      });
    }

    if (preToolUse.length > 0) hooks.PreToolUse = preToolUse;

    // PostToolUse hooks (formatting, quality)
    const postToolUse: unknown[] = [];

    // Auto-formatting on edit
    if (profile.languages.includes('typescript') || profile.languages.includes('javascript')) {
      postToolUse.push({
        type: 'command',
        if: 'Edit',
        command: 'npx prettier --write "$CLAUDE_FILE" 2>/dev/null; npx tsc --noEmit 2>&1 | head -20',
        timeout: 5000,
      });
    } else if (profile.languages.includes('python')) {
      postToolUse.push({
        type: 'command',
        if: 'Edit',
        command: 'ruff format "$CLAUDE_FILE" 2>/dev/null; ruff check "$CLAUDE_FILE" 2>&1 | head -20',
        timeout: 3000,
      });
    } else if (profile.languages.includes('go')) {
      postToolUse.push({
        type: 'command',
        if: 'Edit',
        command: 'gofmt -w "$CLAUDE_FILE" 2>/dev/null; go vet ./... 2>&1 | head -20',
        timeout: 3000,
      });
    } else if (profile.languages.includes('rust')) {
      postToolUse.push({
        type: 'command',
        if: 'Edit',
        command: 'rustfmt "$CLAUDE_FILE" 2>/dev/null; cargo clippy 2>&1 | head -20',
        timeout: 5000,
      });
    }

    // Audit logging
    if (profile.securityConcerns.includes('session_audit_trail') ||
        profile.securityConcerns.includes('audit_logging')) {
      postToolUse.push({
        type: 'command',
        command: 'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/audit-logger.py"',
        timeout: 200,
        async: true,
      });
    }

    if (postToolUse.length > 0) hooks.PostToolUse = postToolUse;

    // SessionStart hook
    const sessionStart: unknown[] = [{
      type: 'command',
      command: 'echo "Session started: $(date -u +%Y-%m-%dT%H:%M:%SZ) | Branch: $(git branch --show-current 2>/dev/null || echo none)"',
      timeout: 1000,
    }];
    hooks.SessionStart = sessionStart;

    // Stop hook for TDD enforcement
    const wantsTdd = profile.answers.get('PROB_007')?.value === true;
    if (wantsTdd) {
      hooks.Stop = [{
        type: 'prompt',
        prompt: 'Check if all modified source files have corresponding test files. If any source file was modified without a test, respond with BLOCK and explain which tests are missing. Otherwise respond with PASS.',
      }];
    }

    settings.hooks = hooks;

    // Denied MCP servers (block unused ones to reduce context pollution)
    const deniedServers = this.getDeniedMcpServers(profile);
    if (deniedServers.length > 0) {
      settings.deniedMcpServers = deniedServers;
    }

    return [{
      relativePath: '.claude/settings.json',
      content: JSON.stringify(settings, null, 2) + '\n',
      description: 'Hook definitions, plugin config, denied MCP servers (tracked in git)',
    }];
  }

  private getDeniedMcpServers(profile: SetupConfig['profile']): string[] {
    const denied: string[] = [];
    const mcpPrefs = profile.answers.get('TECH_015');
    const selected = Array.isArray(mcpPrefs?.value) ? mcpPrefs.value as string[] : [];

    // Deny servers not relevant to workflow
    const allServers = ['figma', 'google-calendar', 'gmail', 'cloudflare', 'gamma',
      'mermaid-chart', 'excalidraw', 'biorender', 'hugging-face'];

    for (const server of allServers) {
      if (!selected.includes(server)) {
        denied.push(server);
      }
    }

    return denied;
  }
}
