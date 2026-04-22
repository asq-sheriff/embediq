import type {
  ComplianceAdapterInput,
  ComplianceEvent,
  ComplianceEventAdapter,
  SignatureVerifyInput,
} from './compliance-adapter.js';
import { hmacSha256Hex, timingSafeCompare } from './hmac.js';

/**
 * Translator for Vanta's outbound webhooks. Vanta's schema keys events
 * on a top-level `type` string and carries payload in `data`:
 *
 *   test.failing     → gap_opened
 *   test.recovered   → gap_resolved
 *   test.passing     → gap_resolved
 *   observation.created  → gap_opened
 *   observation.updated  → passed through when status flips
 *
 * The payload's `frameworks` is typically an array of `{ slug, name }`
 * objects keyed by Vanta's framework slug (e.g. `soc2`, `hipaa`,
 * `pci-dss`). We map the slugs to EmbedIQ's native identifiers.
 */
export class VantaAdapter implements ComplianceEventAdapter {
  readonly id = 'vanta';
  readonly name = 'Vanta';

  /**
   * Vanta signs webhooks with `X-Vanta-Signature`, a lowercase hex
   * HMAC-SHA256 of the raw request body under the secret Vanta
   * displays when the webhook is registered in their admin UI.
   */
  verifySignature(input: SignatureVerifyInput): boolean {
    const presented = input.headers['x-vanta-signature'];
    if (!presented) return false;
    const expected = hmacSha256Hex(input.secret, input.rawBody);
    return timingSafeCompare(expected, presented);
  }

  translate(input: ComplianceAdapterInput): ComplianceEvent | null {
    if (!isObject(input.body)) return null;
    const type = typeof input.body.type === 'string' ? input.body.type : undefined;
    if (!type) return null;

    const action = mapVantaType(type, input.body.data);
    if (!action) return null;

    const data = isObject(input.body.data) ? input.body.data : {};
    const test = isObject(data.test) ? data.test : {};
    const observation = isObject(data.observation) ? data.observation : {};

    const frameworks = extractVantaFrameworks(test, observation, data);
    if (frameworks.length === 0) return null;

    return {
      source: this.id,
      framework: frameworks[0],
      action,
      controlId: stringOrUndefined(test.id) ?? stringOrUndefined(observation.id),
      findingId: stringOrUndefined(data.id),
      severity: mapSeverity(data.severity ?? observation.severity),
      title: stringOrUndefined(test.name) ?? stringOrUndefined(observation.title) ?? type,
      rawPayload: input.body,
    };
  }
}

export const vantaAdapter = new VantaAdapter();

// ─── helpers ──────────────────────────────────────────────────────────────

function mapVantaType(type: string, data: unknown): ComplianceEvent['action'] | null {
  const t = type.toLowerCase();
  if (t === 'test.failing' || t === 'test.failed') return 'gap_opened';
  if (t === 'test.recovered' || t === 'test.passing' || t === 'test.passed') return 'gap_resolved';
  if (t === 'observation.created') return 'gap_opened';
  if (t === 'observation.closed' || t === 'observation.resolved') return 'gap_resolved';
  if (t === 'observation.updated') {
    // Only act when the status flipped — otherwise the event is
    // metadata-only and should be skipped.
    const status = isObject(data) && isObject(data.observation) && typeof data.observation.status === 'string'
      ? data.observation.status.toLowerCase()
      : '';
    if (status === 'open' || status === 'failing') return 'gap_opened';
    if (status === 'closed' || status === 'resolved' || status === 'passing') return 'gap_resolved';
  }
  return null;
}

function extractVantaFrameworks(
  test: Record<string, unknown>,
  observation: Record<string, unknown>,
  data: Record<string, unknown>,
): string[] {
  const raw: unknown[] = [];
  const pushMany = (value: unknown) => { if (Array.isArray(value)) raw.push(...value); };
  pushMany(data.frameworks);
  pushMany(test.frameworks);
  pushMany(observation.frameworks);

  const out: string[] = [];
  for (const entry of raw) {
    const slug = typeof entry === 'string'
      ? entry
      : isObject(entry) && typeof entry.slug === 'string'
        ? entry.slug
        : isObject(entry) && typeof entry.id === 'string'
          ? entry.id
          : isObject(entry) && typeof entry.key === 'string'
            ? entry.key
            : undefined;
    if (!slug) continue;
    const normalized = normalizeFrameworkSlug(slug);
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

function normalizeFrameworkSlug(slug: string): string | undefined {
  const k = slug.toLowerCase().replace(/[-_\s]+/g, '');
  switch (k) {
    case 'hipaa':    return 'hipaa';
    case 'hitech':   return 'hitech';
    case 'pcidss':
    case 'pci':      return 'pci';
    case 'soc2':     return 'soc2';
    case 'gdpr':     return 'gdpr';
    case 'iso27001': return 'iso27001';
    case 'ferpa':    return 'ferpa';
    case 'sox':      return 'sox';
    default:         return slug.toLowerCase();
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stringOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
