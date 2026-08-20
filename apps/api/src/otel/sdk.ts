import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { config } from '@/config.js';

let sdk: NodeSDK | null = null;

/**
 * Reports through the app logger without importing it at module scope.
 *
 * The auto instrumentations patch modules as they are first loaded, so anything
 * this file pulls in eagerly is a module they cannot reach — pino included.
 * Deferring the import until after `start()` keeps log correlation working.
 */
function reportTelemetryEvent(level: 'info' | 'warn', fields: Record<string, unknown>): void {
	void import('@/utils/index.js')
		.then(({ logEvent, logger }) => {
			logEvent(logger, level, 'dep.probe', { dependency: 'otel', ...fields });
		})
		.catch(() => {
			/* Telemetry reporting its own status must never be what takes the process down. */
		});
}

/**
 * Starts the OpenTelemetry SDK, or does nothing when telemetry is switched off.
 *
 * Off is the default. Traces are worth nothing without somewhere to send them,
 * and a service that retries failed exports at boot is slower to start for no
 * benefit — so `OTEL_ENABLED` has to be set deliberately and the whole subsystem
 * stays inert otherwise.
 *
 * Ordering is the reason this lives in its own module: it must run before the
 * modules it instruments are loaded, which is what `otel/bootstrap.js` being the
 * first import of `index.ts` arranges.
 */
export function startTelemetry(): void {
	if (!config.otel.enabled || sdk) return;

	sdk = new NodeSDK({
		resource: resourceFromAttributes({
			[ATTR_SERVICE_NAME]: config.otel.serviceName,
			[ATTR_SERVICE_VERSION]: config.otel.serviceVersion
		}),
		traceExporter: new OTLPTraceExporter({ url: `${config.otel.endpoint}/v1/traces` }),
		metricReader: new PeriodicExportingMetricReader({
			exporter: new OTLPMetricExporter({ url: `${config.otel.endpoint}/v1/metrics` }),
			exportIntervalMillis: config.otel.metricExportIntervalMs
		}),
		logRecordProcessors: [
			new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${config.otel.endpoint}/v1/logs` }) })
		],
		instrumentations: [
			getNodeAutoInstrumentations({
				'@opentelemetry/instrumentation-pino': { disableLogSending: true }
			})
		]
	});

	sdk.start();

	reportTelemetryEvent('info', { endpoint: config.otel.endpoint, service: config.otel.serviceName });
}

/**
 * Flushes pending spans, metrics and logs on the way down.
 *
 * A failed flush is logged and swallowed: an unreachable collector must not hold
 * the container open or turn a clean shutdown into a non-zero exit.
 */
export async function shutdownTelemetry(): Promise<void> {
	if (!sdk) return;

	try {
		await sdk.shutdown();
	} catch (error) {
		reportTelemetryEvent('warn', { error: error instanceof Error ? error.message : String(error) });
	} finally {
		sdk = null;
	}
}
