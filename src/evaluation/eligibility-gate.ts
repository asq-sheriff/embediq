/**
 * Egress-eligibility gate — the auditor-facing verification nobody else ships.
 *
 * Loads an adversarial PHI/PCI corpus, classifies each prompt with the REAL
 * domain-pack DLP patterns, computes the eligible destination set from the
 * routing policy, and proves the one property that matters: **no prompt whose
 * true class is regulated can reach a destination that class forbids — even
 * when the classifier misses it.**
 *
 * The result demonstrates the architecture's thesis directly:
 *   - air-gapped config (no external destination) → always safe (route absence);
 *   - covered-only config → safe (no uncovered destination to breach);
 *   - covered + UNCOVERED config → a classifier miss becomes a real leak, which
 *     this gate catches. "Absence of a route beats a filter on a route."
 *
 * Pure and deterministic. No agent is run and no network call is made.
 */

import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { healthcarePack } from '../domain-packs/built-in/healthcare.js';
import { financePack } from '../domain-packs/built-in/finance.js';
import { createEmptyProfile, type UserProfile } from '../types/index.js';
import {
  buildRoutingPolicy,
  eligibleDestinations,
  ruleFor,
  categoryOf,
  type DataClass,
} from '../synthesizer/policy/index.js';

// ─── Corpus ──────────────────────────────────────────────────────────────

export interface CorpusPrompt {
  id: string;
  /** The prompt's TRUE data class (ground truth). */
  class: DataClass;
  /** Identifiers seeded in the prompt — must NEVER appear in a decision trace. */
  seeded: string[];
  text: string;
}

export interface EligibilityCorpus {
  version: number;
  prompts: CorpusPrompt[];
}

export function loadCorpus(path: string): EligibilityCorpus {
  const parsed = parseYaml(readFileSync(path, 'utf-8')) as EligibilityCorpus;
  if (!parsed || !Array.isArray(parsed.prompts)) {
    throw new Error(`eligibility corpus at ${path} has no "prompts" array`);
  }
  return parsed;
}

// ─── Classifier — the real shipped DLP patterns ──────────────────────────

const PHI_PATTERNS = healthcarePack.dlpPatterns.map((p) => new RegExp(p.pattern, 'gi'));
// Cardholder-data patterns only — the PCI-relevant subset (avoids SWIFT/IBAN
// false positives on ordinary prose).
const PCI_PATTERNS = financePack.dlpPatterns
  .filter((p) => /PAN|CVV|CVC/i.test(p.name))
  .map((p) => new RegExp(p.pattern, 'gi'));

