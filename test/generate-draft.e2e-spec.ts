import { randomInt, randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
	AI_DRAFT_GENERATOR_PORT,
	AiProviderError,
	type AiDraftGeneratorPort,
} from '../src/ai/domain/ai-draft-generator.port.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_PORT } from '../src/auth/domain/auth.port.js';
import { UserRole } from '../src/auth/domain/user-role.js';
import { configureApplication } from '../src/bootstrap.js';

describe('AI draft generation from ExternalWork (e2e)', () => {
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	const email = `ai-draft-${randomUUID()}@example.com`;
	const issn = String(randomInt(0, 99_999_999)).padStart(8, '0');
	const dois = [
		`10.1234/${randomUUID()}-with-abstract`,
		`10.1234/${randomUUID()}-no-abstract`,
		`10.1234/${randomUUID()}-ai-failure`,
		`10.1234/${randomUUID()}-concurrent`,
	];

	let app: NestExpressApplication | undefined;
	let authorId: string;
	let sourceId: string;
	let workWithAbstractId: string;
	let workWithoutAbstractId: string;
	let workForFailureId: string;
	let workForConcurrencyId: string;

	const generateDraft = vi.fn<AiDraftGeneratorPort['generateDraft']>();

	beforeAll(async () => {
		const { rows: users } = await pool.query<{ id: string }>(
			'INSERT INTO public.user (name, email) VALUES ($1, $2) RETURNING id',
			['AI Draft Author', email],
		);
		authorId = users[0].id;

		const { rows: sources } = await pool.query<{ id: string }>(
			'INSERT INTO public."academicSource" (name, issn) VALUES ($1, $2) RETURNING id',
			['AI Test Journal', issn],
		);
		sourceId = sources[0].id;

		const { rows: works } = await pool.query<{ id: string }>(
			`INSERT INTO public."externalWork" ("sourceId", doi, title, authors, abstract)
			 VALUES ($1, $2, 'Work with abstract', ARRAY['Ada Lovelace'], 'Detailed scientific abstract.'),
			        ($1, $3, 'Work without abstract', ARRAY['Grace Hopper'], NULL),
			        ($1, $4, 'Work for failure', ARRAY['Alan Turing'], 'Abstract for timeout scenario.'),
			        ($1, $5, 'Work for concurrency', ARRAY['Katherine Johnson'], 'Abstract for concurrent requests.')
			 RETURNING id`,
			[sourceId, dois[0], dois[1], dois[2], dois[3]],
		);
		workWithAbstractId = works[0].id;
		workWithoutAbstractId = works[1].id;
		workForFailureId = works[2].id;
		workForConcurrencyId = works[3].id;

		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(AUTH_PORT)
			.useValue({
				validateToken: vi.fn((token: string) =>
					Promise.resolve({
						subject: 'firebase-ai-draft-author',
						id: authorId,
						email,
						emailVerified: true,
						roles: [
							token === 'user'
								? UserRole.USER
								: UserRole.COLLABORATOR,
						],
					}),
				),
			})
			.overrideProvider(AI_DRAFT_GENERATOR_PORT)
			.useValue({ generateDraft })
			.compile();

		app = module.createNestApplication<NestExpressApplication>();
		await configureApplication(app);
	});

	afterAll(async () => {
		try {
			await app?.close();
			if (authorId) {
				await pool.query(
					'DELETE FROM public.post WHERE "authorId" = $1',
					[authorId],
				);
			}
			if (sourceId) {
				await pool.query(
					'DELETE FROM public."externalWork" WHERE "sourceId" = $1',
					[sourceId],
				);
				await pool.query(
					'DELETE FROM public."academicSource" WHERE id = $1',
					[sourceId],
				);
			}
			if (authorId) {
				await pool.query('DELETE FROM public.user WHERE id = $1', [
					authorId,
				]);
			}
		} finally {
			await pool.end();
		}
	});

	it('generates a linked DRAFT post, prevents duplicates, and allows normal draft editing', async () => {
		generateDraft.mockResolvedValueOnce({
			title: 'Divulgação científica gerada',
			content: 'Texto inicial do rascunho gerado.',
		});

		const server = app!.getHttpServer();
		const created = await request(server)
			.post('/posts/from-academic-work')
			.set('Authorization', 'Bearer collaborator')
			.send({ externalWorkId: workWithAbstractId })
			.expect(201);

		expect(created.body).toMatchObject({
			authorId,
			externalWorkId: workWithAbstractId,
			title: 'Divulgação científica gerada',
			content: 'Texto inicial do rascunho gerado.',
			status: 'DRAFT',
		});

		const postId = created.body.id as string;

		await request(server)
			.get(`/posts/drafts/${postId}`)
			.set('Authorization', 'Bearer collaborator')
			.expect(200)
			.expect(({ body }) => {
				expect(body).toMatchObject({
					id: postId,
					externalWorkId: workWithAbstractId,
					status: 'DRAFT',
				});
			});

		await request(server)
			.patch(`/posts/${postId}`)
			.set('Authorization', 'Bearer collaborator')
			.send({ title: 'Título revisado pelo colaborador' })
			.expect(200)
			.expect(({ body }) => {
				expect(body.title).toBe('Título revisado pelo colaborador');
			});

		const callsBeforeDuplicate = generateDraft.mock.calls.length;
		await request(server)
			.post('/posts/from-academic-work')
			.set('Authorization', 'Bearer collaborator')
			.send({ externalWorkId: workWithAbstractId })
			.expect(409);
		expect(generateDraft).toHaveBeenCalledTimes(callsBeforeDuplicate);

		const { rows } = await pool.query<{ count: string }>(
			'SELECT count(*)::text AS count FROM public.post WHERE "externalWorkId" = $1',
			[workWithAbstractId],
		);
		expect(rows[0].count).toBe('1');
	});

	it('rejects works without abstract and leaves no partial post on AI failure', async () => {
		const server = app!.getHttpServer();
		const callsBeforeMissingAbstract = generateDraft.mock.calls.length;

		await request(server)
			.post('/posts/from-academic-work')
			.set('Authorization', 'Bearer collaborator')
			.send({ externalWorkId: workWithoutAbstractId })
			.expect(422);
		expect(generateDraft).toHaveBeenCalledTimes(callsBeforeMissingAbstract);

		generateDraft.mockRejectedValueOnce(new AiProviderError('timeout'));
		await request(server)
			.post('/posts/from-academic-work')
			.set('Authorization', 'Bearer collaborator')
			.send({ externalWorkId: workForFailureId })
			.expect(503);

		const { rows } = await pool.query<{ count: string }>(
			'SELECT count(*)::text AS count FROM public.post WHERE "externalWorkId" = $1',
			[workForFailureId],
		);
		expect(rows[0].count).toBe('0');
	});

	it('handles concurrent generation requests for the same ExternalWork without duplicating posts', async () => {
		const server = app!.getHttpServer();
		let arrived = 0;
		let releaseBarrier!: () => void;
		const barrier = new Promise<void>((resolve) => {
			releaseBarrier = resolve;
		});

		generateDraft.mockImplementation(async () => {
			arrived += 1;
			if (arrived === 2) releaseBarrier();
			await barrier;
			return {
				title: 'Rascunho concorrente',
				content: 'Conteúdo gerado em corrida concorrente.',
			};
		});

		const [firstResponse, secondResponse] = await Promise.all([
			request(server)
				.post('/posts/from-academic-work')
				.set('Authorization', 'Bearer collaborator')
				.send({ externalWorkId: workForConcurrencyId }),
			request(server)
				.post('/posts/from-academic-work')
				.set('Authorization', 'Bearer collaborator')
				.send({ externalWorkId: workForConcurrencyId }),
		]);

		expect(
			[firstResponse.status, secondResponse.status].sort((a, b) => a - b),
		).toEqual([201, 409]);

		const { rows } = await pool.query<{ count: string }>(
			'SELECT count(*)::text AS count FROM public.post WHERE "externalWorkId" = $1',
			[workForConcurrencyId],
		);
		expect(rows[0].count).toBe('1');
	});

	it('documents POST /posts/from-academic-work in OpenAPI', () => {
		const document = SwaggerModule.createDocument(
			app!,
			new DocumentBuilder().build(),
		);
		expect(
			document.paths['/posts/from-academic-work']?.post?.responses['201'],
		).toMatchObject({
			content: {
				'application/json': {
					schema: { $ref: '#/components/schemas/PostModel' },
				},
			},
		});
	});
});
