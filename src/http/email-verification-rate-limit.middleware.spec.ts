import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { EmailVerificationRateLimitMiddleware } from './email-verification-rate-limit.middleware.js';

describe('EmailVerificationRateLimitMiddleware', () => {
	it('rejects the fourth verification code request from one IP', async () => {
		const redis = {
			incr: vi.fn(),
			expire: vi.fn().mockResolvedValue(1),
			ttl: vi.fn().mockResolvedValue(42),
		};
		redis.incr
			.mockResolvedValueOnce(1)
			.mockResolvedValueOnce(2)
			.mockResolvedValueOnce(3)
			.mockResolvedValueOnce(4);
		const middleware = new EmailVerificationRateLimitMiddleware(
			redis as never,
		);
		const request = { ip: '203.0.113.42' } as Request;
		const json = vi.fn();
		const setHeader = vi.fn();
		const status = vi.fn().mockReturnThis();
		const response = {
			json,
			setHeader,
			status,
		} as unknown as Response;
		const next = vi.fn() as NextFunction;

		await middleware.use(request, response, next);
		await middleware.use(request, response, next);
		await middleware.use(request, response, next);

		await middleware.use(request, response, next);

		expect(next).toHaveBeenCalledTimes(3);
		expect(status).toHaveBeenCalledWith(429);
		expect(setHeader).toHaveBeenCalledWith(
			'Retry-After',
			expect.any(Number),
		);
		expect(json).toHaveBeenCalledWith({
			message: 'Too Many Requests',
			statusCode: 429,
		});
	});
});
