import { createHmac } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { EmailVerificationRateLimitMiddleware } from './email-verification-rate-limit.middleware.js';

describe('EmailVerificationRateLimitMiddleware', () => {
	function setup(): {
		middleware: EmailVerificationRateLimitMiddleware;
		redis: {
			incr: ReturnType<typeof vi.fn>;
			expire: ReturnType<typeof vi.fn>;
			ttl: ReturnType<typeof vi.fn>;
		};
		json: ReturnType<typeof vi.fn>;
		setHeader: ReturnType<typeof vi.fn>;
		status: ReturnType<typeof vi.fn>;
		response: Response;
	} {
		const counts = new Map<string, number>();
		const redis = {
			incr: vi.fn((key: string): Promise<number> => {
				const count = (counts.get(key) ?? 0) + 1;
				counts.set(key, count);
				return Promise.resolve(count);
			}),
			expire: vi.fn().mockResolvedValue(1),
			ttl: vi.fn().mockResolvedValue(42),
		};
		const config = {
			getOrThrow: vi.fn(
				() => 'a-secure-test-secret-with-at-least-32-chars',
			),
		};
		const middleware = new EmailVerificationRateLimitMiddleware(
			redis as never,
			config as never,
		);
		const json = vi.fn();
		const setHeader = vi.fn();
		const status = vi.fn().mockReturnThis();
		const response = {
			json,
			setHeader,
			status,
		} as unknown as Response;
		return { middleware, redis, json, setHeader, status, response };
	}

	const request = (ip: string, email: string): Request =>
		({ ip, body: { email } }) as Request;

	it('limits requests by IP and normalized recipient', async () => {
		const { middleware, redis, status, setHeader, json, response } =
			setup();
		const next = vi.fn() as NextFunction;

		for (let index = 0; index < 3; index += 1) {
			// oxlint-disable-next-line no-await-in-loop -- Exercise the fixed-window limit in order.
			await middleware.use(
				request(`203.0.113.${index + 1}`, 'Ada@Example.com'),
				response,
				next,
			);
		}
		await middleware.use(
			request('203.0.113.4', 'ada@example.com'),
			response,
			next,
		);

		expect(next).toHaveBeenCalledTimes(3);
		expect(status).toHaveBeenCalledWith(429);
		expect(redis.incr).toHaveBeenCalledTimes(8);
		expect(setHeader).toHaveBeenCalledWith(
			'Retry-After',
			expect.any(Number),
		);
		expect(json).toHaveBeenCalledWith({
			message: 'Too Many Requests',
			statusCode: 429,
		});
	});

	it('limits requests by IP even when recipients differ', async () => {
		const { middleware, status, response } = setup();
		const next = vi.fn() as NextFunction;

		for (let index = 0; index < 4; index += 1) {
			// oxlint-disable-next-line no-await-in-loop -- Exercise the fixed-window limit in order.
			await middleware.use(
				request('203.0.113.42', `person${index}@example.com`),
				response,
				next,
			);
		}

		expect(next).toHaveBeenCalledTimes(3);
		expect(status).toHaveBeenCalledWith(429);
	});

	it('applies recipient limiting to email with surrounding whitespace', async () => {
		const { middleware, redis, response } = setup();
		const next = vi.fn() as NextFunction;

		await middleware.use(
			request('203.0.113.42', '  Ada@Example.com  '),
			response,
			next,
		);

		expect(redis.incr).toHaveBeenCalledTimes(2);
		const expectedDigest = createHmac(
			'sha256',
			'a-secure-test-secret-with-at-least-32-chars',
		)
			.update('ada@example.com')
			.digest('hex');
		expect(redis.incr.mock.calls[1]?.[0]).toBe(
			`rate-limit:email-verification:email:${expectedDigest}`,
		);
		expect(next).toHaveBeenCalledOnce();
	});
});
