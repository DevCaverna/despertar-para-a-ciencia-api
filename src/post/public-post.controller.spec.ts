import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
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
	const validateToken = vi.fn();
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

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [PostController, PublicPostController],
			providers: [
				Reflector,
				{ provide: PostService, useValue: { listPublished } },
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
		listPublished.mockResolvedValue(page);
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
		await client
			.get('/posts/019abcde-f000-7000-8000-000000000002')
			.expect(401);
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
	});
});
