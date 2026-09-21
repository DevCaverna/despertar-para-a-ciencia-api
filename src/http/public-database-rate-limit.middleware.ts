import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const LIMIT = 30;
const WINDOW_MS = 60_000;
const MAX_CLIENTS = 10_000;

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

@Injectable()
export class PublicDatabaseRateLimitMiddleware implements NestMiddleware {
	private readonly clients = new Map<string, RateLimitEntry>();

	use(request: Request, response: Response, next: NextFunction): void {
		const now = Date.now();
		const clientIp =
			request.ip ?? request.socket.remoteAddress ?? 'unknown';
		let entry = this.clients.get(clientIp);

		if (!entry || entry.resetAt <= now) {
			this.pruneExpiredEntries(now);
			entry = { count: 0, resetAt: now + WINDOW_MS };
			this.clients.set(clientIp, entry);
		}

		if (entry.count >= LIMIT) {
			response.setHeader(
				'Retry-After',
				Math.ceil((entry.resetAt - now) / 1000),
			);
			response
				.status(429)
				.json({ statusCode: 429, message: 'Too Many Requests' });
			return;
		}

		entry.count += 1;
		next();
	}

	private pruneExpiredEntries(now: number): void {
		if (this.clients.size < MAX_CLIENTS) {
			return;
		}

		for (const [clientIp, entry] of this.clients) {
			if (entry.resetAt <= now) {
				this.clients.delete(clientIp);
			}
		}

		if (this.clients.size >= MAX_CLIENTS) {
			const oldestClientIp = this.clients.keys().next().value;
			if (oldestClientIp) {
				this.clients.delete(oldestClientIp);
			}
		}
	}
}
