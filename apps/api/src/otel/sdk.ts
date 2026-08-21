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

function reportTelemetryEvent(level: 'info' | 'warn', fields: Record<string, unknown>): void {
	void import('@/utils/index.js')
		.then(({ logEvent, logger }) => {
			logEvent(logger, level, 'dep.probe', { dependency: 'otel', ...fields });
		})
		.catch(() => {
		});
}

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
