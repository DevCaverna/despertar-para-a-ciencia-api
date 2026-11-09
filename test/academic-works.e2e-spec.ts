import { randomInt, randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ACADEMIC_WORK_SOURCE_PORT } from '../src/academic-work/application/academic-work-source.port.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_PORT } from '../src/auth/domain/auth.port.js';
import { UserRole } from '../src/auth/domain/user-role.js';
import { configureApplication } from '../src/bootstrap.js';

const issn = String(randomInt(0, 100_000_000)).padStart(8, '0');
const doi = `10.1234/${randomUUID()}`;

describe('Academic work synchronization (e2e)', () => {
	let app: NestExpressApplication;
	let pool: Pool;
	let userId: string;
	const sourceSearch = vi.fn().mockResolvedValue({
		items: [
			{
				externalId: doi,
				title: 'A scientific article',
				authors: ['Ada Lovelace'],
				publicationDate: '2025-06',
			},
		],
	});

	beforeAll(async () => {
		pool = new Pool({ connectionString: process.env.DATABASE_URL });
		const created = await pool.query<{ id: string }>(
			'INSERT INTO public.user ("name", "email") VALUES ($1, $2) RETURNING id',
			['Academic Admin', `academic-${randomUUID()}@example.com`],
		);
		userId = created.rows[0].id;
		const authPort = {
			validateToken: vi.fn((token: string) =>
				Promise.resolve({
					subject: 'firebase-academic-admin',
					id: userId,
					email: 'academic-admin@example.com',
					emailVerified: true,
					roles: [token === 'admin' ? UserRole.ADMIN : UserRole.USER],
				}),
			),
		};
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(AUTH_PORT)
			.useValue(authPort)
			.overrideProvider(ACADEMIC_WORK_SOURCE_PORT)
			.useValue({ search: sourceSearch })
			.compile();
		app = module.createNestApplication<NestExpressApplication>();
		await configureApplication(app);
	});

	afterAll(async () => {
		if (app) await app.close();
		if (pool) {
			await pool.query(
				'DELETE FROM public."externalWork" WHERE doi = $1',
				[doi],
			);
			await pool.query(
				'DELETE FROM public."academicSource" WHERE issn = $1',
				[issn],
			);
			if (userId) {
				await pool.query('DELETE FROM public.user WHERE id = $1', [
					userId,
				]);
			}
			await pool.end();
		}
	});

	it('allows an active admin to import once and reports duplicates on retry', async () => {
		const payload = { issn, name: 'Science Journal' };
		const first = await request(app.getHttpServer())
			.post('/academic-works/sync')
			.set('Authorization', 'Bearer admin')
			.send(payload);
		expect(first.status).toBe(201);
		expect(first.body).toEqual({ found: 1, imported: 1, ignored: 0 });

		const stored = await pool.query<{ doi: string; authors: string[] }>(
			'SELECT doi, authors FROM public."externalWork" WHERE doi = $1',
			[doi],
		);
		expect(stored.rows).toEqual([{ doi, authors: ['Ada Lovelace'] }]);

		const retry = await request(app.getHttpServer())
			.post('/academic-works/sync')
			.set('Authorization', 'Bearer admin')
			.send(payload);
		expect(retry.status).toBe(201);
		expect(retry.body).toEqual({ found: 1, imported: 0, ignored: 1 });
	});

	it('denies users without the admin role', async () => {
		const response = await request(app.getHttpServer())
			.post('/academic-works/sync')
			.set('Authorization', 'Bearer user')
			.send({ issn, name: 'Science Journal' });
		expect(response.status).toBe(403);
	});

	it('denies admins with an inactive local profile', async () => {
		await pool.query(
			'UPDATE public.user SET active = false WHERE id = $1',
			[userId],
		);
		const response = await request(app.getHttpServer())
			.post('/academic-works/sync')
			.set('Authorization', 'Bearer admin')
			.send({ issn, name: 'Science Journal' });
		expect(response.status).toBe(403);
	});
});
