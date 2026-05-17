/**
 * PHI redactor — runs before any prompt is escalated to a hosted LLM.
 *
 * This is a defense-in-depth filter, not a replacement for a real
 * de-identification pipeline (45 CFR 164.514 Safe Harbor / Expert
 * Determination). It catches the most common PHI shapes — SSN,
 * MRN-style identifiers, US phone numbers, email addresses, dates of
 * birth, and 5+-digit ZIPs — and replaces them with type-tagged
 * placeholders so the hosted LLM can still reason about the prompt's
 * structure.
 *
 * IMPORTANT: review and harden this list against your data corpus
 * before any real PHI flows through the router.
 */

interface RedactionPattern {
  label: string;
  pattern: RegExp;
}

const PATTERNS: RedactionPattern[] = [
  { label: 'SSN', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { label: 'PHONE', pattern: /\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b/g },
  { label: 'EMAIL', pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { label: 'MRN', pattern: /\bMRN[#: ]*\d{4,}\b/gi },
  { label: 'DOB', pattern: /\b(?:0?[1-9]|1[0-2])[\/-](?:0?[1-9]|[12]\d|3[01])[\/-](?:19|20)\d{2}\b/g },
  { label: 'ZIP5', pattern: /\b\d{5}(?:-\d{4})?\b/g },
];

export function redactPhi(input: string): string {
  let out = input;
  for (const { label, pattern } of PATTERNS) {
    out = out.replace(pattern, `[REDACTED:${label}]`);
  }
  return out;
}

/** Exposed for tests — returns the set of redaction labels triggered. */
export function detectPhiLabels(input: string): string[] {
  const hits = new Set<string>();
  for (const { label, pattern } of PATTERNS) {
    if (pattern.test(input)) hits.add(label);
    pattern.lastIndex = 0;
  }
  return Array.from(hits).sort();
}
