import type { Answer } from '../types/index.js';

/**
 * A non-blocking consistency warning raised when a typed (free-text) answer
 * appears to contradict the user's earlier structured answers. The wizard
 * surfaces these as "warn + suggest" — the user can accept, edit, or proceed.
 */
export interface AnswerWarning {
  /** The question the warning is attached to (where the user would fix it). */
  questionId: string;
  severity: 'warning';
  message: string;
  /** A concrete, actionable fix the UI can offer. */
  suggestion?: string;
}

/**
 * A pure validation rule: reads the answer map, returns zero or more warnings.
 * Rules are deterministic and dependency-free. The LLM-assisted semantic rule
 * (see `purposeVsIndustryRule`) is the designated extension point — a future
 * LLM-assisted rule implements this same signature and is appended to
 * `RULES`, with no other changes.
 */
export type ValidationRule = (answers: Map<string, Answer>) => AnswerWarning[];

// ─── helpers ──────────────────────────────────────────────────────────────

function str(answers: Map<string, Answer>, id: string): string {
  const v = answers.get(id)?.value;
  return typeof v === 'string' ? v : '';
}
function arr(answers: Map<string, Answer>, id: string): string[] {
  const v = answers.get(id)?.value;
  if (Array.isArray(v)) return v.map(String);
  return typeof v === 'string' && v ? [v] : [];
}
function tokens(free: string): string[] {
  return free.split(/[,\n;/]+/).map((t) => t.trim()).filter(Boolean);
}

// Framework → the language it implies (TECH_001 option keys).
const FRAMEWORK_LANGUAGE: Record<string, string> = {
  'spring boot': 'java', spring: 'java', quarkus: 'java', micronaut: 'java',
  django: 'python', flask: 'python', fastapi: 'python', 'asp.net': 'csharp', aspnet: 'csharp',
  '.net': 'csharp', 'entity framework': 'csharp', blazor: 'csharp',
  react: 'typescript', angular: 'typescript', vue: 'typescript', svelte: 'typescript',
  next: 'typescript', 'next.js': 'typescript', express: 'typescript', nest: 'typescript',
  rails: 'ruby', sinatra: 'ruby', gin: 'go', echo: 'go', fiber: 'go', actix: 'rust', rocket: 'rust',
};
const LANGUAGE_LABEL: Record<string, string> = {
  typescript: 'TypeScript / JavaScript', python: 'Python', java: 'Java / Kotlin',
  go: 'Go', rust: 'Rust', csharp: 'C# / .NET', swift: 'Swift', ruby: 'Ruby',
};

// Industry → keywords that strongly imply it (for the purpose↔industry rule).
const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  healthcare: ['patient', 'clinical', 'phi', 'medical', 'hospital', 'ehr', 'fhir', 'claims', 'payer', 'hipaa', 'provider'],
  finance: ['payment', 'bank', 'trading', 'card', 'ledger', 'invoice', 'lending', 'fintech', 'brokerage', 'pci'],
  ecommerce: ['cart', 'checkout', 'storefront', 'catalog', 'retail', 'orders', 'shopping'],
  education: ['student', 'course', 'learning', 'classroom', 'curriculum', 'lms', 'ferpa'],
  government: ['citizen', 'agency', 'federal', 'municipal', 'public sector', 'fedramp'],
};

// ─── rules ────────────────────────────────────────────────────────────────

/** TECH_003 (frameworks free-text) vs TECH_001 (languages). */
const frameworkVsLanguageRule: ValidationRule = (answers) => {
  const langs = new Set(arr(answers, 'TECH_001'));
  const out: AnswerWarning[] = [];
  const seen = new Set<string>();
  for (const tok of tokens(str(answers, 'TECH_003'))) {
    const key = tok.toLowerCase();
    const lang = FRAMEWORK_LANGUAGE[key] ?? FRAMEWORK_LANGUAGE[key.replace(/\s+/g, '')];
    if (lang && !langs.has(lang) && !seen.has(lang)) {
      seen.add(lang);
      out.push({
        questionId: 'TECH_003',
        severity: 'warning',
        message: `You listed "${tok}", which is typically ${LANGUAGE_LABEL[lang]}, but ${LANGUAGE_LABEL[lang]} isn't selected in your languages.`,
        suggestion: `Add ${LANGUAGE_LABEL[lang]} to your languages (TECH_001), or remove "${tok}".`,
      });
    }
  }
  return out;
};

