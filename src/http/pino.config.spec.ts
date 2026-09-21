import type { IncomingMessage, ServerResponse } from 'node:http';
import { Writable } from 'node:stream';

import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { createPinoHttpOptions, requestId } from './pino.config.js';

describe('Pino HTTP configuration', () => {
	const options = createPinoHttpOptions('info', false);

	it('creates and preserves bounded request IDs', () => {
		expect(
			requestId({ headers: {} } as unknown as IncomingMessage),
		).toMatch(/^[0-9a-f-]{36}$/);
		expect(
			requestId({
				headers: { 'x-request-id': 'request-test-01' },
			} as unknown as IncomingMessage),
		).toBe('request-test-01');
		expect(
			requestId({
				headers: { 'x-request-id': 'not valid' },
			} as unknown as IncomingMessage),
		).not.toBe('not valid');
	});

	it('emits structured success fields from pino-http values', () => {
		const fields = options.customSuccessObject?.(
			{
				id: 'request-id',
				method: 'GET',
				route: { path: '/resources/:id' },
			} as never,
			{ statusCode: 200 } as unknown as ServerResponse,
			{ responseTime: 12.5 },
		);

		expect(fields).toMatchObject({
			'request.id': 'request-id',
			'http.request.method': 'GET',
			'http.route': '/resources/:id',
			'http.response.status_code': 200,
			duration_ms: 12.5,
		});
		expect(fields).not.toHaveProperty('body');
	});

	it('suppresses successful health logs and redacts sensitive fields', () => {
		expect(
			options.customLogLevel?.(
				{ url: '/health/live' } as IncomingMessage,
				{ statusCode: 200 } as ServerResponse,
			),
		).toBe('silent');
		expect(
			options.customLogLevel?.(
				{ url: '/health/ready' } as IncomingMessage,
				{ statusCode: 200 } as ServerResponse,
			),
		).toBe('silent');

		const output: string[] = [];
		const stream = new Writable({
			write(chunk, _encoding, callback) {
				output.push(String(chunk));
				callback();
			},
		});
		const logger = pino({ redact: options.redact }, stream);
		logger.info({
			password: 'password-test',
			req: {
				headers: {
					authorization: 'Bearer TEST_SECRET',
					cookie: 'session=TEST_SECRET',
				},
			},
		});

		const serialized = output.join('');
		expect(serialized).not.toContain('password-test');
		expect(serialized).not.toContain('TEST_SECRET');
	});
});
