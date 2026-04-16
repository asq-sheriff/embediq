import { trace, metrics, type Tracer, type Meter, type Span, SpanStatusCode } from '@opentelemetry/api';

const TRACER_NAME = 'embediq';
const METER_NAME = 'embediq';

let initialized = false;

/**
 * Initialize OpenTelemetry SDK when EMBEDIQ_OTEL_ENABLED=true.
 * Must be called before any tracing/metrics calls (typically at server startup).
 * When disabled, @opentelemetry/api returns noop implementations — zero overhead.
 */
export async function initTelemetry(): Promise<void> {
  if (initialized) return;
  if (process.env.EMBEDIQ_OTEL_ENABLED !== 'true') return;

  try {
    // Dynamic import — SDK packages are optional dependencies.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdkNode = await import('@opentelemetry/sdk-node') as any;
    const traceExporterMod = await import('@opentelemetry/exporter-trace-otlp-http') as any;
    const metricExporterMod = await import('@opentelemetry/exporter-metrics-otlp-http') as any;
    const sdkMetrics = await import('@opentelemetry/sdk-metrics') as any;
    const resourcesMod = await import('@opentelemetry/resources') as any;
    const semconv = await import('@opentelemetry/semantic-conventions') as any;

    const NodeSDK = sdkNode.NodeSDK;
    const OTLPTraceExporter = traceExporterMod.OTLPTraceExporter;
    const OTLPMetricExporter = metricExporterMod.OTLPMetricExporter;
    const PeriodicExportingMetricReader = sdkMetrics.PeriodicExportingMetricReader;
    const Resource = resourcesMod.Resource;
    const ATTR_SERVICE_NAME = semconv.ATTR_SERVICE_NAME;
    const ATTR_SERVICE_VERSION = semconv.ATTR_SERVICE_VERSION;

    const resource = new Resource({
      [ATTR_SERVICE_NAME]: 'embediq',
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '2.1.0',
    });

    const traceExporter = new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
        || process.env.OTEL_EXPORTER_OTLP_ENDPOINT
        || 'http://localhost:4318/v1/traces',
    });

    const metricExporter = new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
        || process.env.OTEL_EXPORTER_OTLP_ENDPOINT
        || 'http://localhost:4318/v1/metrics',
    });

    const metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 30_000,
    });

    const sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader,
    });

    sdk.start();
    initialized = true;
    console.log('  OpenTelemetry initialized (exporting to OTLP)');

    // Graceful shutdown
    process.on('SIGTERM', () => sdk.shutdown());
    process.on('SIGINT', () => sdk.shutdown());
  } catch (err) {
    // SDK packages not installed — degrade gracefully
    console.warn('  OpenTelemetry SDK not available (install optional deps to enable)');
  }
}

/**
 * Get the EmbedIQ tracer. Returns a noop tracer when OTel is not initialized.
 */
export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}

/**
 * Get the EmbedIQ meter. Returns a noop meter when OTel is not initialized.
 */
export function getMeter(): Meter {
  return metrics.getMeter(METER_NAME);
}

/**
 * Run an async function within a named span, automatically recording errors
 * and setting span status. Returns the function's result.
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean> | undefined,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, async (span) => {
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value);
      }
    }
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
}
