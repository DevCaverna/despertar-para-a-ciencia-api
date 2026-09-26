import { z } from 'zod';

import { parseCorsOrigins } from '../utils/cors-origins.util.js';

function postgresUrl(variableName: string): z.ZodString {
	return z
		.string()
		.url()
		.refine(
			(value) =>
				['postgres:', 'postgresql:'].includes(new URL(value).protocol),
			`${variableName} must use the PostgreSQL protocol.`,
		);
}

const databaseUrl = postgresUrl('DATABASE_URL');

const redisUrl = z
	.string()
	.url()
	.refine(
		(value) => ['redis:', 'rediss:'].includes(new URL(value).protocol),
		'REDIS_URL must use the Redis protocol.',
	);

const booleanValue = z
	.enum(['true', 'false'], {
		error: 'Value must be either "true" or "false".',
	})
	.transform((value) => value === 'true');

const optionalString = z.preprocess(
	(value) => (value === '' ? undefined : value),
	z.string().min(1).optional(),
);

const optionalEmail = z.preprocess(
	(value) => (value === '' ? undefined : value),
	z.string().email().optional(),
);

const optionalUrl = z.preprocess(
	(value) => (value === '' ? undefined : value),
	z.string().url().optional(),
);

const corsOrigins = z.preprocess(
	(value) =>
		typeof value === 'string' && value.trim() === '' ? undefined : value,
	z
		.string()
		.optional()
		.superRefine((value, context) => {
			if (value === undefined) return;

			try {
				parseCorsOrigins(value);
			} catch (error) {
				context.addIssue({
					code: 'custom',
					message:
						error instanceof Error
							? error.message
							: 'Invalid CORS_ORIGINS.',
				});
			}
		}),
);

const baseEnvironmentSchema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']),
	PORT: z.coerce.number().int().min(1024).max(65535),
	LOG_LEVEL: z
		.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
		.default('info'),
	SEND_EMAILS: booleanValue,
	MAIL_DRIVER: z.enum(['brevo', 'noop', 'local-capture']),
	CORS_ORIGINS: corsOrigins,
	SWAGGER_ENABLED: booleanValue,
	API_NAME: z.string().min(1).default('Despertar para a Ciência API'),
	DATABASE_URL: databaseUrl,
	REDIS_URL: redisUrl,
	FIREBASE_PROJECT_ID: z.string().min(1),
	FIREBASE_PRIVATE_KEY: z.string().min(1),
	FIREBASE_CLIENT_EMAIL: z.string().email(),
	EMAIL_VERIFICATION_HMAC_SECRET: z.string().min(32),
	BREVO_API_KEY: optionalString,
	BREVO_SENDER_EMAIL: optionalEmail,
	STORAGE_DRIVER: z.enum(['memory', 'r2']),
	CLOUDFLARE_R2_ACCOUNT_ID: optionalString,
	CLOUDFLARE_R2_ACCESS_KEY_ID: optionalString,
	CLOUDFLARE_R2_SECRET_ACCESS_KEY: optionalString,
	CLOUDFLARE_R2_BUCKET_NAME: optionalString,
	CLOUDFLARE_R2_PUBLIC_URL: optionalUrl,
	OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
	OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE: optionalString,
	OTEL_EXPORTER_OTLP_CLIENT_KEY: optionalString,
	OTEL_SERVICE_NAME: optionalString,
	OTEL_RESOURCE_ATTRIBUTES: optionalString,
	OTEL_TRACES_SAMPLER: optionalString,
	OTEL_TRACES_SAMPLER_ARG: optionalString,
});

export const environmentSchema = baseEnvironmentSchema.superRefine(
	(environment, context) => {
		if (environment.MAIL_DRIVER === 'noop' && environment.SEND_EMAILS) {
			context.addIssue({
				code: 'custom',
				path: ['SEND_EMAILS'],
				message: 'SEND_EMAILS=true requires MAIL_DRIVER=brevo.',
			});
		}

		if (environment.MAIL_DRIVER === 'brevo') {
			for (const name of [
				'BREVO_API_KEY',
				'BREVO_SENDER_EMAIL',
			] as const) {
				if (!environment[name]) {
					context.addIssue({
						code: 'custom',
						path: [name],
						message: `${name} is required when MAIL_DRIVER=brevo.`,
					});
				}
			}
		}

		if (
			environment.MAIL_DRIVER === 'local-capture' &&
			(environment.NODE_ENV !== 'development' || !environment.SEND_EMAILS)
		) {
			context.addIssue({
				code: 'custom',
				path: ['MAIL_DRIVER'],
				message:
					'MAIL_DRIVER=local-capture requires NODE_ENV=development and SEND_EMAILS=true.',
			});
		}

		if (environment.STORAGE_DRIVER === 'r2') {
			for (const name of [
				'CLOUDFLARE_R2_ACCOUNT_ID',
				'CLOUDFLARE_R2_ACCESS_KEY_ID',
				'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
				'CLOUDFLARE_R2_BUCKET_NAME',
				'CLOUDFLARE_R2_PUBLIC_URL',
			] as const) {
				if (!environment[name]) {
					context.addIssue({
						code: 'custom',
						path: [name],
						message: `${name} is required when STORAGE_DRIVER=r2.`,
					});
				}
			}
		}

		if (
			environment.OTEL_EXPORTER_OTLP_ENDPOINT &&
			!environment.OTEL_SERVICE_NAME
		) {
			context.addIssue({
				code: 'custom',
				path: ['OTEL_SERVICE_NAME'],
				message:
					'OTEL_SERVICE_NAME is required when telemetry export is enabled.',
			});
		}

		if (
			Boolean(environment.OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE) !==
			Boolean(environment.OTEL_EXPORTER_OTLP_CLIENT_KEY)
		) {
			context.addIssue({
				code: 'custom',
				path: ['OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE'],
				message:
					'OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE and OTEL_EXPORTER_OTLP_CLIENT_KEY must be configured together.',
			});
		}
	},
);
