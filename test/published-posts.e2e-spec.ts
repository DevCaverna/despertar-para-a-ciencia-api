import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { UserRole } from '../src/auth/domain/user-role.js';
import { PostStatus } from '../src/post/domain/post-status.js';
import type { PublishedPostPageModel } from '../src/post/models/published-post-page.model.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createIsolatedDatabase } from './helpers/isolated-database.helper.js';
import { createTestApp } from './helpers/test-app.helper.js';

describe('Published posts (PostgreSQL e2e)', () => {
	let app: INestApplication;
	let prisma: PrismaService;
	let authorId: string;
	let publishedIds: string[];
	let isolatedDatabase: Awaited<ReturnType<typeof createIsolatedDatabase>>;
	const recentDate = '2026-11-18T12:00:00.000Z';

	beforeAll(async () => {
		isolatedDatabase = await createIsolatedDatabase();
		const context = await createTestApp(isolatedDatabase.url);
		app = context.app;
		prisma = app.get(PrismaService);
		context.mockAuthPort.validateToken.mockResolvedValue({
			subject: 'reader',
			email: 'reader@example.com',
			emailVerified: true,
			roles: [UserRole.USER],
		});
		const author = await prisma.database.orm.public.User.create({
			name: 'Public author',
			email: `posts-${randomUUID()}@example.com`,
		});
		authorId = author.id;
		const posts = await Promise.all(
			[
				{ status: PostStatus.PUBLISHED, publishedAt: recentDate },
				{ status: PostStatus.PUBLISHED, publishedAt: recentDate },
				{
					status: PostStatus.PUBLISHED,
					publishedAt: '2026-11-01T12:00:00.000Z',
				},
				{ status: PostStatus.PUBLISHED, publishedAt: null },
				{ status: PostStatus.DRAFT, publishedAt: recentDate },
				{ status: PostStatus.PENDING_REVIEW, publishedAt: recentDate },
				{ status: PostStatus.REJECTED, publishedAt: recentDate },
			].map((data) =>
				prisma.database.orm.public.Post.create({
					authorId,
					title: 'Post title',
					content: 'Full content must not be exposed',
					rejectionReason: 'Internal information',
					...data,
				}),
			),
		);
		publishedIds = [posts[0].id, posts[1].id].sort().reverse();
		publishedIds.push(posts[2].id);
	}, 60_000);

	afterAll(async () => {
		try {
			await app?.close();
		} finally {
			await isolatedDatabase?.dispose();
		}
	});

	it('returns only dated published posts with a safe public projection and stable date/id ordering', async () => {
		const response = await request(app.getHttpServer() as Server)
			.get('/posts')
			.expect(200);
		const page = response.body as PublishedPostPageModel;
		expect(page).toMatchObject({
			page: 1,
			perPage: 20,
			hasNextPage: false,
		});
		expect(page.items.map((post) => post.id)).toEqual(publishedIds);
		expect(page.items[0]).toEqual({
			id: publishedIds[0],
			title: 'Post title',
			publishedAt: recentDate,
			author: { id: authorId, name: 'Public author' },
		});
		for (const post of page.items) {
			expect(Object.keys(post).sort()).toEqual([
				'author',
				'id',
				'publishedAt',
				'title',
			]);
			expect(Object.keys(post.author!).sort()).toEqual(['id', 'name']);
		}
	});

	it('paginates in PostgreSQL, computes lookahead and accepts authenticated readers', async () => {
		const first = await request(app.getHttpServer() as Server)
			.get('/posts?perPage=2')
			.expect(200);
		expect(first.body.items.map((post: { id: string }) => post.id)).toEqual(
			publishedIds.slice(0, 2),
		);
		expect(first.body.hasNextPage).toBe(true);
		const second = await request(app.getHttpServer() as Server)
			.get('/posts?page=2&perPage=2')
			.set('Authorization', 'Bearer reader')
			.expect(200);
		expect(
			second.body.items.map((post: { id: string }) => post.id),
		).toEqual(publishedIds.slice(2));
		expect(second.body).toMatchObject({
			page: 2,
			perPage: 2,
			hasNextPage: false,
		});
		const empty = await request(app.getHttpServer() as Server)
			.get('/posts?page=3&perPage=2')
			.expect(200);
		expect(empty.body).toEqual({
			items: [],
			page: 3,
			perPage: 2,
			hasNextPage: false,
		});
	});

	it('validates pagination and refuses client-controlled status with the application pipeline', async () => {
		await request(app.getHttpServer() as Server)
			.get('/posts?page=0')
			.expect(400);
		await request(app.getHttpServer() as Server)
			.get('/posts?perPage=101')
			.expect(400);
		await request(app.getHttpServer() as Server)
			.get('/posts?status=DRAFT')
			.expect(400);
		await request(app.getHttpServer() as Server)
			.get('/posts/drafts')
			.expect(401);
	});

	it.each([
		'page=100000000000000000000',
		'page=9007199254740992&perPage=1',
		'page=9007199254740991&perPage=100',
		'page=9007199254740991&perPage=20',
	])(
		'rejects unsafe pagination %s without database errors',
		async (query) => {
			await request(app.getHttpServer() as Server)
				.get(`/posts?${query}`)
				.expect(400);
		},
	);

	it('accepts a safe large offset supported by PostgreSQL', async () => {
		const response = await request(app.getHttpServer() as Server)
			.get('/posts?page=9007199254740991&perPage=1')
			.expect(200);
		expect(response.body).toMatchObject({ items: [], hasNextPage: false });
	});
});
