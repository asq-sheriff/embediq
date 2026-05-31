import { describe, it, expect } from 'vitest';
import { inferIdes, inferBuildTools, inferTestFrameworks, inferLinters, orInfer } from '../../src/engine/answer-inference.js';

describe('answer-inference', () => {
  it('infers build tools, test frameworks, and linters per language', () => {
    expect(inferBuildTools(['python'])).toEqual(['pip']);
    expect(inferBuildTools(['typescript', 'java', 'csharp'])).toEqual(['npm', 'maven', 'dotnet']);
    expect(inferTestFrameworks(['typescript', 'python'])).toEqual(['jest', 'pytest']);
    expect(inferTestFrameworks(['csharp'])).toEqual(['xunit']);
    expect(inferLinters(['typescript'])).toEqual(['prettier', 'eslint']);
    expect(inferLinters(['python', 'go'])).toEqual(['ruff', 'gofmt']);
    expect(inferIdes()).toEqual(['vscode']);
  });

  it('dedupes and ignores unknown languages', () => {
    expect(inferBuildTools(['python', 'python'])).toEqual(['pip']);
    expect(inferTestFrameworks(['cobol'])).toEqual([]);
  });

  it('orInfer prefers the explicit answer and only records when it infers', () => {
    const recorded: Record<string, string[]> = {};
    const rec = (f: string, v: string[]) => { recorded[f] = v; };

    // explicit wins, nothing recorded
    expect(orInfer('Testing', ['xunit'], ['pytest'], rec)).toEqual(['xunit']);
    expect(recorded).toEqual({});

    // empty actual → inferred, and recorded
    expect(orInfer('Testing', [], ['pytest'], rec)).toEqual(['pytest']);
    expect(recorded).toEqual({ Testing: ['pytest'] });

    // empty actual + empty inferred → empty, not recorded
    expect(orInfer('Build tools', [], [], rec)).toEqual([]);
    expect(recorded.Testing).toBeDefined();
    expect(recorded['Build tools']).toBeUndefined();
  });
});
