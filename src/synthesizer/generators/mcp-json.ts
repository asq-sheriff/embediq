import type { ConfigGenerator } from '../generator.js';
import type { SetupConfig, GeneratedFile } from '../../types/index.js';

export class McpJsonGenerator implements ConfigGenerator {
  name = 'mcp-json';

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    const mcpPrefs = profile.answers.get('TECH_015');
    const selected = Array.isArray(mcpPrefs?.value) ? mcpPrefs.value as string[] : [];

    const servers: Record<string, unknown> = {};

    // Always recommend Context7 for documentation grounding
    if (selected.includes('context7') || selected.includes('unsure')) {
      servers['context7'] = {
        command: 'npx',
        args: ['-y', '@context7/mcp'],
      };
    }

    // Sequential Thinking for complex reasoning
    if (selected.includes('sequential') || selected.includes('unsure')) {
      servers['sequential-thinking'] = {
        command: 'npx',
        args: ['-y', '@anthropic/sequential-thinking-mcp'],
      };
    }

    // GitHub MCP
    if (selected.includes('github')) {
      servers['github'] = {
        command: 'npx',
        args: ['-y', '@anthropic/github-mcp'],
        env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
      };
    }

    // Filesystem MCP
    if (selected.includes('filesystem')) {
      servers['filesystem'] = {
        command: 'npx',
        args: ['-y', '@anthropic/filesystem-mcp'],
      };
    }

    // Playwright MCP
    if (selected.includes('playwright')) {
      servers['playwright'] = {
        command: 'npx',
        args: ['-y', '@anthropic/playwright-mcp'],
      };
    }

    // Database MCP
    if (selected.includes('database')) {
      servers['database'] = {
        command: 'npx',
        args: ['-y', '@anthropic/database-mcp'],
        env: { DATABASE_URL: '${DATABASE_URL}' },
      };
    }

    // Local model delegation for cost-sensitive setups
    if (profile.answers.get('TECH_013')?.value === true) {
      servers['ollama-sidekick'] = {
        command: 'npx',
        args: ['-y', '@anthropic/ollama-claude'],
        env: { OLLAMA_HOST: 'http://localhost:11434' },
      };
    }

    // Non-technical users benefit from Gemini Grounding for web search
    if (['ba', 'pm', 'executive', 'data'].includes(profile.role)) {
      servers['gemini-grounding'] = {
        command: 'npx',
        args: ['-y', '@anthropic/gemini-grounding-mcp'],
        env: { GOOGLE_API_KEY: '${GOOGLE_API_KEY}' },
      };
    }

    const template = {
      mcpServers: servers,
    };

    const content = JSON.stringify(template, null, 2)
      .replace(/"\$\{(\w+)\}"/g, '"${$1}"') + '\n';

    const files: GeneratedFile[] = [{
      relativePath: '.mcp.json.template',
      content: `// MCP Server Configuration Template\n// Copy to .mcp.json and fill in API keys\n// .mcp.json is gitignored — credentials stay local\n${content}`,
      description: 'MCP server configuration template (copy to .mcp.json)',
    }];

    return files;
  }
}
