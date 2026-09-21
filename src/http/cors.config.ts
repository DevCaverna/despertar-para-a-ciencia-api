import { parseCorsOrigins } from '../utils/cors-origins.util.js';

export function getCorsOrigins(value?: string): Set<string> {
	return new Set(parseCorsOrigins(value));
}

export function createCorsOptions(value: string | readonly string[]): {
	origin: (
		origin: string | undefined,
		callback: (error: Error | null, allowed: boolean) => void,
	) => void;
	credentials: false;
} {
	const allowedOrigins =
		typeof value === 'string' ? getCorsOrigins(value) : new Set(value);
	const allowAnyOrigin = allowedOrigins.has('*');

	return {
		origin(origin, callback): void {
			callback(
				null,
				origin === undefined ||
					allowAnyOrigin ||
					allowedOrigins.has(origin),
			);
		},
		credentials: false,
	};
}
