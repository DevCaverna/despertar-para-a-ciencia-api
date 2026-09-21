import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { PublicDatabaseRateLimitMiddleware } from './public-database-rate-limit.middleware.js';

describe('PublicDatabaseRateLimitMiddleware', () => {
	it('rejects the 31st database-backed public request from one IP', () => {
		const middleware = new PublicDatabaseRateLimitMiddleware();
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

		for (let attempt = 0; attempt < 30; attempt++) {
			middleware.use(request, response, next);
		}

		middleware.use(request, response, next);

		expect(next).toHaveBeenCalledTimes(30);
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
