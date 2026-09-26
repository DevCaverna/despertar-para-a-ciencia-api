import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import {
	appConfig,
	authConfig,
	databaseConfig,
	httpConfig,
	loggingConfig,
	mailConfig,
	redisConfig,
	storageConfig,
	telemetryConfig,
} from './config.factories.js';
import { environmentSchema } from './config.validation.js';

@Global()
@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			cache: true,
			load: [
				appConfig,
				databaseConfig,
				authConfig,
				httpConfig,
				loggingConfig,
				mailConfig,
				redisConfig,
				storageConfig,
				telemetryConfig,
			],
			validationSchema: environmentSchema,
		}),
	],
	exports: [ConfigModule],
})
export class AppConfigModule {}
