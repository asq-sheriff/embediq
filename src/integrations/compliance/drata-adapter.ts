import type {
  ComplianceAdapterInput,
  ComplianceEvent,
  ComplianceEventAdapter,
} from './compliance-adapter.js';

/**
 * Translator for Drata's outbound webhooks. Drata's public webhook
 * schema uses an `event` string plus a `data` object whose shape varies
 * by event type. We narrow to the control-lifecycle events that map
 * cleanly onto an "a compliance gap opened/closed" signal:
 *
 *   monitor.failed      → gap_opened
 *   monitor.failing     → gap_opened   (continuous-failure heartbeat)
 *   monitor.recovered   → gap_resolved
 *   monitor.passing     → gap_resolved
 *   control.unassigned  → gap_opened
 *   finding.opened      → gap_opened
 *   finding.closed      → gap_resolved
 *
 * Everything else returns `null` so the webhook endpoint can answer
 * 200/skipped rather than 400 — Drata's account-level webhooks fan out
 * many system events that aren't compliance-gap signals.
 */
export class DrataAdapter implements ComplianceEventAdapter {
  readonly id = 'drata';
  readonly name = 'Drata';

  translate(input: ComplianceAdapterInput): ComplianceEvent | null {
    if (!isObject(input.body)) return null;
    const event = typeof input.body.event === 'string' ? input.body.event : undefined;
    if (!event) return null;

    const action = mapEvent(event);
    if (!action) return null;

    const data = isObject(input.body.data) ? input.body.data : {};
    const control = isObject(data.control) ? data.control : {};
    const finding = isObject(data.finding) ? data.finding : {};

    const frameworks = extractFrameworks(control, finding);
    if (frameworks.length === 0) return null;

    // Emit one event per framework touched — the route spins a run per
    // framework intersecting a schedule. Drata webhooks typically touch
    // only one or two frameworks per control, so this stays cheap.
    const framework = frameworks[0];

    return {
      source: this.id,
      framework,
      action,
      controlId: stringOrUndefined(control.id) ?? stringOrUndefined(control.public_id),
      findingId: stringOrUndefined(finding.id),
      severity: mapSeverity(data.severity ?? finding.severity ?? control.severity),
      title: stringOrUndefined(control.name) ?? stringOrUndefined(finding.title) ?? event,
      rawPayload: input.body,
    };
  }
}

export const drataAdapter = new DrataAdapter();

// ─── helpers ──────────────────────────────────────────────────────────────

function mapEvent(event: string): ComplianceEvent['action'] | null {
  const normalized = event.toLowerCase();
  if (
    normalized === 'monitor.failed'
    || normalized === 'monitor.failing'
    || normalized === 'control.unassigned'
    || normalized === 'finding.opened'
    || normalized === 'finding.reopened'
  ) return 'gap_opened';
  if (
    normalized === 'monitor.recovered'
    || normalized === 'monitor.passing'
    || normalized === 'finding.closed'
    || normalized === 'finding.resolved'
  ) return 'gap_resolved';
  return null;
}

/**
 * Drata's payloads label frameworks with identifiers like `hipaa`,
 * `soc_2`, `iso_27001`. We lowercase and normalize a few common
 * synonyms to EmbedIQ's native identifiers.
 */
function extractFrameworks(control: Record<string, unknown>, finding: Record<string, unknown>): string[] {
  const raw: unknown[] = [];
  const pushMany = (value: unknown) => {
    if (Array.isArray(value)) raw.push(...value);
  };
  pushMany(control.frameworks);
  pushMany(finding.frameworks);
  const out: string[] = [];
  for (const entry of raw) {
    const key = typeof entry === 'string'
      ? entry
      : isObject(entry) && typeof entry.key === 'string'
        ? entry.key
        : isObject(entry) && typeof entry.id === 'string'
          ? entry.id
          : undefined;
    if (!key) continue;
    const normalized = normalizeFramework(key);
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out;
}

function mapSeverity(value: unknown): ComplianceEvent['severity'] | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high' || v === 'critical') return v;
  return undefined;
}

function normalizeFramework(key: string): string | undefined {
  const k = key.toLowerCase().replace(/\s+/g, '_');
  switch (k) {
    case 'hipaa':       return 'hipaa';
    case 'hitech':      return 'hitech';
    case 'pci':
    case 'pci_dss':     return 'pci';
    case 'soc_2':
    case 'soc2':        return 'soc2';
    case 'gdpr':        return 'gdpr';
    case 'iso_27001':
    case 'iso27001':    return 'iso27001';
    case 'ferpa':       return 'ferpa';
    case 'sox':         return 'sox';
    case 'glba':        return 'glba';
    default:            return k; // passthrough for anything we don't map
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stringOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
