import { describe, it, expect } from 'vitest';
import { MarkdownBuilder } from '../../src/util/markdown-builder.js';

describe('MarkdownBuilder', () => {
  it('builds h1 headings', () => {
    const md = new MarkdownBuilder().h1('Title').build();
    expect(md).toContain('# Title');
  });

  it('builds h2 headings', () => {
    const md = new MarkdownBuilder().h2('Section').build();
    expect(md).toContain('## Section');
  });

  it('builds h3 headings', () => {
    const md = new MarkdownBuilder().h3('Subsection').build();
    expect(md).toContain('### Subsection');
  });

  it('builds bullet points', () => {
    const md = new MarkdownBuilder().bullet('Item 1').bullet('Item 2').build();
    expect(md).toContain('- Item 1');
    expect(md).toContain('- Item 2');
  });

  it('builds numbered items', () => {
    const md = new MarkdownBuilder().numberedItem(1, 'First').numberedItem(2, 'Second').build();
    expect(md).toContain('1. First');
    expect(md).toContain('2. Second');
  });

  it('builds paragraphs with blank line after', () => {
    const md = new MarkdownBuilder().paragraph('Some text').build();
    expect(md).toBe('Some text\n');
  });

  it('builds code blocks with language', () => {
    const md = new MarkdownBuilder().codeBlock('const x = 1;', 'typescript').build();
    expect(md).toContain('```typescript');
    expect(md).toContain('const x = 1;');
    expect(md).toContain('```');
  });

  it('builds code blocks without language', () => {
    const md = new MarkdownBuilder().codeBlock('hello').build();
    expect(md).toContain('```\nhello\n```');
  });

  it('builds frontmatter with scalar values', () => {
    const md = new MarkdownBuilder().frontmatter({ model: 'sonnet', effort: 'high' }).build();
    expect(md).toContain('---');
    expect(md).toContain('model: sonnet');
    expect(md).toContain('effort: high');
  });

  it('builds frontmatter with array values', () => {
    const md = new MarkdownBuilder().frontmatter({ paths: ['src/**', 'tests/**'] }).build();
    expect(md).toContain('paths:');
    expect(md).toContain('  - "src/**"');
    expect(md).toContain('  - "tests/**"');
  });

  it('builds frontmatter with multiline string values', () => {
    const md = new MarkdownBuilder().frontmatter({ description: 'line1\nline2' }).build();
    expect(md).toContain('description: |');
    expect(md).toContain('  line1');
    expect(md).toContain('  line2');
  });

  it('supports fluent chaining', () => {
    const md = new MarkdownBuilder()
      .h1('Title')
      .h2('Section')
      .bullet('Item')
      .blank()
      .paragraph('Text')
      .build();
    expect(md).toContain('# Title');
    expect(md).toContain('## Section');
    expect(md).toContain('- Item');
    expect(md).toContain('Text');
  });

  it('builds HTML comments', () => {
    const md = new MarkdownBuilder().comment('hidden').build();
    expect(md).toBe('<!-- hidden -->');
  });

  it('supports raw text', () => {
    const md = new MarkdownBuilder().raw('anything here').build();
    expect(md).toBe('anything here');
  });
});
