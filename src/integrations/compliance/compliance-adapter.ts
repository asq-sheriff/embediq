/**
 * Canonical event shape EmbedIQ understands internally. Platform-specific
 * adapters translate Drata / Vanta / Secureframe / ServiceNow payloads
 * into this before handing off to the autopilot runner.
 */
export interface ComplianceEvent {
  /**
   * Adapter that produced the event. Useful for audit trails ("this run
   * was triggered by Drata") without carrying the raw payload around.
   */
  source: string;
  /**
   * Compliance framework the event pertains to, normalized to EmbedIQ's
   * own identifiers where a mapping exists (`hipaa`, `pci`, `soc2`,
   * `ferpa`, etc.). Unrecognized frameworks pass through verbatim.
   */
  framework: string;
  /**
   * Lifecycle action reported by the platform. `gap_opened` means a
   * control started failing and a regeneration may close the gap;
   * `gap_resolved` means a previously-failing control passed again;
   * `other` is a catch-all for informational events.
   */
  action: 'gap_opened' | 'gap_resolved' | 'other';
  /** Platform-specific control id (e.g. Drata's CTRL-123). */
  controlId?: string;
  /** Platform-specific finding / test id, when applicable. */
  findingId?: string;
  /** Human-readable severity label when the platform supplies one. */
  severity?: 'low' | 'medium' | 'high' | 'critical';
  /** Human-readable title/summary for logs and notification payloads. */
  title?: string;
  /** Original payload — retained for audit and debugging. */
  rawPayload: unknown;
}

export interface ComplianceAdapterInput {
  /**
   * Parsed JSON body. Adapters may narrow/validate. Pass `undefined` when
   * the incoming request had no body — the adapter is then expected to
   * return null (there's nothing to translate).
   */
  body: unknown;
  /**
   * Raw HTTP headers keyed by lowercase header name. Adapters can use
   * this to extract platform-specific signing or event-type hints
   * (e.g. Drata's `drata-signature`, generic X-Event-Type).
   */
  headers: Record<string, string>;
}

/**
 * Input to a signature verifier. The raw body must be the exact bytes
 * the client sent — JSON-parsing reorders keys and strips whitespace,
 * both of which break HMACs. Express's `json()` parser is configured
 * to stash the raw body on `req.rawBody` so we can reach it here.
 */
export interface SignatureVerifyInput {
  rawBody: Buffer;
  headers: Record<string, string>;
  secret: string;
}

/**
 * Translates a platform's webhook payload into a canonical
 * `ComplianceEvent`. Returns `null` when the payload is well-formed but
 * not one this adapter cares about (e.g. a Drata system-info webhook)
 * so the caller can respond 200/skipped rather than erroring.
 */
export interface ComplianceEventAdapter {
  /** Stable identifier used in the webhook URL: `/api/autopilot/compliance/:id`. */
  readonly id: string;
  /** Human label for logs. */
  readonly name: string;
  /** Parse the payload; return `null` to silently skip. */
  translate(input: ComplianceAdapterInput): ComplianceEvent | null;
  /**
   * Optional HMAC signature verifier. Present adapters validate the
   * inbound request against a shared secret using the platform's own
   * signature convention (header name + encoding).
   *
   * Return `true` on a valid signature, `false` on mismatch or missing
   * header. The caller only invokes this when the secret env var for
   * this adapter is set — when unset, signature verification is
   * skipped entirely, preserving backwards compatibility with the
   * original shared-secret-header guard.
   */
  verifySignature?(input: SignatureVerifyInput): boolean;
}

/**
 * Build the env var name that holds an adapter's signing secret.
 * Convention: `EMBEDIQ_COMPLIANCE_SECRET_<ADAPTER_ID_UPPERCASED>`.
 * Custom adapters plugging into the registry follow the same rule.
 */
export function signingSecretEnvVar(adapterId: string): string {
  return `EMBEDIQ_COMPLIANCE_SECRET_${adapterId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

export class ComplianceAdapterError extends Error {
  constructor(message: string, readonly adapterId?: string) {
    super(message);
    this.name = 'ComplianceAdapterError';
  }
}

// ─── Small runtime registry ──────────────────────────────────────────────
//
// A separate concern from the adapter classes so callers can compose a
// registry per web server instance (or inject one in tests) without
// mutating a module-level singleton.

export class ComplianceAdapterRegistry {
  private adapters = new Map<string, ComplianceEventAdapter>();

  register(adapter: ComplianceEventAdapter): void {
    if (this.adapters.has(adapter.id)) {
      // Keep the first registration — matches the DomainPack/skill policy.
      // eslint-disable-next-line no-console
      console.warn(`Compliance adapter "${adapter.id}" already registered. Keeping first.`);
      return;
    }
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): ComplianceEventAdapter | undefined {
    return this.adapters.get(id);
  }

  list(): ComplianceEventAdapter[] {
    return Array.from(this.adapters.values()).sort((a, b) => a.id.localeCompare(b.id));
  }
}
