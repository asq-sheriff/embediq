<!-- audience: public -->

# Writing a compliance adapter

EmbedIQ ships inbound webhook adapters for Drata, Vanta, and a
canonical generic format. If your organization uses a compliance
platform without a dedicated adapter — Secureframe, AWS Audit Manager,
ServiceNow GRC, Hyperproof, Tugboat Logic, or an internal in-house
platform — write a `ComplianceEventAdapter` that translates its
outbound webhook payload into EmbedIQ's canonical `ComplianceEvent`
shape and register it with the adapter registry.

For the user-facing side (routing, shared secrets, framework matching),
see [user-guide/11-compliance-webhooks.md](../user-guide/11-compliance-webhooks.md).

## The interface

```ts
// src/integrations/compliance/compliance-adapter.ts
export interface ComplianceEventAdapter {
  readonly id: string;     // URL path suffix: /api/autopilot/compliance/:id
  readonly name: string;   // human label
  translate(input: ComplianceAdapterInput): ComplianceEvent | null;
}

export interface ComplianceAdapterInput {
  body: unknown;                      // parsed JSON; always `unknown` — narrow inside translate()
  headers: Record<string, string>;    // lowercased header names
}

export interface ComplianceEvent {
  source: string;                     // your adapter's id
  framework: string;                  // normalized EmbedIQ id (hipaa / soc2 / pci / …)
  action: 'gap_opened' | 'gap_resolved' | 'other';
  controlId?: string;
  findingId?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  title?: string;
  rawPayload: unknown;                // pass through for audit
}
```

Return `null` from `translate()` when the payload is well-formed but
not one your adapter cares about — the route responds `200 skipped`
so the calling platform doesn't retry.

## Example — Secureframe

Secureframe's outbound webhooks use an `event` string and a `data`
object analogous to Drata's. A minimum adapter:

```ts
// src/integrations/compliance/secureframe-adapter.ts
import type {
  ComplianceAdapterInput,
  ComplianceEvent,
  ComplianceEventAdapter,
} from './compliance-adapter.js';

export const secureframeAdapter: ComplianceEventAdapter = {
  id: 'secureframe',
  name: 'Secureframe',

  translate({ body }): ComplianceEvent | null {
    if (!isObject(body)) return null;

    const type = typeof body.type === 'string' ? body.type.toLowerCase() : undefined;
    if (!type) return null;

    const action = mapType(type);
    if (!action) return null;

    const data = isObject(body.data) ? body.data : {};
    const test = isObject(data.test) ? data.test : {};
    const frameworks = extractFrameworks(test);
    if (frameworks.length === 0) return null;

    return {
      source: 'secureframe',
      framework: frameworks[0],
      action,
      controlId: typeof test.id === 'string' ? test.id : undefined,
      severity: mapSeverity(data.severity),
      title: typeof test.name === 'string' ? test.name : type,
      rawPayload: body,
    };
  },
};

function mapType(type: string): ComplianceEvent['action'] | null {
  if (type === 'test.failed' || type === 'observation.created') return 'gap_opened';
  if (type === 'test.passed' || type === 'observation.resolved') return 'gap_resolved';
  return null;
}

function extractFrameworks(test: Record<string, unknown>): string[] {
  const raw = Array.isArray(test.frameworks) ? test.frameworks : [];
  const out: string[] = [];
  for (const item of raw) {
    const slug = typeof item === 'string'
      ? item
      : isObject(item) && typeof item.slug === 'string' ? item.slug : undefined;
    if (!slug) continue;
    const normalized = normalize(slug);
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out;
}

function normalize(slug: string): string | undefined {
  const k = slug.toLowerCase().replace(/[-_\s]+/g, '');
  switch (k) {
    case 'pcidss':
    case 'pci':      return 'pci';
    case 'soc2':     return 'soc2';
    case 'hipaa':    return 'hipaa';
    case 'iso27001': return 'iso27001';
    default:         return slug.toLowerCase();
  }
}

function mapSeverity(value: unknown): ComplianceEvent['severity'] | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high' || v === 'critical') return v;
  return undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
```

## Registering

### Option A — Fork + add to the default registry

Edit [`src/integrations/compliance/index.ts`](../../src/integrations/compliance/index.ts):

