export class MarkdownBuilder {
  private lines: string[] = [];

  h1(text: string): this {
    this.lines.push(`# ${text}`, '');
    return this;
  }

  h2(text: string): this {
    this.lines.push(`## ${text}`, '');
    return this;
  }

  h3(text: string): this {
    this.lines.push(`### ${text}`, '');
    return this;
  }

  paragraph(text: string): this {
    this.lines.push(text, '');
    return this;
  }

  bullet(text: string): this {
    this.lines.push(`- ${text}`);
    return this;
  }

  numberedItem(n: number, text: string): this {
    this.lines.push(`${n}. ${text}`);
    return this;
  }

  codeBlock(code: string, language = ''): this {
    this.lines.push(`\`\`\`${language}`, code, '```', '');
    return this;
  }

  frontmatter(fields: Record<string, string | string[] | number | boolean>): this {
    this.lines.push('---');
    for (const [key, value] of Object.entries(fields)) {
      if (Array.isArray(value)) {
        this.lines.push(`${key}:`);
        for (const item of value) {
          this.lines.push(`  - "${item}"`);
        }
      } else if (typeof value === 'string' && value.includes('\n')) {
        this.lines.push(`${key}: |`);
        for (const line of value.split('\n')) {
          this.lines.push(`  ${line}`);
        }
      } else {
        this.lines.push(`${key}: ${value}`);
      }
    }
    this.lines.push('---', '');
    return this;
  }

  blank(): this {
    this.lines.push('');
    return this;
  }

  raw(text: string): this {
    this.lines.push(text);
    return this;
  }

  comment(text: string): this {
    this.lines.push(`<!-- ${text} -->`);
    return this;
  }

  build(): string {
    return this.lines.join('\n');
  }
}
