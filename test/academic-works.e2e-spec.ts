import { randomInt, randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
	ACADEMIC_WORK_SOURCE_PORT,
	type AcademicWorkCandidate,
	type AcademicWorkSourcePort,
} from '../src/academic-work/application/academic-work-source.port.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_PORT } from '../src/auth/domain/auth.port.js';
import { UserRole } from '../src/auth/domain/user-role.js';
import { configureApplication } from '../src/bootstrap.js';

const issnBase = randomInt(0, 99_999_997);
const [issn, bulkIssn, rollbackIssn] = [0, 1, 2].map((offset) =>
	String(issnBase + offset).padStart(8, '0'),
);
const doi = `10.1234/${randomUUID()}`;

function makeWorks(prefix: string, count: number): AcademicWorkCandidate[] {
	return Array.from({ length: count }, (_, index) => ({
		externalId: `${doi}/${prefix}/${String(index).padStart(4, '0')}`,
		title: 'A scientific article',
		authors: ['Ada Lovelace'],
	}));
}

describe('Academic work synchronization (e2e)', () => {
	let app: NestExpressApplication;
	let pool: Pool;
	let userId: string;
	const sourceSearch = vi
		.fn<AcademicWorkSourcePort['search']>()
		.mockResolvedValue({
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
					roles: [
						token === 'admin'
							? UserRole.ADMIN
							: token === 'collaborator'
								? UserRole.COLLABORATOR
								: UserRole.USER,
					],
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
				'DELETE FROM public."externalWork" WHERE doi = $1 OR doi LIKE $2',
				[doi, `${doi}/%`],
			);
			await pool.query(
				'DELETE FROM public."academicSource" WHERE issn = ANY($1)',
				[[issn, bulkIssn, rollbackIssn]],
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

	it('lists persisted works and exposes a work detail to collaborators', async () => {
		const stored = await pool.query<{ id: string }>(
			'SELECT id FROM public."externalWork" WHERE doi = $1',
			[doi],
		);
		const id = stored.rows[0].id;
		const list = await request(app.getHttpServer())
			.get('/academic-works?perPage=100')
			.set('Authorization', 'Bearer collaborator')
			.expect(200);
		expect(list.body).toMatchObject({ page: 1, perPage: 100 });
		expect(list.body.items).toContainEqual({
			id,
			doi,
			title: 'A scientific article',
			authors: ['Ada Lovelace'],
			abstract: null,
			publicationDate: '2025-06',
			journal: null,
			url: null,
			source: { id: expect.any(String), name: 'Science Journal', issn },
		});
		const detail = await request(app.getHttpServer())
			.get(`/academic-works/${id}`)
			.set('Authorization', 'Bearer collaborator')
			.expect(200);
		expect(detail.body).toEqual(
			expect.objectContaining({
				id,
				doi,
				source: expect.objectContaining({ issn }),
			}),
		);
	});

	it('rejects unauthorized and malformed consultation requests', async () => {
		await request(app.getHttpServer()).get('/academic-works').expect(401);
		await request(app.getHttpServer())
			.get('/academic-works')
			.set('Authorization', 'Bearer user')
			.expect(403);
		await request(app.getHttpServer())
			.get('/academic-works?page=0')
			.set('Authorization', 'Bearer admin')
			.expect(400);
		await request(app.getHttpServer())
			.get('/academic-works/not-a-uuid')
			.set('Authorization', 'Bearer admin')
			.expect(400);
		await request(app.getHttpServer())
			.get(`/academic-works/${randomUUID()}`)
			.set('Authorization', 'Bearer admin')
			.expect(400);
		await request(app.getHttpServer())
			.get('/academic-works/019abcde-f000-7000-8000-000000000099')
			.set('Authorization', 'Bearer admin')
			.expect(404);
	});

	it('imports 1,000 candidates concurrently without duplicating DOIs within or across pages', async () => {
		const works = makeWorks('bulk', 998);
		const candidates = [
			works[0],
			works[0],
			...works.slice(1, 99),
			works[0],
			...works.slice(99),
		];
		sourceSearch.mockImplementation(({ cursor }) => {
			const page = cursor === undefined ? 0 : Number(cursor);
			return Promise.resolve({
				items: candidates.slice(page * 100, (page + 1) * 100),
				nextCursor: String(page + 1),
			});
		});
		const sync = (): request.Test =>
			request(app.getHttpServer())
				.post('/academic-works/sync')
				.set('Authorization', 'Bearer admin')
				.send({ issn: bulkIssn, name: 'Bulk Journal' })
				.expect(201);

		const results = await Promise.all([sync(), sync()]);
		expect(
			results.map(({ body }) => body.imported).sort((a, b) => a - b),
		).toEqual([0, 998]);
		for (const { body } of results) {
			expect(body).toEqual({
				found: 1000,
				imported: body.imported,
				ignored: 1000 - body.imported,
				nextCursor: '10',
			});
		}
		const persisted = await pool.query(
			'SELECT count(*)::int AS count FROM public."externalWork" WHERE doi LIKE $1',
			[`${doi}/bulk/%`],
		);
		expect(persisted.rows).toEqual([{ count: 998 }]);
	});

	it('rolls back the source and earlier batches when a later batch fails', async () => {
		const works = makeWorks('rollback', 101);
		// PostgreSQL rejects null characters in text. The failing item sorts last.
		works[100].title = 'Invalid\u0000title';
		sourceSearch
			.mockResolvedValueOnce({
				items: works.slice(0, 100),
				nextCursor: 'rollback-page',
			})
			.mockResolvedValueOnce({ items: works.slice(100) });
		await request(app.getHttpServer())
			.post('/academic-works/sync')
			.set('Authorization', 'Bearer admin')
			.send({ issn: rollbackIssn, name: 'Rollback Journal' })
			.expect(500);

		const source = await pool.query(
			'SELECT id FROM public."academicSource" WHERE issn = $1',
			[rollbackIssn],
		);
		const stored = await pool.query(
			'SELECT doi FROM public."externalWork" WHERE doi LIKE $1',
			[`${doi}/rollback/%`],
		);
		expect(source.rows).toEqual([]);
		expect(stored.rows).toEqual([]);
	});

	it('documents the sync response and the optional continuation cursor in OpenAPI', () => {
		const document = SwaggerModule.createDocument(
			app,
			new DocumentBuilder().build(),
		);
		expect(
			document.paths['/academic-works/sync']?.post?.responses['201'],
		).toMatchObject({
			content: {
				'application/json': {
					schema: {
						$ref: '#/components/schemas/SyncAcademicWorksResponseDto',
					},
				},
			},
		});
		expect(
			document.components?.schemas?.SyncAcademicWorksResponseDto,
		).toMatchObject({
			required: ['found', 'imported', 'ignored'],
			properties: {
				found: { type: 'integer' },
				imported: { type: 'integer' },
				ignored: { type: 'integer' },
				nextCursor: { type: 'string' },
			},
		});
	});

	it('documents the authenticated consultation contract in OpenAPI', () => {
		const document = SwaggerModule.createDocument(
			app,
			new DocumentBuilder().build(),
		);
		expect(document.paths['/academic-works']?.get?.security).toEqual([
			{ 'firebase-auth': [] },
		]);
		expect(
			document.paths['/academic-works']?.get?.responses['200'],
		).toMatchObject({
			content: {
				'application/json': {
					schema: {
						$ref: '#/components/schemas/AcademicWorkPageModel',
					},
				},
			},
		});
		expect(
			document.paths['/academic-works/{id}']?.get?.responses['200'],
		).toMatchObject({
			content: {
				'application/json': {
					schema: { $ref: '#/components/schemas/AcademicWorkModel' },
				},
			},
		});
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
