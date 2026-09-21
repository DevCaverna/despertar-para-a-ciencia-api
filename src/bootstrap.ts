import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { I18nValidationExceptionFilter, I18nValidationPipe } from 'nestjs-i18n';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import type { AppConfig } from './config/config.types.js';
import { createCorsOptions } from './http/cors.config.js';
import { setupSwagger } from './http/swagger.js';

export async function configureApplication(
	app: NestExpressApplication,
): Promise<void> {
	app.useLogger(app.get(Logger));
	app.enableShutdownHooks();
	const logger = app.get(Logger);
	const config = app.get(ConfigService<AppConfig, true>);
	const port = config.getOrThrow('app.port', { infer: true });

	const corsOrigins = config.getOrThrow('http.corsOrigins', {
		infer: true,
	});
	if (corsOrigins.length > 0) {
		app.enableCors(createCorsOptions(corsOrigins));
	}

	// The container accepts traffic only from the local reverse proxy.
	app.set('trust proxy', 1);
	app.set('query parser', 'extended');

	setupSwagger(app, {
		enabled: config.getOrThrow('http.swaggerEnabled', { infer: true }),
		apiName: config.getOrThrow('app.name', { infer: true }),
	});

	app.useGlobalPipes(
		new I18nValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
		}),
	);
	app.useGlobalFilters(new I18nValidationExceptionFilter());

	await app.init();
	logger.log(`Application is configured for port: ${port}`);
}

export async function createApplication(): Promise<NestExpressApplication> {
	const app = await NestFactory.create<NestExpressApplication>(AppModule, {
		bufferLogs: true,
	});
	await configureApplication(app);
	return app;
}
