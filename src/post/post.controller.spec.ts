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
import { AuthGuard } from '../auth/presentation/auth.guard.js';
import { PostStatus } from './domain/post-status.js';
import { PostController } from './post.controller.js';
import { PostService } from './post.service.js';

const actor = {
	subject: 'firebase-user',
	id: '019abcde-f000-7000-8000-000000000001',
	email: 'author@example.com',
	roles: [],
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
	const updateDraft = vi.fn();
	const validateToken = vi.fn();

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [PostController],
			providers: [
				Reflector,
				{
					provide: PostService,
					useValue: { createDraft, updateDraft },
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
		updateDraft.mockResolvedValue(draft);
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
		expect(createDraft).not.toHaveBeenCalled();
		expect(updateDraft).not.toHaveBeenCalled();
	});

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
