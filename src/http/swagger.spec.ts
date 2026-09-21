import { Controller, Get, Module } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { setupSwagger } from './swagger.js';

@Controller('example')
class ExampleController {
	@Get()
	get(): { status: string } {
		return { status: 'ok' };
	}
}

@Module({ controllers: [ExampleController] })
class ExampleModule {}

async function createExampleApp(): Promise<NestExpressApplication> {
	const moduleFixture = await Test.createTestingModule({
		imports: [ExampleModule],
	}).compile();
	return moduleFixture.createNestApplication() as NestExpressApplication;
}

describe('setupSwagger', () => {
	it('serves the UI and JSON document at /api when enabled', async () => {
		const app = await createExampleApp();

		try {
			setupSwagger(app, { enabled: true, apiName: 'Test API' });
			await app.init();

			const uiResponse = await request(app.getHttpServer()).get('/api');
			const jsonResponse = await request(app.getHttpServer()).get(
				'/api-json',
			);

			expect(uiResponse.status).toBe(200);
			expect(jsonResponse.status).toBe(200);
			expect(jsonResponse.body.openapi).toBe('3.0.0');
		} finally {
			await app.close();
		}
	});

	it('does not register routes when disabled', async () => {
		const app = await createExampleApp();

		try {
			setupSwagger(app, { enabled: false, apiName: 'Test API' });
			await app.init();

			expect(
				(await request(app.getHttpServer()).get('/api')).status,
			).toBe(404);
		} finally {
			await app.close();
		}
	});
});