/** Containerization includes serverless but no cloud target chosen. */
const serverlessWithoutCloudRule: ValidationRule = (answers) => {
  if (arr(answers, 'TECH_008').includes('serverless') && !str(answers, 'TECH_022')) {
    return [{
      questionId: 'TECH_022',
      severity: 'warning',
      message: 'You selected Serverless deployment but left the cloud / deployment target blank.',
      suggestion: 'Pick a cloud target (TECH_022) so serverless scaffolding targets the right platform.',
    }];
  }
  return [];
};

/** "Other (specify)" free-text that duplicates an already-selected option. */
function otherDuplicateRule(parentId: string, otherId: string): ValidationRule {
  return (answers) => {
    const selected = arr(answers, parentId).map((s) => s.toLowerCase());
    const out: AnswerWarning[] = [];
    for (const tok of tokens(str(answers, otherId))) {
      if (selected.includes(tok.toLowerCase())) {
        out.push({
          questionId: otherId,
          severity: 'warning',
          message: `"${tok}" is already selected above — no need to list it again under "Other".`,
          suggestion: `Remove "${tok}" from the "Other" box.`,
        });
      }
    }
    return out;
  };
}

/** REG_012b custom DLP regex must compile. Split on newlines only —
 *  commas are valid inside regex quantifiers like `\d{3,4}`. */
const regexValidityRule: ValidationRule = (answers) => {
  const out: AnswerWarning[] = [];
  const patterns = str(answers, 'REG_012b').split('\n').map((s) => s.trim()).filter(Boolean);
  for (const tok of patterns) {
    try { new RegExp(tok); } catch (e) {
      out.push({
        questionId: 'REG_012b',
        severity: 'warning',
        message: `The custom DLP pattern "${tok}" is not a valid regular expression (${e instanceof Error ? e.message : 'parse error'}).`,
        suggestion: 'Fix the regex syntax so the DLP scanner can compile it.',
      });
    }
  }
  return out;
};

/** Custom local-model hardware should have enough RAM for Ollama. */
const hardwareFeasibilityRule: ValidationRule = (answers) => {
  const spec = str(answers, 'TECH_014_other');
  if (!spec) return [];
  const m = spec.match(/(\d+(?:\.\d+)?)\s*(gb|g)\b/i);
  if (m && parseFloat(m[1]) < 5) {
    return [{
      questionId: 'TECH_014_other',
      severity: 'warning',
      message: `"${spec}" looks like under 5 GB of RAM — too little to run most Ollama models comfortably.`,
      suggestion: 'Confirm the hardware has at least 8 GB RAM, or choose a smaller quantized model.',
    }];
  }
  return [];
};

/**
 * STRAT_001 (free-text purpose) vs STRAT_002 (industry). Keyword-based today;
 * this is the designated hook for an optional LLM-assisted semantic rule.
 * It only fires on a strong mismatch to stay low-noise.
 */
const purposeVsIndustryRule: ValidationRule = (answers) => {
  const industry = str(answers, 'STRAT_002');
  const purpose = str(answers, 'STRAT_001').toLowerCase();
  if (!industry || industry === 'other' || !purpose) return [];
  for (const [kwIndustry, words] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (kwIndustry === industry) continue;
    const hits = words.filter((w) => purpose.includes(w));
    if (hits.length >= 2) {
      return [{
        questionId: 'STRAT_002',
        severity: 'warning',
        message: `Your project description mentions ${hits.slice(0, 3).join(', ')}, which reads as ${kwIndustry}, but you selected the ${industry} industry.`,
        suggestion: `Confirm the industry is ${industry}, or switch it to ${kwIndustry} to load the right compliance pack.`,
      }];
    }
  }
  return [];
};

const RULES: ValidationRule[] = [
  frameworkVsLanguageRule,
  serverlessWithoutCloudRule,
  otherDuplicateRule('TECH_004', 'TECH_004_other'),
  otherDuplicateRule('TECH_005', 'TECH_005_other'),
  otherDuplicateRule('TECH_006', 'TECH_006_other'),
  otherDuplicateRule('TECH_011', 'TECH_011_other'),
  otherDuplicateRule('REG_002', 'REG_002_other'),
  regexValidityRule,
  hardwareFeasibilityRule,
  purposeVsIndustryRule,
];

/** Run every rule and return all warnings, in rule order. */
export function validateAnswers(answers: Map<string, Answer>): AnswerWarning[] {
  return RULES.flatMap((rule) => rule(answers));
}
