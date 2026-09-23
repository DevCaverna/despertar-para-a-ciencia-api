import { createHmac } from 'node:crypto';

import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { Redis } from 'ioredis';

import type { AppConfig } from '../config/config.types.js';

const LIMIT = 3;
const WINDOW_SECONDS = 60;

@Injectable()
export class EmailVerificationRateLimitMiddleware implements NestMiddleware {
	constructor(
		@InjectRedis() private readonly redis: Redis,
		private readonly config: ConfigService<AppConfig, true>,
	) {}

	async use(
		request: Request,
		response: Response,
		next: NextFunction,
	): Promise<void> {
		const clientIp =
			request.ip ?? request.socket.remoteAddress ?? 'unknown';
		const keys = [`rate-limit:email-verification:ip:${clientIp}`];
		const email = request.body?.email;
		if (
			typeof email === 'string' &&
			email.length <= 254 &&
			/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
		) {
			const normalizedEmail = email.trim().toLowerCase();
			const secret = this.config.getOrThrow(
				'auth.firebase.emailVerificationHmacSecret',
				{ infer: true },
			);
			const digest = createHmac('sha256', secret)
				.update(normalizedEmail)
				.digest('hex');
			keys.push(`rate-limit:email-verification:email:${digest}`);
		}

		const counts = await Promise.all(
			keys.map(async (key) => {
				const count = await this.redis.incr(key);
				if (count === 1) await this.redis.expire(key, WINDOW_SECONDS);
				return { key, count };
			}),
		);
		const exceeded = counts.find(({ count }) => count > LIMIT);

		if (exceeded) {
			const ttl = await this.redis.ttl(exceeded.key);
			response.setHeader('Retry-After', Math.max(1, ttl));
			response
				.status(429)
				.json({ statusCode: 429, message: 'Too Many Requests' });
			return;
		}

		next();
	}
}
