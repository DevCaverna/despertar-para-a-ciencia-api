import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(
	app: NestExpressApplication,
	options: { enabled: boolean; apiName: string },
): void {
	if (!options.enabled) {
		return;
	}

	const swaggerConfig = new DocumentBuilder()
		.setTitle(options.apiName)
		.setDescription('NestJS API with PostgreSQL, Firebase Auth and Brevo')
		.setVersion('1.0')
		.addBearerAuth(
			{
				type: 'http',
				scheme: 'bearer',
				bearerFormat: 'JWT',
				name: 'Authorization',
				description: 'Cole aqui o Firebase ID Token',
				in: 'header',
			},
			'firebase-auth',
		)
		.build();
	const documentFactory = (): OpenAPIObject =>
		SwaggerModule.createDocument(app, swaggerConfig);

	SwaggerModule.setup('api', app, documentFactory);
}
