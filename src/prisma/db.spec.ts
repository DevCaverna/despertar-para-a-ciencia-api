import { SpanKind } from '@opentelemetry/api';
import { describe, expect, it, vi } from 'vitest';

import { createPrismaPool, createPrismaTelemetryMiddleware } from './db.js';

describe('Prisma telemetry middleware', () => {
	it('creates bounded spans without recording SQL or parameters', async () => {
		const span = {
			end: vi.fn(),
			setAttribute: vi.fn(),
			setAttributes: vi.fn(),
			setStatus: vi.fn(),
		};
		const startSpan = vi.fn(() => span);
		const tracer = {
			startSpan,
		} as never;
		const middleware = createPrismaTelemetryMiddleware(tracer);
		const context = {
			planExecutionId: 'query-id',
			scope: 'transaction',
		} as never;

		expect('beforeQuery' in middleware).toBe(false);
		expect(
			await middleware.interceptQuery?.(undefined as never, context),
		).toBeUndefined();
		await middleware.afterQuery?.(
			undefined as never,
			{ completed: true, latencyMs: 12, rowCount: 1, source: 'driver' },
			context,
		);

		expect(startSpan).toHaveBeenCalledWith('prisma.query', {
			kind: SpanKind.CLIENT,
		});
		expect(span.setAttributes).toHaveBeenCalledWith({
			'db.system.name': 'postgresql',
			'prisma.operation': 'query',
			'prisma.scope': 'transaction',
		});
		expect(span.end).toHaveBeenCalledOnce();
		expect(span.setAttribute).not.toHaveBeenCalledWith(
			'experimental.db.statement',
			expect.anything(),
		);
	});

	it('marks incomplete executions as errors', async () => {
		const span = {
			end: vi.fn(),
			setAttribute: vi.fn(),
			setAttributes: vi.fn(),
			setStatus: vi.fn(),
		};
		const middleware = createPrismaTelemetryMiddleware({
			startSpan: vi.fn(() => span),
		} as never);
		const context = {
			planExecutionId: 'execute-id',
			scope: 'runtime',
		} as never;

		await middleware.interceptExecute?.(undefined as never, context);
		await middleware.afterExecute?.(
			undefined as never,
			{ completed: false, latencyMs: 20, source: 'driver' },
			context,
		);

		expect(span.setStatus).toHaveBeenCalledWith({ code: 2 });
		expect(span.end).toHaveBeenCalledOnce();
	});

	it('keeps the short connection timeout limited to dedicated pools', async () => {
		const businessPool = createPrismaPool('postgresql://business');
		const healthPool = createPrismaPool('postgresql://health', {
			connectionTimeoutMillis: 1000,
			max: 2,
		});

		expect(businessPool.options.connectionTimeoutMillis).toBeUndefined();
		expect(healthPool.options.connectionTimeoutMillis).toBe(1000);
		expect(healthPool.options.max).toBe(2);

		await businessPool.end();
		await healthPool.end();
	});
});
