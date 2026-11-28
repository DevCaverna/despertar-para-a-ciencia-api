import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'dotenv';
import { describe, expect, it } from 'vitest';

import { environmentSchema } from './config.validation.js';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const script = join(repositoryRoot, 'scripts/create-runtime-env.sh');

function runtimeEnvironment(): NodeJS.ProcessEnv {
	return {
		NODE_ENV: 'test',
		PORT: '3001',
		SEND_EMAILS: 'false',
		MAIL_DRIVER: 'noop',
		CORS_ORIGINS: 'http://localhost:3000',
		SWAGGER_ENABLED: 'false',
		DATABASE_URL: 'postgresql://api_user:password@localhost:5432/app',
		REDIS_URL: 'redis://localhost:6379',
		FIREBASE_PROJECT_ID: 'test-project',
		FIREBASE_PRIVATE_KEY:
			'-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----',
		FIREBASE_CLIENT_EMAIL: 'test@example.com',
		EMAIL_VERIFICATION_HMAC_SECRET:
			'a-secure-test-secret-with-at-least-32-chars',
		STORAGE_DRIVER: 'memory',
		LOG_LEVEL: 'silent',
		API_NAME: 'Test API',
		OTEL_EXPORTER_OTLP_ENDPOINT: '',
		OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE: '',
		OTEL_EXPORTER_OTLP_CLIENT_KEY: '',
		OTEL_RESOURCE_ATTRIBUTES: 'service.version=test-sha',
		OTEL_TRACES_SAMPLER: 'parentbased_traceidratio',
	};
}

describe('create-runtime-env.sh', () => {
	it('writes the runtime allowlist and omits empty optional values', () => {
		const directory = mkdtempSync(
			join(tmpdir(), 'despertar-para-a-ciencia-api-runtime-env-'),
		);
		const output = join(directory, 'runtime.env');

		try {
			execFileSync('sh', [script, output], {
				env: { ...process.env, ...runtimeEnvironment() },
			});
			const contents = readFileSync(output, 'utf8');

			expect(contents).toContain('NODE_ENV=test\n');
			expect(contents).toContain(
				'FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\\nFAKE\\n-----END PRIVATE KEY-----\\n',
			);
			expect(contents).toContain('API_NAME=Test API\n');
			expect(contents).toContain(
				'EMAIL_VERIFICATION_HMAC_SECRET=a-secure-test-secret-with-at-least-32-chars\n',
			);
			expect(contents).not.toContain('OTEL_EXPORTER_OTLP_ENDPOINT=');
			expect(contents).not.toContain(
				'OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE=',
			);
			expect(contents).not.toContain('OTEL_EXPORTER_OTLP_CLIENT_KEY=');
			expect(contents).toContain(
				'OTEL_RESOURCE_ATTRIBUTES=service.version=test-sha\n',
			);
			expect(contents).toContain(
				'OTEL_TRACES_SAMPLER=parentbased_traceidratio\n',
			);
			expect(contents).not.toContain('FIREBASE_WEB_API_KEY=');
			expect(() =>
				environmentSchema.parse(parse(contents)),
			).not.toThrow();
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it('writes mTLS paths without writing PEM contents', () => {
		const directory = mkdtempSync(
			join(tmpdir(), 'despertar-para-a-ciencia-api-runtime-env-'),
		);
		const output = join(directory, 'runtime.env');
		const environment = {
			...runtimeEnvironment(),
			OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example.com:443',
			OTEL_SERVICE_NAME: 'despertar-para-a-ciencia-api',
			OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE:
				'/run/secrets/otel-client.crt',
			OTEL_EXPORTER_OTLP_CLIENT_KEY: '/run/secrets/otel-client.key',
		};

		try {
			execFileSync('sh', [script, output], {
				env: { ...process.env, ...environment },
			});
			const contents = readFileSync(output, 'utf8');

			expect(contents).toContain(
				'OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE=/run/secrets/otel-client.crt\n',
			);
			expect(contents).toContain(
				'OTEL_EXPORTER_OTLP_CLIENT_KEY=/run/secrets/otel-client.key\n',
			);
			expect(contents).not.toContain(
				'OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE=-----',
			);
			expect(contents).not.toContain(
				'OTEL_EXPORTER_OTLP_CLIENT_KEY=-----',
			);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it('rejects missing required values', () => {
		const directory = mkdtempSync(
			join(tmpdir(), 'despertar-para-a-ciencia-api-runtime-env-'),
		);
		const output = join(directory, 'runtime.env');
		const environment = runtimeEnvironment();
		delete environment.DATABASE_URL;

		try {
			expect(() =>
				execFileSync('sh', [script, output], {
					env: { ...process.env, ...environment },
				}),
			).toThrow('Command failed');
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it('omits empty AI variables and writes Gemini configuration when set', () => {
		const directory = mkdtempSync(
			join(tmpdir(), 'despertar-para-a-ciencia-api-runtime-env-'),
		);
		const output = join(directory, 'runtime.env');

		try {
			const emptyAiEnvironment: Record<string, string | undefined> = {
				...process.env,
				...runtimeEnvironment(),
				AI_DRIVER: '',
				GEMINI_API_KEY: '',
				GEMINI_MODEL: '',
				GEMINI_TIMEOUT_MS: '',
			};
			execFileSync('sh', [script, output], {
				env: emptyAiEnvironment,
			});
			const withoutAi = readFileSync(output, 'utf8');
			expect(withoutAi).not.toContain('AI_DRIVER=');
			expect(withoutAi).not.toContain('GEMINI_API_KEY=');
			expect(() =>
				environmentSchema.parse(parse(withoutAi)),
			).not.toThrow();

			execFileSync('sh', [script, output], {
				env: {
					...process.env,
					...runtimeEnvironment(),
					AI_DRIVER: 'gemini',
					GEMINI_API_KEY: 'gemini-runtime-secret',
					GEMINI_MODEL: 'gemini-2.5-flash',
					GEMINI_TIMEOUT_MS: '15000',
				},
			});
			const withGemini = readFileSync(output, 'utf8');
			expect(withGemini).toContain('AI_DRIVER=gemini\n');
			expect(withGemini).toContain(
				'GEMINI_API_KEY=gemini-runtime-secret\n',
			);
			expect(withGemini).toContain('GEMINI_MODEL=gemini-2.5-flash\n');
			expect(withGemini).toContain('GEMINI_TIMEOUT_MS=15000\n');
			expect(() =>
				environmentSchema.parse(parse(withGemini)),
			).not.toThrow();
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
