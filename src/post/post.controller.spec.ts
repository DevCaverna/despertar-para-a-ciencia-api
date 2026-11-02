import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
import { PostStatus } from './domain/post-status.js';
import { PostController } from './post.controller.js';
import { PostService } from './post.service.js';

const actor = {
	subject: 'firebase-user',
	id: '019abcde-f000-7000-8000-000000000001',
	email: 'author@example.com',
	roles: [UserRole.COLLABORATOR],
	emailVerified: true,
};
const postId = '019abcde-f000-7000-8000-000000000002';
const draft = {
	id: postId,
	authorId: actor.id,
	title: 'Título',
	content: 'Conteúdo',
	status: PostStatus.DRAFT,
	rejectionReason: null,
	publishedAt: null,
	createdAt: '2026-10-02T12:00:00.000Z',
	updatedAt: '2026-10-02T12:00:00.000Z',
};

describe('PostController', () => {
	let app: INestApplication;
	const createDraft = vi.fn();
	const listDrafts = vi.fn();
	const getDraft = vi.fn();
	const updateDraft = vi.fn();
	const validateToken = vi.fn();

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [PostController],
			providers: [
				Reflector,
				{
					provide: PostService,
					useValue: {
						createDraft,
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
		vi.clearAllMocks();
		validateToken.mockResolvedValue(actor);
		createDraft.mockResolvedValue(draft);
		listDrafts.mockResolvedValue([draft]);
		getDraft.mockResolvedValue(draft);
		updateDraft.mockResolvedValue(draft);
	});

	it('rejects a regular user on every draft route', async () => {
		validateToken.mockResolvedValue({ ...actor, roles: [UserRole.USER] });
		await request(app.getHttpServer() as Server)
			.post('/posts')
			.set('Authorization', 'Bearer valid-token')
			.send({ title: 'Título', content: 'Conteúdo' })
			.expect(403);
		await request(app.getHttpServer() as Server)
			.get('/posts/drafts')
			.set('Authorization', 'Bearer valid-token')
			.expect(403);
		await request(app.getHttpServer() as Server)
			.get(`/posts/${postId}`)
			.set('Authorization', 'Bearer valid-token')
			.expect(403);
		await request(app.getHttpServer() as Server)
			.patch(`/posts/${postId}`)
			.set('Authorization', 'Bearer valid-token')
			.send({ title: 'Novo título' })
			.expect(403);
		expect(createDraft).not.toHaveBeenCalled();
		expect(updateDraft).not.toHaveBeenCalled();
	});

	it('allows an administrator to create a draft', async () => {
		validateToken.mockResolvedValue({ ...actor, roles: [UserRole.ADMIN] });
		await request(app.getHttpServer() as Server)
			.post('/posts')
			.set('Authorization', 'Bearer valid-token')
			.send({ title: 'Título', content: 'Conteúdo' })
			.expect(201);
		expect(createDraft).toHaveBeenCalledOnce();
	});

	it('loads the authenticated author’s drafts', async () => {
		await request(app.getHttpServer() as Server)
			.get('/posts/drafts')
			.set('Authorization', 'Bearer valid-token')
			.expect(200);
		await request(app.getHttpServer() as Server)
			.get(`/posts/${postId}`)
			.set('Authorization', 'Bearer valid-token')
			.expect(200);
		expect(listDrafts).toHaveBeenCalledWith(actor);
		expect(getDraft).toHaveBeenCalledWith(actor, postId);
	});

	afterAll(async () => {
		await app.close();
	});

	it('requires authentication for creating and editing drafts', async () => {
		await request(app.getHttpServer() as Server)
			.post('/posts')
			.send({ title: 'Título', content: 'Conteúdo' })
			.expect(401);
		await request(app.getHttpServer() as Server)
			.patch(`/posts/${postId}`)
			.send({ title: 'Novo título' })
			.expect(401);
		await request(app.getHttpServer() as Server)
			.get('/posts/drafts')
			.expect(401);
		await request(app.getHttpServer() as Server)
			.get(`/posts/${postId}`)
			.expect(401);
		expect(createDraft).not.toHaveBeenCalled();
		expect(updateDraft).not.toHaveBeenCalled();
	});

	it.each(['authorId', 'status', 'publishedAt', 'createdAt', 'updatedAt'])(
		'rejects client-controlled %s on update',
		async (field) => {
			await request(app.getHttpServer() as Server)
				.patch(`/posts/${postId}`)
				.set('Authorization', 'Bearer valid-token')
				.send({ title: 'Título', [field]: 'forged' })
				.expect(400);
			expect(updateDraft).not.toHaveBeenCalled();
		},
	);

	it('creates a draft with the authenticated actor', async () => {
		await request(app.getHttpServer() as Server)
			.post('/posts')
			.set('Authorization', 'Bearer valid-token')
			.send({ title: 'Título', content: 'Conteúdo' })
			.expect(201);
		expect(createDraft).toHaveBeenCalledWith(
			actor,
			expect.objectContaining({ title: 'Título', content: 'Conteúdo' }),
		);
	});

	it('rejects author and status supplied by the client', async () => {
		await request(app.getHttpServer() as Server)
			.post('/posts')
			.set('Authorization', 'Bearer valid-token')
			.send({
				title: 'Título',
				content: 'Conteúdo',
				authorId: 'forged-author',
				status: PostStatus.PUBLISHED,
			})
			.expect(400);
		expect(createDraft).not.toHaveBeenCalled();
	});

	it('routes an authenticated draft update to the service', async () => {
		await request(app.getHttpServer() as Server)
			.patch(`/posts/${postId}`)
			.set('Authorization', 'Bearer valid-token')
			.send({ title: 'Novo título' })
			.expect(200);
		expect(updateDraft).toHaveBeenCalledWith(
			actor,
			postId,
			expect.objectContaining({ title: 'Novo título' }),
		);
	});
});
