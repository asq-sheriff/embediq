import { describe, it, expect } from 'vitest';
import {
  drataAdapter,
  vantaAdapter,
  genericComplianceAdapter,
  ComplianceAdapterRegistry,
} from '../../src/integrations/compliance/index.js';

describe('DrataAdapter', () => {
  it('maps monitor.failed to gap_opened and extracts the framework', () => {
    const event = drataAdapter.translate({
      body: {
        event: 'monitor.failed',
        data: {
          control: {
            id: 'CTRL-123',
            name: 'Access controls monitor',
            frameworks: ['hipaa', 'soc_2'],
          },
          severity: 'high',
        },
      },
      headers: {},
    });
    expect(event).not.toBeNull();
    expect(event!.source).toBe('drata');
    expect(event!.framework).toBe('hipaa');
    expect(event!.action).toBe('gap_opened');
    expect(event!.controlId).toBe('CTRL-123');
    expect(event!.severity).toBe('high');
    expect(event!.title).toBe('Access controls monitor');
  });

  it('maps monitor.recovered to gap_resolved', () => {
    const event = drataAdapter.translate({
      body: {
        event: 'monitor.recovered',
        data: { control: { frameworks: ['pci_dss'] } },
      },
      headers: {},
    });
    expect(event).not.toBeNull();
    expect(event!.action).toBe('gap_resolved');
    expect(event!.framework).toBe('pci');
  });

  it('normalizes framework object entries with key/id fields', () => {
    const event = drataAdapter.translate({
      body: {
        event: 'finding.opened',
        data: { finding: { frameworks: [{ key: 'iso_27001' }] } },
      },
      headers: {},
    });
    expect(event?.framework).toBe('iso27001');
  });

  it('returns null for unrecognized event types', () => {
    expect(drataAdapter.translate({
      body: { event: 'account.updated', data: {} },
      headers: {},
    })).toBeNull();
  });

  it('returns null when no frameworks are present', () => {
    expect(drataAdapter.translate({
      body: { event: 'monitor.failed', data: { control: {} } },
      headers: {},
    })).toBeNull();
  });

  it('returns null when body is not an object', () => {
    expect(drataAdapter.translate({ body: 'nope', headers: {} })).toBeNull();
    expect(drataAdapter.translate({ body: null, headers: {} })).toBeNull();
    expect(drataAdapter.translate({ body: undefined, headers: {} })).toBeNull();
  });
});

describe('VantaAdapter', () => {
  it('maps test.failing to gap_opened', () => {
    const event = vantaAdapter.translate({
      body: {
        type: 'test.failing',
        data: {
          test: {
            id: 'test-42',
            name: 'MFA enforced',
            frameworks: [{ slug: 'soc2' }],
          },
        },
      },
      headers: {},
    });
    expect(event?.source).toBe('vanta');
    expect(event?.action).toBe('gap_opened');
    expect(event?.framework).toBe('soc2');
    expect(event?.controlId).toBe('test-42');
  });

  it('normalizes pci-dss slug to pci', () => {
    const event = vantaAdapter.translate({
      body: {
        type: 'test.passing',
        data: { test: { frameworks: [{ slug: 'pci-dss' }] } },
      },
      headers: {},
    });
    expect(event?.framework).toBe('pci');
    expect(event?.action).toBe('gap_resolved');
  });

  it('maps observation.updated by inspecting the status', () => {
    const opened = vantaAdapter.translate({
      body: {
        type: 'observation.updated',
        data: {
          observation: { status: 'open', frameworks: ['hipaa'] },
        },
      },
      headers: {},
    });
    expect(opened?.action).toBe('gap_opened');

    const resolved = vantaAdapter.translate({
      body: {
        type: 'observation.updated',
        data: {
          observation: { status: 'resolved', frameworks: ['hipaa'] },
        },
      },
      headers: {},
    });
    expect(resolved?.action).toBe('gap_resolved');
  });

  it('returns null when event type is unknown', () => {
    expect(vantaAdapter.translate({
      body: { type: 'user.created', data: {} },
      headers: {},
    })).toBeNull();
  });
});

describe('GenericComplianceAdapter', () => {
  it('accepts the canonical EmbedIQ payload', () => {
    const event = genericComplianceAdapter.translate({
      body: {
        framework: 'hipaa',
        action: 'gap_opened',
        controlId: 'internal-42',
        severity: 'critical',
      },
      headers: {},
    });
    expect(event?.source).toBe('generic');
    expect(event?.framework).toBe('hipaa');
    expect(event?.action).toBe('gap_opened');
    expect(event?.severity).toBe('critical');
  });

  it('accepts snake_case field aliases', () => {
    const event = genericComplianceAdapter.translate({
      body: {
        compliance_framework: 'SOC2',
        action: 'gap_resolved',
        control_id: 'external-99',
        finding_id: 'finding-1',
      },
      headers: {},
    });
    expect(event?.framework).toBe('soc2');
    expect(event?.controlId).toBe('external-99');
    expect(event?.findingId).toBe('finding-1');
    expect(event?.action).toBe('gap_resolved');
  });

  it('defaults action to "other" for unknown values', () => {
    const event = genericComplianceAdapter.translate({
      body: { framework: 'pci', action: 'exotic_custom_action' },
      headers: {},
    });
    expect(event?.action).toBe('other');
  });

  it('returns null when framework is missing', () => {
    expect(genericComplianceAdapter.translate({
      body: { action: 'gap_opened' },
      headers: {},
    })).toBeNull();
  });
});

describe('ComplianceAdapterRegistry', () => {
  it('registers and retrieves adapters by id', () => {
    const registry = new ComplianceAdapterRegistry();
    registry.register(drataAdapter);
    registry.register(vantaAdapter);
    expect(registry.get('drata')?.id).toBe('drata');
    expect(registry.get('vanta')?.id).toBe('vanta');
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('list() returns adapters sorted by id', () => {
    const registry = new ComplianceAdapterRegistry();
    registry.register(vantaAdapter);
    registry.register(drataAdapter);
    registry.register(genericComplianceAdapter);
    expect(registry.list().map((a) => a.id)).toEqual(['drata', 'generic', 'vanta']);
  });

  it('preserves the first registration on duplicate id', () => {
    const registry = new ComplianceAdapterRegistry();
    registry.register(drataAdapter);
    const orig = console.warn;
    console.warn = () => {};
    try {
      registry.register({
        id: 'drata',
        name: 'Fake',
        translate: () => null,
      });
    } finally {
      console.warn = orig;
    }
    expect(registry.get('drata')?.name).toBe('Drata');
  });
});
