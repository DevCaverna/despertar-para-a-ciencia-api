import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import dotenv from 'dotenv';

dotenv.config();

const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const otelServiceName = process.env.OTEL_SERVICE_NAME;
let sdk: NodeSDK | undefined;

if (otelEndpoint) {
	if (!otelServiceName) {
		throw new Error(
			'OTEL_SERVICE_NAME is required when telemetry export is enabled.',
		);
	}

	sdk = new NodeSDK({
		serviceName: otelServiceName,
		traceExporter: new OTLPTraceExporter({
			url: otelEndpoint,
		}),
		metricReader: new PeriodicExportingMetricReader({
			exporter: new OTLPMetricExporter({
				url: otelEndpoint,
			}),
		}),
		logRecordProcessors: [
			new BatchLogRecordProcessor({
				exporter: new OTLPLogExporter({
					url: otelEndpoint,
				}),
			}),
		],
		instrumentations: [
			getNodeAutoInstrumentations({
				'@opentelemetry/instrumentation-fs': {
					enabled: false,
				},
				'@opentelemetry/instrumentation-http': {
					ignoreIncomingRequestHook: (request) =>
						request.url?.split('?')[0] === '/health/live',
				},
				'@opentelemetry/instrumentation-pg': {
					enabled: false,
				},
				'@opentelemetry/instrumentation-pino': {
					disableLogSending: false,
					disableLogCorrelation: false,
				},
			}),
		],
	});

	sdk.start();

	console.log(JSON.stringify({ event: 'telemetry_started', enabled: true }));
} else {
	console.log(
		JSON.stringify({
			event: 'telemetry_disabled',
			reason: 'endpoint_not_configured',
		}),
	);
}

export async function shutdownTelemetry(): Promise<void> {
	if (!sdk) {
		return;
	}

	await sdk.shutdown();
}
