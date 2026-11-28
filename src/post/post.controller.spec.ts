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
import { PublicPostController } from './public-post.controller.js';

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
	const submitDraft = vi.fn();
	const listReviewQueue = vi.fn();
	const getReviewQueuePost = vi.fn();
	const decideReview = vi.fn();
	const getPublished = vi.fn();
	const validateToken = vi.fn();

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [PostController, PublicPostController],
			providers: [
				Reflector,
				{
					provide: PostService,
					useValue: {
						createDraft,
						listDrafts,
						getDraft,
						updateDraft,
						submitDraft,
						listReviewQueue,
						getReviewQueuePost,
						decideReview,
						getPublished,
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

	it('submits a collaborator draft and returns an explicit confirmation', async () => {
		const submitted = {
			id: postId,
			status: PostStatus.PENDING_REVIEW,
			updatedAt: draft.updatedAt,
		};
		submitDraft.mockResolvedValue(submitted);
		await request(app.getHttpServer() as Server)
			.post(`/posts/drafts/${postId}/submit`)
			.set('Authorization', 'Bearer valid-token')
			.expect(200, submitted);
		expect(submitDraft).toHaveBeenCalledWith(actor, postId);
	});

	it('routes the static queue only to the private controller and requires ADMIN', async () => {
		const client = request(app.getHttpServer() as Server);
		await client.get('/posts/review-queue').expect(401);
		await client
			.get('/posts/review-queue')
			.set('Authorization', 'Bearer valid-token')
			.expect(403);
		await client
			.get(`/posts/review-queue/${postId}`)
			.set('Authorization', 'Bearer valid-token')
			.expect(403);
		const admin = { ...actor, roles: [UserRole.ADMIN] };
		validateToken.mockResolvedValue(admin);
		listReviewQueue.mockResolvedValue({
			items: [],
			page: 1,
			perPage: 20,
			hasNextPage: false,
		});
		getReviewQueuePost.mockResolvedValue({
			id: postId,
			content: draft.content,
		});
		await client
			.get('/posts/review-queue')
			.set('Authorization', 'Bearer valid-token')
			.expect(200);
		await client
			.get(`/posts/review-queue/${postId}`)
			.set('Authorization', 'Bearer valid-token')
			.expect(200);
		expect(listReviewQueue).toHaveBeenCalledExactlyOnceWith(admin, 1, 20);
		expect(getReviewQueuePost).toHaveBeenCalledExactlyOnceWith(
			admin,
			postId,
		);
		expect(getPublished).not.toHaveBeenCalled();
	});

	it('requires an administrator and accepts only a valid decision status', async () => {
		const client = request(app.getHttpServer() as Server);
		const path = `/posts/review-queue/${postId}/decision`;
		const token = 'Bearer valid-token';
		await client
			.patch(path)
			.send({ status: PostStatus.PUBLISHED })
			.expect(401);
		await client
			.patch(path)
			.set('Authorization', token)
			.send({ status: PostStatus.REJECTED })
			.expect(403);
		const deniedRoleRequests = [[UserRole.USER], []].map((roles) => {
			validateToken.mockResolvedValueOnce({ ...actor, roles });
			return client
				.patch(path)
				.set('Authorization', token)
				.send({ status: PostStatus.REJECTED })
				.expect(403);
		});
		await Promise.all(deniedRoleRequests);

		const admin = { ...actor, roles: [UserRole.ADMIN] };
		validateToken.mockResolvedValue(admin);
		const invalidBodies = [
			{},
			{ status: PostStatus.DRAFT },
			{ status: PostStatus.PENDING_REVIEW },
			{ status: PostStatus.PUBLISHED, publishedAt: draft.updatedAt },
		];
		await Promise.all(
			invalidBodies.map((body) =>
				client
					.patch(path)
					.set('Authorization', token)
					.send(body)
					.expect(400),
			),
		);
		expect(decideReview).not.toHaveBeenCalled();

		const published = {
			...draft,
			status: PostStatus.PUBLISHED,
			publishedAt: draft.updatedAt,
		};
		decideReview.mockResolvedValue(published);
		await client
			.patch(path)
			.set('Authorization', token)
			.send({ status: PostStatus.PUBLISHED })
			.expect(200, published);
		expect(decideReview).toHaveBeenCalledExactlyOnceWith(
			admin,
			postId,
			PostStatus.PUBLISHED,
		);
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
			.get(`/posts/drafts/${postId}`)
			.set('Authorization', 'Bearer valid-token')
			.expect(403);
		await request(app.getHttpServer() as Server)
			.patch(`/posts/${postId}`)
			.set('Authorization', 'Bearer valid-token')
			.send({ title: 'Novo título' })
			.expect(403);
		expect(createDraft).not.toHaveBeenCalled();
		expect(getDraft).not.toHaveBeenCalled();
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
			.get(`/posts/drafts/${postId}`)
			.set('Authorization', 'Bearer valid-token')
			.expect(200);
		expect(listDrafts).toHaveBeenCalledWith(actor, 1, 20);
		expect(getDraft).toHaveBeenCalledWith(actor, postId);
	});

	it('passes the requested page and page size to the service', async () => {
		await request(app.getHttpServer() as Server)
			.get('/posts/drafts?page=2&perPage=100')
			.set('Authorization', 'Bearer valid-token')
			.expect(200, [draft]);
		expect(listDrafts).toHaveBeenCalledWith(actor, 2, 100);
	});

	it.each([
		'page=0',
		'page=1.5',
		'page=abc',
		'page=9007199254740992',
		'perPage=0',
		'perPage=1.5',
		'perPage=101',
	])('rejects invalid draft pagination (%s)', async (query) => {
		await request(app.getHttpServer() as Server)
			.get(`/posts/drafts?${query}`)
			.set('Authorization', 'Bearer valid-token')
			.expect(400);
		expect(listDrafts).not.toHaveBeenCalled();
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
			.get(`/posts/drafts/${postId}`)
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
