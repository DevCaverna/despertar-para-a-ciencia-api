import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import {
	MiddlewareConsumer,
	Module,
	NestModule,
	RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
	I18nModule,
	AcceptLanguageResolver,
	HeaderResolver,
	QueryResolver,
} from 'nestjs-i18n';
import { LoggerModule } from 'nestjs-pino';

import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthGuard } from './auth/presentation/auth.guard.js';
import { AppConfigModule } from './config/config.module.js';
import type { AppConfig } from './config/config.types.js';
import { createPinoHttpOptions, requestId } from './http/pino.config.js';
import { PublicDatabaseRateLimitMiddleware } from './http/public-database-rate-limit.middleware.js';
import { MailModule } from './mail/mail.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { StorageModule } from './storage/storage.module.js';
import { TelemetryShutdownService } from './telemetry/telemetry-shutdown.service.js';

@Module({
	imports: [
		AppConfigModule,
		LoggerModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService<AppConfig, true>) => {
				const environment = config.getOrThrow('app.environment', {
					infer: true,
				});

				return {
					pinoHttp: createPinoHttpOptions(
						environment === 'test'
							? 'silent'
							: config.getOrThrow('logging.level', {
									infer: true,
								}),
						environment === 'development',
					),
				};
			},
		}),
		I18nModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService<AppConfig, true>) => {
				const environment = config.getOrThrow('app.environment', {
					infer: true,
				});
				const isDevelopment = environment === 'development';

				return {
					fallbackLanguage: 'pt-BR',
					// Regional variants (en-US, es-MX, pt-PT…) resolve to the
					// supported language instead of falling back to pt-BR.
					fallbacks: {
						'en-*': 'en',
						'es-*': 'es',
						pt: 'pt-BR',
						'pt-*': 'pt-BR',
					},
					loaderOptions: {
						path: path.resolve(
							process.cwd(),
							environment === 'test' ? 'src/i18n' : 'dist/i18n',
						),
						watch: isDevelopment,
					},
					typesOutputPath: isDevelopment
						? path.resolve(
								process.cwd(),
								'src/generated/i18n.generated.ts',
							)
						: undefined,
				};
			},
			resolvers: [
				new QueryResolver(['lang', 'locale']),
				new HeaderResolver(['x-custom-lang']),
				AcceptLanguageResolver,
			],
		}),
		PrismaModule,
		AuthModule,
		MailModule,
		StorageModule,
	],
	controllers: [AppController],
	providers: [
		{ provide: 'APP_GUARD', useClass: AuthGuard },
		TelemetryShutdownService,
	],
})
export class AppModule implements NestModule {
	configure(consumer: MiddlewareConsumer): void {
		consumer
			.apply(
				(
					req: IncomingMessage,
					res: ServerResponse,
					next: () => void,
				) => {
					const id = requestId(req);
					req.id = id;
					res.setHeader('X-Request-Id', id);
					next();
				},
			)
			.forRoutes('*');

		consumer
			.apply(PublicDatabaseRateLimitMiddleware)
			.forRoutes({ path: 'health/ready', method: RequestMethod.GET });
	}
}
