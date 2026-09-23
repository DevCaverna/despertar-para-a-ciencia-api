import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { Redis } from 'ioredis';

const LIMIT = 3;
const WINDOW_SECONDS = 60;

@Injectable()
export class EmailVerificationRateLimitMiddleware implements NestMiddleware {
	constructor(@InjectRedis() private readonly redis: Redis) {}

	async use(
		request: Request,
		response: Response,
		next: NextFunction,
	): Promise<void> {
		const clientIp =
			request.ip ?? request.socket.remoteAddress ?? 'unknown';
		const key = `rate-limit:email-verification:${clientIp}`;
		const count = await this.redis.incr(key);
		if (count === 1) await this.redis.expire(key, WINDOW_SECONDS);

		if (count > LIMIT) {
			const ttl = await this.redis.ttl(key);
			response.setHeader('Retry-After', Math.max(1, ttl));
			response
				.status(429)
				.json({ statusCode: 429, message: 'Too Many Requests' });
			return;
		}

		next();
	}
}
