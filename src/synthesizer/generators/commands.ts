import type { ConfigGenerator } from '../generator.js';
import type { SetupConfig, GeneratedFile } from '../../types/index.js';
import { MarkdownBuilder } from '../../util/markdown-builder.js';

export class CommandsGenerator implements ConfigGenerator {
  name = 'commands';

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    const files: GeneratedFile[] = [];
    const wantsRouting = profile.answers.get('FIN_002')?.value === true;
    const wantsCommands = profile.answers.get('INNOV_006')?.value === true;

    if (!wantsCommands && !wantsRouting) return files;

    // Model routing commands
    if (wantsRouting) {
      files.push(this.createCommand('quick', 'haiku', 'low',
        'Fast lookups, explanations, and status checks.',
        'Answer the following question concisely: $ARGUMENTS'));

      files.push(this.createCommand('code', 'sonnet', 'high',
        'Write, refactor, or debug code.',
        '$ARGUMENTS'));

      files.push(this.createCommand('think', 'opus', 'high',
        'Architecture decisions, security analysis, complex debugging.',
        'Think deeply about the following: $ARGUMENTS'));
    }

    // Health check command
    files.push(this.createCommand('health', 'sonnet', 'medium',
      'Check project health: build, tests, lint.',
      'Run the project build, test suite, and linter. Report status of each.'));

    // Review command
    if (profile.problemAreas.includes('slow_reviews') || profile.problemAreas.includes('inconsistent_code')) {
      files.push(this.createCommand('review', 'sonnet', 'high',
        'Review staged changes for quality, security, and consistency.',
        'Review the current staged changes (git diff --cached). Check for:\n- Code quality and patterns\n- Security vulnerabilities\n- Test coverage gaps\n- Documentation needs\nProvide specific, actionable feedback.'));
    }

    // Test coverage command
    if (profile.problemAreas.includes('test_gaps')) {
      files.push(this.createCommand('test-gaps', 'sonnet', 'high',
        'Find files with missing or insufficient test coverage.',
        'Analyze the project to find source files that lack corresponding test files or have obvious test coverage gaps. Report a prioritized list.'));
    }

    // Security scan command
    if (profile.securityConcerns.length > 0) {
      files.push(this.createCommand('security', 'opus', 'high',
        'Security audit of recent changes.',
        'Perform a security review of recent changes. Check for:\n- OWASP Top 10 vulnerabilities\n- Hardcoded secrets or credentials\n- Injection risks (SQL, command, XSS)\n- Authentication/authorization issues\n- Sensitive data exposure\nReport findings with severity ratings.'));
    }

    // Compliance check
    if (profile.complianceFrameworks.length > 0) {
      const frameworks = profile.complianceFrameworks.join(', ').toUpperCase();
      files.push(this.createCommand('compliance', 'opus', 'high',
        `Check compliance with ${frameworks}.`,
        `Review the codebase for ${frameworks} compliance. Check:\n- Data handling practices\n- Access controls\n- Audit logging\n- Encryption requirements\n- Documentation completeness\nReport any compliance gaps.`));
    }

    return files;
  }

  private createCommand(
    name: string, model: string, effort: string,
    description: string, prompt: string
  ): GeneratedFile {
    const md = new MarkdownBuilder();
    md.frontmatter({ model, effort, description });
    md.raw(prompt);
    md.blank();

    return {
      relativePath: `.claude/commands/${name}.md`,
      content: md.build(),
      description: `/${name} command (${model}, ${effort} effort)`,
    };
  }
}
