import type { Tracer } from '@opentelemetry/api';
import { describe, expect, it, vi } from 'vitest';

import { errorType, measureDependency } from './telemetry.js';

type SpanStub = {
	setAttributes: ReturnType<typeof vi.fn>;
	setAttribute: ReturnType<typeof vi.fn>;
	recordException: ReturnType<typeof vi.fn>;
	setStatus: ReturnType<typeof vi.fn>;
	end: ReturnType<typeof vi.fn>;
};

function tracerFor(span: {
	setAttributes: ReturnType<typeof vi.fn>;
	setAttribute: ReturnType<typeof vi.fn>;
	recordException: ReturnType<typeof vi.fn>;
	setStatus: ReturnType<typeof vi.fn>;
	end: ReturnType<typeof vi.fn>;
}): Tracer {
	return {
		startActiveSpan: vi.fn(
			async (
				_name: string,
				_options: unknown,
				work: (span: SpanStub) => Promise<unknown>,
			) => work(span),
		),
	} as unknown as Tracer;
}

describe('application telemetry', () => {
	it('preserves successful dependency results', async () => {
		const span = {
			setAttributes: vi.fn(),
			setAttribute: vi.fn(),
			recordException: vi.fn(),
			setStatus: vi.fn(),
			end: vi.fn(),
		};

		await expect(
			measureDependency({
				dependency: 'brevo',
				operation: 'send_email',
				tracer: tracerFor(span),
				work: () => Promise.resolve('accepted'),
			}),
		).resolves.toBe('accepted');
		expect(span.setAttribute).toHaveBeenCalledWith('result', 'success');
		expect(span.end).toHaveBeenCalledOnce();
	});

	it('rethrows failures after classifying the error', async () => {
		const span = {
			setAttributes: vi.fn(),
			setAttribute: vi.fn(),
			recordException: vi.fn(),
			setStatus: vi.fn(),
			end: vi.fn(),
		};
		const failure = new Error('provider unavailable');

		await expect(
			measureDependency({
				dependency: 'firebase',
				operation: 'get_user',
				tracer: tracerFor(span),
				work: () => Promise.reject(failure),
			}),
		).rejects.toBe(failure);
		expect(span.setAttributes).toHaveBeenCalledWith({
			result: 'error',
			'error.type': 'Error',
		});
		expect(span.end).toHaveBeenCalledOnce();
	});

	it('normalizes unknown errors', () => {
		expect(errorType(new Error('hidden'))).toBe('Error');
		expect(errorType('failure')).toBe('UnknownError');
	});
});
