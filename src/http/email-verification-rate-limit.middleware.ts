import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { Redis } from 'ioredis';

const LIMIT = 3;
const WINDOW_SECONDS = 60;
const incrementRateLimitScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;

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
		const count = Number(
			await this.redis.eval(
				incrementRateLimitScript,
				1,
				key,
				WINDOW_SECONDS.toString(),
			),
		);

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
