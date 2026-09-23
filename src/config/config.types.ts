export type AppEnvironment = 'development' | 'test' | 'production';
export type LogLevel =
	| 'trace'
	| 'debug'
	| 'info'
	| 'warn'
	| 'error'
	| 'fatal'
	| 'silent';
export interface BrevoConfig {
	apiKey: string;
	senderEmail: string;
}

export interface R2Config {
	accountId: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucketName: string;
	publicUrl: string;
}

export type MailConfig =
	| {
			driver: 'noop';
			sendEmails: false;
			brevo?: undefined;
	  }
	| {
			driver: 'brevo';
			sendEmails: boolean;
			brevo: BrevoConfig;
	  };

export type StorageConfig =
	| {
			driver: 'memory';
			r2?: undefined;
	  }
	| {
			driver: 'r2';
			r2: R2Config;
	  };

export interface AppConfig {
	app: {
		environment: AppEnvironment;
		name: string;
		port: number;
	};
	database: {
		runtimeUrl: string;
	};
	redis: {
		url: string;
	};
	auth: {
		firebase: {
			projectId: string;
			privateKey: string;
			clientEmail: string;
		};
	};
	mail: MailConfig;
	storage: StorageConfig;
	http: {
		corsOrigins: string[];
		swaggerEnabled: boolean;
	};
	logging: {
		level: LogLevel;
	};
	telemetry: {
		endpoint?: string;
		serviceName?: string;
		resourceAttributes?: string;
		tracesSampler?: string;
		tracesSamplerArg?: string;
	};
}
