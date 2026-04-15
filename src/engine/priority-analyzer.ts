import type { Answer, Priority, Question } from '../types/index.js';

interface TagWeight {
  tag: string;
  weight: number;
  sourceQuestionId: string;
}

const BASE_PRIORITY_CATEGORIES: Record<string, string[]> = {
  'Security & Compliance': ['security', 'compliance', 'phi', 'pii', 'hipaa', 'audit', 'secrets', 'sensitive_data', 'protected_files', 'deny_rules', 'scanning', 'data_classification', 'dlp', 'context_sanitization', 'session_audit_trail', 'output_review'],
  'Cost Optimization': ['cost', 'budget', 'cost_optimization', 'local_models', 'model_routing', 'thinking_tokens', 'ollama'],
  'Code Quality': ['quality', 'testing', 'tdd', 'linting', 'formatting', 'quality_gates', 'enforcement', 'consistency'],
  'Developer Productivity': ['velocity', 'workflow', 'commands', 'agents', 'automation', 'devtools', 'editor'],
  'Team Coordination': ['collaboration', 'team_size', 'parallel_work', 'worktrees', 'code_review', 'agent_teams', 'branching'],
  'CI/CD & Automation': ['cicd', 'automation', 'cicd_integration', 'deployment', 'devops', 'containers'],
  'Monitoring & Observability': ['monitoring', 'observability', 'logging', 'audit_logging'],
  'Documentation & Knowledge': ['documentation', 'memory', 'context_persistence', 'association_map', 'lifecycle'],
};

export class PriorityAnalyzer {
  private categories: Record<string, string[]>;

  constructor(additionalCategories?: Record<string, string[]>) {
    this.categories = { ...BASE_PRIORITY_CATEGORIES };

    if (additionalCategories) {
      for (const [name, tags] of Object.entries(additionalCategories)) {
        if (this.categories[name]) {
          const merged = [...new Set([...this.categories[name], ...tags])];
          this.categories[name] = merged;
        } else {
          this.categories[name] = tags;
        }
      }
    }
  }

  analyze(answers: Map<string, Answer>, allQuestions: Question[]): Priority[] {
    const tagWeights: TagWeight[] = [];

    for (const [questionId, answer] of answers) {
      const question = allQuestions.find(q => q.id === questionId);
      if (!question) continue;

      const weight = this.computeWeight(answer, question);
      for (const tag of question.tags) {
        tagWeights.push({ tag, weight, sourceQuestionId: questionId });
      }
    }

    const priorities: Priority[] = [];

    for (const [category, tags] of Object.entries(this.categories)) {
      const relevantWeights = tagWeights.filter(tw => tags.includes(tw.tag));
      if (relevantWeights.length === 0) continue;

      const totalWeight = relevantWeights.reduce((sum, tw) => sum + tw.weight, 0);
      const maxPossible = relevantWeights.length * 5;
      const confidence = Math.min(totalWeight / maxPossible, 1.0);
      const sources = [...new Set(relevantWeights.map(tw => tw.sourceQuestionId))];

      priorities.push({ name: category, confidence, derivedFrom: sources });
    }

    return priorities
      .filter(p => p.confidence > 0.1)
      .sort((a, b) => b.confidence - a.confidence);
  }

  private computeWeight(answer: Answer, question: Question): number {
    const { value } = answer;

    if (typeof value === 'boolean') {
      return value ? 3 : 0;
    }

    if (typeof value === 'number') {
      return value;
    }

    if (Array.isArray(value)) {
      return Math.min(value.length * 1.5, 5);
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      return 2;
    }

    return 0;
  }
}
