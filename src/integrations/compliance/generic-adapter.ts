import type {
  ComplianceAdapterInput,
  ComplianceEvent,
  ComplianceEventAdapter,
} from './compliance-adapter.js';

/**
 * Pass-through adapter for any compliance platform that can POST a
 * JSON payload matching EmbedIQ's canonical `ComplianceEvent` shape
 * (minus the `source` field we fill in). Use this when no dedicated
 * adapter exists — or to test the route end-to-end without a real
 * Drata/Vanta mock.
 *
 * Accepted body shape:
 *
 *   {
 *     "framework": "hipaa",
 *     "action": "gap_opened" | "gap_resolved" | "other",
 *     "controlId":  "CTRL-123",
 *     "findingId":  "finding-42",
 *     "severity":   "high",
 *     "title":      "Access controls monitor failing"
 *   }
 */
export class GenericComplianceAdapter implements ComplianceEventAdapter {
  readonly id = 'generic';
  readonly name = 'Generic';

  translate(input: ComplianceAdapterInput): ComplianceEvent | null {
    if (!isObject(input.body)) return null;
    const framework = stringOrUndefined(input.body.framework)
      ?? stringOrUndefined(input.body.compliance_framework);
    if (!framework) return null;

    const rawAction = stringOrUndefined(input.body.action);
    const action = rawAction === 'gap_opened' || rawAction === 'gap_resolved' || rawAction === 'other'
      ? rawAction
      : 'other';

    return {
      source: this.id,
      framework: framework.toLowerCase(),
      action,
      controlId: stringOrUndefined(input.body.controlId) ?? stringOrUndefined(input.body.control_id),
      findingId: stringOrUndefined(input.body.findingId) ?? stringOrUndefined(input.body.finding_id),
      severity: mapSeverity(input.body.severity),
      title: stringOrUndefined(input.body.title),
      rawPayload: input.body,
    };
  }
}

export const genericComplianceAdapter = new GenericComplianceAdapter();

// ─── helpers ──────────────────────────────────────────────────────────────

function mapSeverity(value: unknown): ComplianceEvent['severity'] | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high' || v === 'critical') return v;
  return undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stringOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
