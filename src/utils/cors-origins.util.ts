export function parseCorsOrigins(value?: string): string[] {
	if (value === undefined || value.trim() === '') return [];

	const origins = value.split(',').map((origin) => origin.trim());
	if (origins.includes('*')) {
		if (origins.length !== 1) {
			throw new Error(
				'CORS_ORIGINS wildcard must be configured without other origins.',
			);
		}
		return ['*'];
	}

	if (origins.some((origin) => !origin)) {
		throw new Error(
			'CORS_ORIGINS must contain only non-empty allowed origins.',
		);
	}

	return origins.map((origin) => {
		const parsed = new URL(origin);
		if (
			!['http:', 'https:'].includes(parsed.protocol) ||
			parsed.pathname !== '/' ||
			parsed.search ||
			parsed.hash
		) {
			throw new Error(
				'CORS_ORIGINS entries must be HTTP(S) origins without paths, queries, or fragments.',
			);
		}
		return parsed.origin;
	});
}
