import { registerAs } from '@nestjs/config';

import { parseCorsOrigins } from '../utils/cors-origins.util.js';
import type {
	AppEnvironment,
	BrevoConfig,
	LogLevel,
	R2Config,
} from './config.types.js';

const env = process.env as Record<string, string | undefined>;
const booleanValue = (value: string | undefined): boolean =>
	value?.toLowerCase() === 'true';
const environment = (): AppEnvironment => env.NODE_ENV as AppEnvironment;

export const appConfig = registerAs('app', () => ({
	environment: environment(),
	name: env.API_NAME as string,
	port: Number(env.PORT),
}));

export const databaseConfig = registerAs('database', () => ({
	runtimeUrl: env.DATABASE_URL as string,
}));

export const authConfig = registerAs('auth', () => ({
	firebase: {
		projectId: env.FIREBASE_PROJECT_ID as string,
		privateKey: (env.FIREBASE_PRIVATE_KEY as string).replaceAll(
			String.raw`\n`,
			'\n',
		),
		clientEmail: env.FIREBASE_CLIENT_EMAIL as string,
	},
}));

export const mailConfig = registerAs('mail', () => {
	if (env.MAIL_DRIVER === 'brevo') {
		return {
			driver: 'brevo' as const,
			sendEmails: booleanValue(env.SEND_EMAILS),
			brevo: {
				apiKey: env.BREVO_API_KEY as string,
				senderEmail: env.BREVO_SENDER_EMAIL as string,
			} satisfies BrevoConfig,
		};
	}

	return { driver: 'noop' as const, sendEmails: false as const };
});

export const storageConfig = registerAs('storage', () => {
	if (env.STORAGE_DRIVER === 'r2') {
		return {
			driver: 'r2' as const,
			r2: {
				accountId: env.CLOUDFLARE_R2_ACCOUNT_ID as string,
				accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID as string,
				secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY as string,
				bucketName: env.CLOUDFLARE_R2_BUCKET_NAME as string,
				publicUrl: env.CLOUDFLARE_R2_PUBLIC_URL as string,
			} satisfies R2Config,
		};
	}

	return { driver: 'memory' as const };
});

export const httpConfig = registerAs('http', () => ({
	corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
	swaggerEnabled: booleanValue(env.SWAGGER_ENABLED),
}));

export const loggingConfig = registerAs('logging', () => ({
	level: env.LOG_LEVEL as LogLevel,
}));

export const telemetryConfig = registerAs('telemetry', () => ({
	endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
	serviceName: env.OTEL_SERVICE_NAME,
	resourceAttributes: env.OTEL_RESOURCE_ATTRIBUTES,
	tracesSampler: env.OTEL_TRACES_SAMPLER,
	tracesSamplerArg: env.OTEL_TRACES_SAMPLER_ARG,
}));
