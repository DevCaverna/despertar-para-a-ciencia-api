declare namespace NodeJS {
	interface ProcessEnv {
		NODE_ENV?: 'development' | 'test' | 'production';
		SEND_EMAILS?: string;
		MAIL_DRIVER?: 'brevo' | 'noop';
		CORS_ORIGINS?: string;
		SWAGGER_ENABLED?: 'true' | 'false';
		PORT?: string;
		API_NAME?: string;

		// Database
		DATABASE_URL?: string;

		// Firebase
		FIREBASE_PROJECT_ID?: string;
		FIREBASE_PRIVATE_KEY?: string;
		FIREBASE_CLIENT_EMAIL?: string;
		EMAIL_VERIFICATION_HMAC_SECRET?: string;
		FIREBASE_WEB_API_KEY?: string;

		// Brevo
		BREVO_API_KEY?: string;
		BREVO_SENDER_EMAIL?: string;

		// Cloudflare R2
		CLOUDFLARE_R2_ACCOUNT_ID?: string;
		CLOUDFLARE_R2_ACCESS_KEY_ID?: string;
		CLOUDFLARE_R2_SECRET_ACCESS_KEY?: string;
		CLOUDFLARE_R2_BUCKET_NAME?: string;
		CLOUDFLARE_R2_PUBLIC_URL?: string;
		STORAGE_DRIVER?: 'memory' | 'r2';

		LOG_LEVEL?: string;

		// OTel
		OTEL_EXPORTER_OTLP_ENDPOINT?: string;
		OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE?: string;
		OTEL_EXPORTER_OTLP_CLIENT_KEY?: string;
		OTEL_SERVICE_NAME?: string;
		OTEL_RESOURCE_ATTRIBUTES?: string;
		OTEL_TRACES_SAMPLER?: string;
		OTEL_TRACES_SAMPLER_ARG?: string;
	}
}
