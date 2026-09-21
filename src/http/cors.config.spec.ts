import { describe, expect, it } from 'vitest';

import { createCorsOptions, getCorsOrigins } from './cors.config.js';

describe('getCorsOrigins', () => {
	it('normalizes the configured CSV list of origins', () => {
		expect(
			getCorsOrigins('http://localhost:3000, https://app.example.com/'),
		).toEqual(
			new Set(['http://localhost:3000', 'https://app.example.com']),
		);
	});

	it('disables CORS when no origin is configured', () => {
		expect(getCorsOrigins('')).toEqual(new Set());
		expect(getCorsOrigins(undefined)).toEqual(new Set());
	});

	it('rejects origins with paths', () => {
		expect(() => getCorsOrigins('https://app.example.com/admin')).toThrow(
			'CORS_ORIGINS entries must be HTTP(S) origins without paths, queries, or fragments.',
		);
	});

	it('allows only configured browser origins', () => {
		const cors = createCorsOptions('https://app.example.com');
		let allowed = false;

		cors.origin('https://other.example.com', (_error, result) => {
			allowed = result;
		});

		expect(allowed).toBe(false);
	});

	it('allows any browser origin with the wildcard', () => {
		const cors = createCorsOptions('*');
		let allowed = false;

		cors.origin('https://other.example.com', (_error, result) => {
			allowed = result;
		});

		expect(allowed).toBe(true);
	});

	it('rejects a wildcard combined with an allowlist', () => {
		expect(() => getCorsOrigins('*,https://app.example.com')).toThrow(
			'CORS_ORIGINS wildcard must be configured without other origins.',
		);
	});
});