function anyMatch(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

/** Regex classifier — deliberately the shipped patterns, limits and all. */
export function classifyDataClass(text: string): DataClass {
  if (anyMatch(text, PHI_PATTERNS)) return 'phi';
  if (anyMatch(text, PCI_PATTERNS)) return 'pci';
  return 'public';
}

// ─── Gate ────────────────────────────────────────────────────────────────

export interface DecisionTrace {
  promptId: string;
  trueClass: DataClass;
  decidedClass: DataClass;
  misclassified: boolean;
  /** Destination ids the policy permitted for the CLASSIFIER's decision. */
  eligible: string[];
  refused: boolean;
  refusalReason?: string;
  violation: boolean;
  violationReason?: string;
}

export interface EligibilityReport {
  passed: boolean;
  scenario?: string;
  total: number;
  misclassified: number;
  violations: DecisionTrace[];
  /** Seeded identifier values found in the serialized traces — must be empty. */
  valueLeaks: string[];
  traces: DecisionTrace[];
}

/**
 * Run the corpus through the policy. A VIOLATION is any prompt whose eligible
 * set — computed from the classifier's decision — contains a destination the
 * prompt's TRUE class forbids. That is exactly "a regulated prompt the
 * classifier missed could still leave to a place it must not."
 */
export function runEligibilityGate(corpus: EligibilityCorpus, profile: UserProfile): EligibilityReport {
  const policy = buildRoutingPolicy(profile);

  const traces: DecisionTrace[] = corpus.prompts.map((p) => {
    const decidedClass = classifyDataClass(p.text);
    const eligible = eligibleDestinations(policy.destinations, policy.eligibility, decidedClass);
    const trueRule = ruleFor(policy.eligibility, p.class);
    const forbidden = eligible.filter((d) => !trueRule.allow.includes(categoryOf(d, trueRule)));
    const refused = eligible.length === 0;

    return {
      promptId: p.id,
      trueClass: p.class,
      decidedClass,
      misclassified: decidedClass !== p.class,
      eligible: eligible.map((d) => d.id),
      refused,
      refusalReason: refused ? `no eligible destination for class '${decidedClass}'` : undefined,
      violation: forbidden.length > 0,
      violationReason: forbidden.length > 0
        ? `'${p.class}' prompt could reach ${forbidden.map((d) => d.id).join(', ')} — forbidden for '${p.class}'`
        : undefined,
    };
  });

  // A trace that records what was redacted is a trace that contains PHI.
  // Assert by construction: no seeded identifier value appears anywhere in the
  // serialized traces (they carry ids/classes/booleans only).
  const serialized = JSON.stringify(traces);
  const valueLeaks: string[] = [];
  for (const p of corpus.prompts) {
    for (const s of p.seeded) {
      if (s && serialized.includes(s)) valueLeaks.push(`${p.id}: "${s}"`);
    }
  }

  const violations = traces.filter((t) => t.violation);
  return {
    passed: violations.length === 0 && valueLeaks.length === 0,
    total: traces.length,
    misclassified: traces.filter((t) => t.misclassified).length,
    violations,
    valueLeaks,
    traces,
  };
}

// ─── Scenario profiles ───────────────────────────────────────────────────

export type EligibilityScenario = 'airgapped' | 'covered' | 'mixed';

/**
 * Three regulated (HIPAA + PCI) profiles that differ only in their egress posture:
 *   - airgapped: no external providers at all;
 *   - covered:   only a BAA-attested provider;
 *   - mixed:     an attested provider PLUS an unattested one (the danger case).
 */
export function scenarioProfile(scenario: EligibilityScenario): UserProfile {
  const base: UserProfile = {
    ...createEmptyProfile(),
    industry: 'healthcare',
    complianceFrameworks: ['hipaa', 'pci'],
    routerEnabled: true,
    defaultLocalModel: 'llama3.1:8b',
  };
  switch (scenario) {
    case 'airgapped':
      return { ...base, externalApis: [], coveredProviders: [] };
    case 'covered':
      return { ...base, externalApis: ['anthropic'], coveredProviders: ['anthropic'] };
    case 'mixed':
      return { ...base, externalApis: ['anthropic', 'openai'], coveredProviders: ['anthropic'] };
  }
}

// ─── Report rendering ────────────────────────────────────────────────────

export function renderEligibilityReport(report: EligibilityReport): string {
  const lines: string[] = [];
  const verdict = report.passed ? 'PASS' : 'FAIL';
  lines.push(`Egress-eligibility gate — ${verdict}${report.scenario ? ` (scenario: ${report.scenario})` : ''}`);
  lines.push(`  prompts: ${report.total}   misclassified: ${report.misclassified}   violations: ${report.violations.length}`);
  if (report.valueLeaks.length > 0) {
    lines.push(`  ⚠ VALUE LEAK — seeded identifiers found in traces:`);
    for (const v of report.valueLeaks) lines.push(`      ${v}`);
  }
  if (report.violations.length > 0) {
    lines.push(`  Violations (a regulated prompt could reach a forbidden destination):`);
    for (const t of report.violations) {
      lines.push(`      ✗ ${t.promptId}: true=${t.trueClass} decided=${t.decidedClass} — ${t.violationReason}`);
    }
  } else {
    lines.push(`  ✓ zero regulated prompts can reach a forbidden destination.`);
  }
  return lines.join('\n') + '\n';
}
