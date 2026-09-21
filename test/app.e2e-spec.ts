import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { AUTH_PORT } from '../src/auth/domain/auth.port.js';
import { configureApplication } from '../src/bootstrap.js';

describe('AppController (e2e)', () => {
	let app: NestExpressApplication;
	let mockAuthPort: {
		validateToken: ReturnType<typeof vi.fn>;
		markEmailAsVerified: ReturnType<typeof vi.fn>;
		assignUserRoles: ReturnType<typeof vi.fn>;
		revokeUserRoles: ReturnType<typeof vi.fn>;
		updatePassword: ReturnType<typeof vi.fn>;
		getUserByEmail: ReturnType<typeof vi.fn>;
		deleteUserByEmail: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		mockAuthPort = {
			validateToken: vi.fn(),
			markEmailAsVerified: vi.fn(),
			assignUserRoles: vi.fn(),
			revokeUserRoles: vi.fn(),
			updatePassword: vi.fn(),
			getUserByEmail: vi.fn(),
			deleteUserByEmail: vi.fn(),
		};

		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(AUTH_PORT)
			.useValue(mockAuthPort)
			.compile();

		app = moduleFixture.createNestApplication<NestExpressApplication>();
		await configureApplication(app);
	});

	afterEach(async () => {
		if (app) {
			await app.close();
		}
	});

	it('/health (GET)', async () => {
		const response = await request(app.getHttpServer()).get('/health');

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ status: 'ok' });
		expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
	});

	it('preserves a valid X-Request-Id', async () => {
		const response = await request(app.getHttpServer())
			.get('/health')
			.set('X-Request-Id', 'request-test-01');

		expect(response.headers['x-request-id']).toBe('request-test-01');
	});

	it('/health/live (GET) does not require PostgreSQL', async () => {
		const response = await request(app.getHttpServer()).get('/health/live');

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ status: 'ok' });
	});

	it('applies CORS from the real bootstrap', async () => {
		const response = await request(app.getHttpServer())
			.get('/health/live')
			.set('Origin', 'http://localhost:3000');

		expect(response.headers['access-control-allow-origin']).toBe(
			'http://localhost:3000',
		);
	});

	it('keeps Swagger disabled in the test environment', async () => {
		const response = await request(app.getHttpServer()).get('/api-json');

		expect(response.status).toBe(404);
	});

	it('/health/ready (GET) confirms PostgreSQL connectivity', async () => {
		const response = await request(app.getHttpServer()).get(
			'/health/ready',
		);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ status: 'ok' });
	});

	it('/health/ready (GET) limits database-backed public probes', async () => {
		const responses: Array<{ status: number }> = [];
		for (let index = 0; index < 31; index += 1) {
			responses.push(
				// oxlint-disable-next-line no-await-in-loop -- Keep requests sequential to avoid exhausting the test server.
				await request(app.getHttpServer()).get('/health/ready'),
			);
		}

		expect(responses.filter(({ status }) => status === 200)).toHaveLength(
			30,
		);
		expect(responses.filter(({ status }) => status === 429)).toHaveLength(
			1,
		);
	});
});