```ts
import { secureframeAdapter } from './secureframe-adapter.js';

export const defaultComplianceRegistry = new ComplianceAdapterRegistry();
defaultComplianceRegistry.register(drataAdapter);
defaultComplianceRegistry.register(vantaAdapter);
defaultComplianceRegistry.register(secureframeAdapter);   // ← added
defaultComplianceRegistry.register(genericComplianceAdapter);
```

Webhook URL becomes
`POST /api/autopilot/compliance/secureframe`.

### Option B — Inject a custom registry at app boot

If you can't fork, wrap `createApp()` and inject a custom registry:

```ts
import { ComplianceAdapterRegistry, drataAdapter, vantaAdapter,
         genericComplianceAdapter } from 'embediq/integrations/compliance';
import { secureframeAdapter } from './secureframe-adapter.js';
import { createApp } from 'embediq/web';

const registry = new ComplianceAdapterRegistry();
registry.register(drataAdapter);
registry.register(vantaAdapter);
registry.register(genericComplianceAdapter);
registry.register(secureframeAdapter);

const app = createApp({
  autopilotStore: /* … */,
  complianceRegistry: registry,
});
```

The `complianceRegistry` option is exposed specifically so you don't
need to modify EmbedIQ source for new adapters.

## Framework normalization

This is the most important piece to get right. EmbedIQ matches the
event's `framework` field against each schedule's
`complianceFrameworks` list (from the schedule metadata). If your
platform uses identifiers that don't match EmbedIQ's native ones
(`hipaa`, `soc2`, `pci`, `ferpa`, `sox`, `hitech`, `gdpr`,
`iso27001`, …), the event silently goes to `skipped` with "No
schedules configured for framework …".

Recommended normalization:

- Lowercase.
- Strip separators (`soc_2` → `soc2`, `pci-dss` → `pcidss` →
  special-cased to `pci`).
- Map known aliases to EmbedIQ's canonical key.
- Unknown identifiers pass through lowercased — schedule authors can
  then use the same identifier verbatim in `complianceFrameworks`.

The built-in Drata and Vanta adapters have the full mapping table —
copy their `normalize*` helpers as a starting point.

## Error handling

- **Malformed payload**: return `null`. Don't throw. The route
  responds `200 skipped`.
- **Genuinely broken adapter**: throw. The route catches and responds
  `400` with `{ error: "Adapter '<id>' failed to parse payload", detail: … }`.
- **Never** reach outside the process from `translate()` — no HTTP
  calls, no filesystem reads. The adapter is pure parsing.

## Security considerations

- The adapter itself doesn't authenticate the request — the route
  enforces `EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET` via the
  `X-EmbedIQ-Autopilot-Secret` header before `translate()` runs.
- If your platform signs webhook bodies (Drata HMAC, Vanta HMAC, AWS
  SNS signatures), **verify the signature inside `translate()`**
  against a header in `input.headers`. Return `null` on mismatch — or
  throw if you want the 400 response instead of a silent skip.
- Platform-supplied framework identifiers can be attacker-controlled
  if the signature check is weak. Normalize to a strict allowlist
  when paranoid.

## Testing

```ts
import { describe, it, expect } from 'vitest';
import { secureframeAdapter } from '../src/integrations/compliance/secureframe-adapter.js';

describe('secureframeAdapter', () => {
  it('maps test.failed to gap_opened', () => {
    const event = secureframeAdapter.translate({
      body: {
        type: 'test.failed',
        data: {
          test: { id: 'TS-42', name: 'MFA on prod', frameworks: ['soc2'] },
          severity: 'high',
        },
      },
      headers: {},
    });
    expect(event?.source).toBe('secureframe');
    expect(event?.framework).toBe('soc2');
    expect(event?.action).toBe('gap_opened');
  });

  it('returns null for non-compliance events', () => {
    expect(secureframeAdapter.translate({
      body: { type: 'user.invited', data: {} },
      headers: {},
    })).toBeNull();
  });
});
```

## See also

- [Compliance webhooks user guide](../user-guide/11-compliance-webhooks.md) —
  the route, schedule matching, secret guard
- [Autopilot](../user-guide/08-autopilot.md) — what gets triggered
  when an adapter fires
- [Source: built-in adapters](../../src/integrations/compliance/) —
  Drata + Vanta + generic as reference
- [Source: registry](../../src/integrations/compliance/compliance-adapter.ts) —
  `ComplianceAdapterRegistry` + interfaces
