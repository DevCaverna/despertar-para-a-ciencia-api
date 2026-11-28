import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { NotFoundException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import { AuthService } from '../auth/application/auth.service.js';
import { UserRole } from '../auth/domain/user-role.js';
import { AuthGuard } from '../auth/presentation/auth.guard.js';
import { PostController } from './post.controller.js';
import { PostService } from './post.service.js';
import { PublicPostController } from './public-post.controller.js';

describe('PublicPostController HTTP', () => {
	let app: INestApplication;
	const listPublished = vi.fn();
	const getPublished = vi.fn();
	const createDraft = vi.fn();
	const listDrafts = vi.fn();
	const getDraft = vi.fn();
	const updateDraft = vi.fn();
	const validateToken = vi.fn();
	const editor = { subject: 'editor', roles: [UserRole.COLLABORATOR] };
	const page = {
		items: [
			{
				id: '019abcde-f000-7000-8000-000000000002',
				title: 'Published',
				publishedAt: '2026-11-18T12:00:00.000Z',
				author: {
					id: '019abcde-f000-7000-8000-000000000001',
					name: 'Author',
				},
			},
		],
		page: 1,
		perPage: 20,
		hasNextPage: false,
	};
	const detail = {
		...page.items[0],
		content: 'Full content',
		academicSource: null,
	};

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [PostController, PublicPostController],
			providers: [
				Reflector,
				{
					provide: PostService,
					useValue: {
						createDraft,
						listPublished,
						getPublished,
						listDrafts,
						getDraft,
						updateDraft,
					},
				},
				{ provide: AuthService, useValue: { validateToken } },
				{ provide: 'APP_GUARD', useClass: AuthGuard },
			],
		}).compile();
		app = module.createNestApplication();
		app.useGlobalPipes(
			new ValidationPipe({
				whitelist: true,
				forbidNonWhitelisted: true,
				transform: true,
			}),
		);
		await app.init();
	});

	beforeEach(() => {
		vi.resetAllMocks();
		listPublished.mockResolvedValue(page);
		getPublished.mockResolvedValue(detail);
		createDraft.mockResolvedValue({});
		validateToken.mockResolvedValue({
			subject: 'reader',
			roles: [UserRole.USER],
		});
	});

	afterAll(async () => {
		await app.close();
	});

	it('allows anonymous access with default pagination and the public response', async () => {
		const response = await request(app.getHttpServer() as Server)
			.get('/posts')
			.expect(200);
		expect(response.body).toEqual(page);
		expect(listPublished).toHaveBeenCalledWith({ page: 1, perPage: 20 });
		expect(validateToken).not.toHaveBeenCalled();
	});

	it.each([
		{ roles: [] },
		{ roles: [UserRole.USER] },
		{ roles: [UserRole.COLLABORATOR] },
		{ roles: [UserRole.ADMIN] },
	])('allows authenticated access with roles %j', async ({ roles }) => {
		validateToken.mockResolvedValue({ subject: 'reader', roles });
		await request(app.getHttpServer() as Server)
			.get('/posts')
			.set('Authorization', 'Bearer valid-token')
			.expect(200);
		expect(validateToken).toHaveBeenCalledWith('valid-token');
	});

	it('transforms valid pagination', async () => {
		await request(app.getHttpServer() as Server)
			.get('/posts?page=2&perPage=100')
			.expect(200);
		expect(listPublished).toHaveBeenCalledWith({ page: 2, perPage: 100 });
	});

	it('routes the public detail without calling authentication or the draft handler', async () => {
		validateToken.mockRejectedValueOnce(new Error('Auth unavailable'));
		await request(app.getHttpServer() as Server)
			.get(`/posts/${detail.id}`)
			.expect(200, detail);
		expect(getPublished).toHaveBeenCalledExactlyOnceWith(detail.id);
		expect(validateToken).not.toHaveBeenCalled();
		expect(getDraft).not.toHaveBeenCalled();
	});

	it.each([UserRole.USER, UserRole.COLLABORATOR, UserRole.ADMIN])(
		'allows a reader with the %s role and no local profile claim',
		async (role) => {
			validateToken.mockResolvedValueOnce({
				subject: 'reader',
				roles: [role],
			});
			await request(app.getHttpServer() as Server)
				.get(`/posts/${detail.id}`)
				.set('Authorization', 'Bearer valid-token')
				.expect(200, detail);
			expect(validateToken).toHaveBeenCalledExactlyOnceWith(
				'valid-token',
			);
			expect(getPublished).toHaveBeenCalledExactlyOnceWith(detail.id);
		},
	);

	it.each(['not-a-uuid', '019abcde-f000-4000-8000-000000000002'])(
		'rejects %s before querying the public detail',
		async (id) => {
			await request(app.getHttpServer() as Server)
				.get(`/posts/${id}`)
				.expect(400);
			expect(getPublished).not.toHaveBeenCalled();
		},
	);

	it('returns 404 without falling back to private lookup for an editor', async () => {
		validateToken.mockResolvedValueOnce(editor);
		getPublished.mockRejectedValueOnce(new NotFoundException());
		await request(app.getHttpServer() as Server)
			.get(`/posts/${detail.id}`)
			.set('Authorization', 'Bearer editor')
			.expect(404);
		expect(getPublished).toHaveBeenCalledExactlyOnceWith(detail.id);
		expect(getDraft).not.toHaveBeenCalled();
	});

	it('routes the static draft list, private draft detail and PATCH to their private handlers', async () => {
		validateToken.mockResolvedValue(editor);
		const draft = { ...detail, status: 'DRAFT' };
		listDrafts.mockResolvedValueOnce([draft]);
		getDraft.mockResolvedValueOnce(draft);
		updateDraft.mockResolvedValueOnce({ ...draft, title: 'Edited' });
		const client = request(app.getHttpServer() as Server);
		await client
			.get('/posts/drafts')
			.set('Authorization', 'Bearer editor')
			.expect(200, [draft]);
		await client
			.get(`/posts/drafts/${detail.id}`)
			.set('Authorization', 'Bearer editor')
			.expect(200, draft);
		await client
			.patch(`/posts/${detail.id}`)
			.set('Authorization', 'Bearer editor')
			.send({ externalWorkId: null })
			.expect(200, { ...draft, title: 'Edited' });
		expect(listDrafts).toHaveBeenCalledExactlyOnceWith(editor, 1, 20);
		expect(getDraft).toHaveBeenCalledExactlyOnceWith(editor, detail.id);
		expect(updateDraft).toHaveBeenCalledExactlyOnceWith(
			editor,
			detail.id,
			expect.objectContaining({ externalWorkId: null }),
		);
		expect(getPublished).not.toHaveBeenCalled();
	});

	it('accepts an optional UUIDv7 source when creating a draft and rejects other UUID versions', async () => {
		validateToken.mockResolvedValue(editor);
		const externalWorkId = '019abcde-f000-7000-8000-000000000003';
		await request(app.getHttpServer() as Server)
			.post('/posts')
			.set('Authorization', 'Bearer editor')
			.send({
				title: 'Derived post',
				content: 'Post content',
				externalWorkId,
			})
			.expect(201);
		expect(createDraft).toHaveBeenCalledExactlyOnceWith(editor, {
			title: 'Derived post',
			content: 'Post content',
			externalWorkId,
		});

		await request(app.getHttpServer() as Server)
			.post('/posts')
			.set('Authorization', 'Bearer editor')
			.send({
				title: 'Derived post',
				content: 'Post content',
				externalWorkId: '019abcde-f000-4000-8000-000000000003',
			})
			.expect(400);
		expect(createDraft).toHaveBeenCalledOnce();
	});

	it.each([
		'page=0',
		'page=-1',
		'page=1.5',
		'page=abc',
		'page=',
		'page=9007199254740992',
		'page=100000000000000000000',
		'page=1e309',
		'perPage=0',
		'perPage=-1',
		'perPage=101',
		'perPage=1.5',
		'perPage=abc',
		'status=DRAFT',
		'authorId=forged',
	])('rejects invalid or client-controlled query %s', async (query) => {
		await request(app.getHttpServer() as Server)
			.get(`/posts?${query}`)
			.expect(400);
		expect(listPublished).not.toHaveBeenCalled();
	});

	it('preserves authentication on all private draft routes', async () => {
		const client = request(app.getHttpServer() as Server);
		await client.get('/posts/drafts').expect(401);
		await client.get(`/posts/drafts/${detail.id}`).expect(401);
		await client.post('/posts').send({}).expect(401);
		await client
			.patch('/posts/019abcde-f000-7000-8000-000000000002')
			.send({})
			.expect(401);
	});

	it('documents pagination and public access without Firebase security', () => {
		const document = SwaggerModule.createDocument(
			app,
			new DocumentBuilder()
				.addBearerAuth(undefined, 'firebase-auth')
				.build(),
		);
		const operation = document.paths['/posts'].get!;
		expect(operation.security ?? []).toEqual([]);
		expect(operation.parameters).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'page',
					in: 'query',
					required: false,
				}),
				expect.objectContaining({
					name: 'perPage',
					in: 'query',
					required: false,
				}),
			]),
		);
		expect(operation.responses).toHaveProperty('200');
		expect(operation.responses).toHaveProperty('400');
		expect(document.paths['/posts'].post?.security).toEqual([
			{ 'firebase-auth': [] },
		]);
		const published = document.paths['/posts/{id}'].get!;
		expect(published.security ?? []).toEqual([]);
		expect(published.parameters).toEqual([
			expect.objectContaining({
				name: 'id',
				in: 'path',
				required: true,
				description: 'Post UUIDv7',
				schema: { type: 'string', format: 'uuid' },
			}),
		]);
		expect(published.responses).toMatchObject({
			200: {
				content: {
					'application/json': {
						schema: {
							$ref: '#/components/schemas/PublishedPostDetailModel',
						},
					},
				},
			},
			400: expect.any(Object),
			404: expect.any(Object),
		});
		expect(
			document.components?.schemas?.PublishedPostDetailModel,
		).toMatchObject({
			required: expect.arrayContaining([
				'id',
				'title',
				'content',
				'publishedAt',
				'author',
				'academicSource',
			]),
			properties: {
				id: { format: 'uuid' },
				content: { type: 'string' },
				publishedAt: { format: 'date-time' },
				author: { nullable: true },
				academicSource: { nullable: true },
			},
		});
		const draft = document.paths['/posts/drafts/{id}'].get!;
		expect(draft.security).toEqual([{ 'firebase-auth': [] }]);
		expect(draft.responses).toMatchObject({
			200: {
				content: {
					'application/json': {
						schema: { $ref: '#/components/schemas/PostModel' },
					},
				},
			},
			401: expect.any(Object),
			403: expect.any(Object),
			409: expect.any(Object),
		});
		expect(document.paths['/posts/drafts'].get?.security).toEqual([
			{ 'firebase-auth': [] },
		]);
		expect(document.paths['/posts/{id}'].patch?.security).toEqual([
			{ 'firebase-auth': [] },
		]);
	});
});
