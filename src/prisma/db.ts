// oxlint-disable-next-line import/no-unassigned-import
import 'dotenv/config';
import {
	metrics,
	SpanKind,
	SpanStatusCode,
	trace,
	type Span,
	type Tracer,
} from '@opentelemetry/api';
import postgres from '@prisma/orm-postgres/runtime';
import type {
	PostgresClient,
	PostgresOptionsWithContractJson,
} from '@prisma/orm-postgres/runtime';
import { Pool } from 'pg';

import type { Contract } from './contract.d.ts';
import contractJson from './contract.json' with { type: 'json' };

export type PrismaDatabase = PostgresClient<Contract>;
export type PrismaTransaction = Parameters<
	Parameters<PrismaDatabase['transaction']>[0]
>[0];

type PrismaMiddleware = NonNullable<
	PostgresOptionsWithContractJson<Contract>['middleware']
>[number];

const databaseDuration = metrics
	.getMeter('despertar-para-a-ciencia-api.prisma')
	.createHistogram('database.client.operation.duration', {
		unit: 'ms',
		description: 'Duration of a Prisma database operation.',
	});

export function createPrismaTelemetryMiddleware(
	tracer: Tracer = trace.getTracer('despertar-para-a-ciencia-api.prisma'),
): PrismaMiddleware {
	const spans = new Map<string, Span>();

	const start = (
		kind: 'query' | 'execute',
		operationId: string,
		scope: string,
	): void => {
		const span = tracer.startSpan(`prisma.${kind}`, {
			kind: SpanKind.CLIENT,
		});
		span.setAttributes({
			'db.system.name': 'postgresql',
			'prisma.operation': kind,
			'prisma.scope': scope,
		});
		spans.set(operationId, span);
	};

	const finish = (
		kind: 'query' | 'execute',
		operationId: string,
		completed: boolean,
		latencyMs: number,
	): void => {
		const span = spans.get(operationId);
		if (!span) {
			return;
		}
		span.setAttribute('prisma.completed', completed);
		span.setAttribute('prisma.latency_ms', latencyMs);
		databaseDuration.record(latencyMs, {
			operation: kind,
			result: completed ? 'success' : 'error',
		});
		if (!completed) {
			span.setStatus({ code: SpanStatusCode.ERROR });
		}
		span.end();
		spans.delete(operationId);
	};

	return {
		name: 'opentelemetry',
		interceptQuery(_plan, ctx) {
			start('query', ctx.planExecutionId, ctx.scope);
			return Promise.resolve(undefined);
		},
		afterQuery(_plan, result, ctx) {
			finish(
				'query',
				ctx.planExecutionId,
				result.completed,
				result.latencyMs,
			);
			return Promise.resolve();
		},
		interceptExecute(_plan, ctx) {
			start('execute', ctx.planExecutionId, ctx.scope);
			return Promise.resolve(undefined);
		},
		afterExecute(_plan, result, ctx) {
			finish(
				'execute',
				ctx.planExecutionId,
				result.completed,
				result.latencyMs,
			);
			return Promise.resolve();
		},
	};
}

export function createPrismaDatabase(pg: Pool): PrismaDatabase {
	return postgres<Contract>({
		contractJson,
		pg,
		middleware: [createPrismaTelemetryMiddleware()],
	});
}

export interface PrismaPoolOptions {
	connectionTimeoutMillis?: number;
	max?: number;
}

export function createPrismaPool(
	connectionString: string,
	options: PrismaPoolOptions = {},
): Pool {
	return new Pool({
		connectionString,
		...options,
	});
}
