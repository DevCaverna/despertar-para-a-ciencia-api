import {
	metrics,
	SpanKind,
	SpanStatusCode,
	trace,
	type Tracer,
} from '@opentelemetry/api';

const dependencyDuration = metrics
	.getMeter('despertar-para-a-ciencia-api.application')
	.createHistogram('application.dependency.operation.duration', {
		unit: 'ms',
		description: 'Duration of an application dependency operation.',
	});

export function errorType(error: unknown): string {
	return error instanceof Error ? error.constructor.name : 'UnknownError';
}

export async function measureDependency<T>({
	dependency,
	operation,
	work,
	tracer = trace.getTracer('despertar-para-a-ciencia-api.application'),
}: {
	dependency: 'firebase' | 'brevo' | 'r2';
	operation: string;
	work: () => Promise<T>;
	tracer?: Tracer;
}): Promise<T> {
	const startedAt = performance.now();

	return tracer.startActiveSpan(
		`${dependency}.${operation}`,
		{ kind: SpanKind.CLIENT },
		async (span) => {
			span.setAttributes({ dependency, operation });
			try {
				const result = await work();
				span.setAttribute('result', 'success');
				dependencyDuration.record(performance.now() - startedAt, {
					dependency,
					operation,
					result: 'success',
				});
				return result;
			} catch (error) {
				span.setAttributes({
					result: 'error',
					'error.type': errorType(error),
				});
				span.setStatus({ code: SpanStatusCode.ERROR });
				dependencyDuration.record(performance.now() - startedAt, {
					dependency,
					operation,
					result: 'error',
				});
				throw error;
			} finally {
				span.end();
			}
		},
	);
}
