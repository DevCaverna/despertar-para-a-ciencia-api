import { describe, expect, it } from 'vitest';

import { environmentSchema } from './config.validation.js';

function validEnvironment(): Record<string, unknown> {
	return {
		NODE_ENV: 'test',
		PORT: '3001',
		LOG_LEVEL: 'silent',
		SEND_EMAILS: 'false',
		MAIL_DRIVER: 'noop',
		CORS_ORIGINS: 'http://localhost:3000,https://app.example.com/',
		SWAGGER_ENABLED: 'false',
		DATABASE_URL: 'postgresql://api_user:password@localhost:5432/app',
		REDIS_URL: 'redis://localhost:6379',
		FIREBASE_PROJECT_ID: 'test-project',
		FIREBASE_PRIVATE_KEY: 'private-key',
		FIREBASE_CLIENT_EMAIL: 'test@example.com',
		EMAIL_VERIFICATION_HMAC_SECRET:
			'a-secure-test-secret-with-at-least-32-chars',
		STORAGE_DRIVER: 'memory',
	};
}

describe('validateEnvironment', () => {
	it('normalizes valid runtime configuration', () => {
		const config = environmentSchema.parse(validEnvironment());

		expect(config).toMatchObject({
			NODE_ENV: 'test',
			PORT: 3001,
			CORS_ORIGINS: 'http://localhost:3000,https://app.example.com/',
			MAIL_DRIVER: 'noop',
			STORAGE_DRIVER: 'memory',
		});
	});

	it('treats empty optional values as unset', () => {
		const config = environmentSchema.parse({
			...validEnvironment(),
			BREVO_API_KEY: '',
			BREVO_SENDER_EMAIL: '',
			CLOUDFLARE_R2_ACCOUNT_ID: '',
			CLOUDFLARE_R2_PUBLIC_URL: '',
			OTEL_EXPORTER_OTLP_ENDPOINT: '',
			OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE: '',
			OTEL_EXPORTER_OTLP_CLIENT_KEY: '',
			OTEL_SERVICE_NAME: '',
		});

		expect(config.BREVO_API_KEY).toBeUndefined();
		expect(config.CLOUDFLARE_R2_PUBLIC_URL).toBeUndefined();
		expect(config.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
	});

	it('allows CORS to be disabled or opened with a wildcard', () => {
		const config = validEnvironment();

		delete config.CORS_ORIGINS;
		expect(environmentSchema.parse(config).CORS_ORIGINS).toBeUndefined();

		config.CORS_ORIGINS = '*';
		expect(environmentSchema.parse(config).CORS_ORIGINS).toBe('*');
	});

	it('rejects invalid booleans and ports', () => {
		const config = validEnvironment();
		config.PORT = '3000.5';
		config.SEND_EMAILS = 'yes';

		expect(environmentSchema.safeParse(config).success).toBe(false);

		config.PORT = '3000';
		expect(environmentSchema.safeParse(config).success).toBe(false);
	});

	it('requires explicit environment and driver selection', () => {
		const config = validEnvironment();

		delete config.NODE_ENV;
		delete config.MAIL_DRIVER;
		delete config.STORAGE_DRIVER;

		expect(environmentSchema.safeParse(config).success).toBe(false);
	});

	it('requires a sufficiently long email verification HMAC secret', () => {
		const config = validEnvironment();
		config.EMAIL_VERIFICATION_HMAC_SECRET = 'too-short';

		expect(environmentSchema.safeParse(config).success).toBe(false);
	});

	it('requires conditional Brevo credentials', () => {
		const config = validEnvironment();
		config.MAIL_DRIVER = 'brevo';
		config.BREVO_API_KEY = '';
		config.BREVO_SENDER_EMAIL = '';

		expect(environmentSchema.safeParse(config).success).toBe(false);
	});

	it('allows local email capture only in development with delivery enabled', () => {
		const config = {
			...validEnvironment(),
			NODE_ENV: 'development',
			MAIL_DRIVER: 'local-capture',
			SEND_EMAILS: 'true',
		};
		expect(environmentSchema.safeParse(config).success).toBe(true);
		expect(
			environmentSchema.safeParse({ ...config, NODE_ENV: 'production' })
				.success,
		).toBe(false);
		expect(
			environmentSchema.safeParse({ ...config, SEND_EMAILS: 'false' })
				.success,
		).toBe(false);
	});

	it('requires conditional R2 credentials', () => {
		const config = validEnvironment();
		config.STORAGE_DRIVER = 'r2';
		config.CLOUDFLARE_R2_ACCOUNT_ID = '';

		expect(environmentSchema.safeParse(config).success).toBe(false);
	});

	it('requires a service name when telemetry export is enabled', () => {
		const config = validEnvironment();
		config.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otel.example.com:4317';

		expect(environmentSchema.safeParse(config).success).toBe(false);

		config.OTEL_SERVICE_NAME = 'test-api';
		expect(environmentSchema.safeParse(config).success).toBe(true);
	});

	it('requires the OTLP client certificate and key as a pair', () => {
		const config = validEnvironment();
		config.OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE = '/tmp/client.crt';

		expect(environmentSchema.safeParse(config).success).toBe(false);

		config.OTEL_EXPORTER_OTLP_CLIENT_KEY = '/tmp/client.key';
		expect(environmentSchema.safeParse(config).success).toBe(true);

		delete config.OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE;
		expect(environmentSchema.safeParse(config).success).toBe(false);
	});
});
