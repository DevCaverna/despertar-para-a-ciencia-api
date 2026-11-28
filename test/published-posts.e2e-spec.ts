import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, type Mock } from 'vitest';

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
	let derivedPostId: string;
	let ownPostId: string;
	let draftId: string;
	let externalWorkId: string;
	let externalWorkDoi: string;
	let nonPublicPosts: { id: string; content: string }[];
	let validateToken: Mock;
	let isolatedDatabase: Awaited<ReturnType<typeof createIsolatedDatabase>>;
	const recentDate = '2026-11-18T12:00:00.000Z';
	const fullContent = 'First paragraph.\n\nSecond paragraph.';

	beforeAll(async () => {
		isolatedDatabase = await createIsolatedDatabase();
		const context = await createTestApp(isolatedDatabase.url);
		app = context.app;
		prisma = app.get(PrismaService);
		validateToken = context.mockAuthPort.validateToken;
		const author = await prisma.database.orm.public.User.create({
			name: 'Public author',
			email: `posts-${randomUUID()}@example.com`,
		});
		authorId = author.id;
		const otherAuthor = await prisma.database.orm.public.User.create({
			name: 'Other author',
			email: `posts-${randomUUID()}@example.com`,
		});
		const academicSource =
			await prisma.database.orm.public.AcademicSource.create({
				name: 'Nature',
				issn: `ISSN-${randomUUID()}`,
			});
		const externalWork =
			await prisma.database.orm.public.ExternalWork.create({
				sourceId: academicSource.id,
				doi: `10.1234/${randomUUID()}`,
				title: 'Original academic work',
				authors: ['Ada Lovelace'],
				journal: 'Nature Communications',
				url: 'https://publisher.example/original-work',
			});
		externalWorkId = externalWork.id;
		externalWorkDoi = externalWork.doi;
		validateToken.mockImplementation((token: string) => {
			const profile = token === 'author' ? author : otherAuthor;
			return {
				subject: token,
				email:
					token === 'reader' ? 'reader@example.com' : profile.email,
				emailVerified: true,
				id: token === 'reader' ? undefined : profile.id,
				roles: [
					token === 'reader' ? UserRole.USER : UserRole.COLLABORATOR,
				],
			};
		});
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
			].map((data, index) =>
				prisma.database.orm.public.Post.create({
					authorId,
					title: 'Post title',
					content:
						index < 3 ? fullContent : `Non-public content ${index}`,
					rejectionReason: 'Internal information',
					...(index === 0 ? { externalWorkId } : {}),
					...data,
				}),
			),
		);
		publishedIds = [posts[0].id, posts[1].id].sort().reverse();
		derivedPostId = posts[0].id;
		ownPostId = posts[1].id;
		publishedIds.push(posts[2].id);
		draftId = posts[4].id;
		nonPublicPosts = posts.slice(3);
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

	it('returns exactly the public detail, including full content, without using authentication', async () => {
		validateToken.mockClear();
		await request(app.getHttpServer() as Server)
			.get(`/posts/${derivedPostId}`)
			.expect(200, {
				id: derivedPostId,
				title: 'Post title',
				content: fullContent,
				publishedAt: recentDate,
				author: { id: authorId, name: 'Public author' },
				academicSource: {
					title: 'Original academic work',
					journal: 'Nature Communications',
					doi: externalWorkDoi,
					url: 'https://publisher.example/original-work',
				},
			});
		expect(validateToken).not.toHaveBeenCalled();
	});

	it('returns no academic source for a post that was not derived from ExternalWork', async () => {
		const response = await request(app.getHttpServer() as Server)
			.get(`/posts/${ownPostId}`)
			.expect(200);
		expect(response.body.academicSource).toBeNull();
	});

	it('returns the same 404 for absent, undated and unpublished posts', async () => {
		const client = request(app.getHttpServer() as Server);
		const missing = await client
			.get('/posts/019abcde-f000-7000-8000-000000000099')
			.expect(404);
		expect(missing.body).toEqual({
			statusCode: 404,
			error: 'Not Found',
			message: 'errors.NOT_FOUND',
		});
		await Promise.all(
			nonPublicPosts.map(async (post) => {
				const response = await client
					.get(`/posts/${post.id}`)
					.expect(404);
				expect(response.body).toEqual(missing.body);
				expect(response.text).not.toContain(post.content);
			}),
		);
		await client
			.get(`/posts/${draftId}?status=DRAFT`)
			.expect(404, missing.body);
		await client.get('/posts/invalid-id').expect(400);
	});

	it('keeps draft detail private and restricted to the owner and draft state', async () => {
		const client = request(app.getHttpServer() as Server);
		const path = `/posts/drafts/${draftId}`;
		await client.get(path).expect(401);
		await client
			.get(path)
			.set('Authorization', 'Bearer reader')
			.expect(403);
		await client
			.get(path)
			.set('Authorization', 'Bearer other-author')
			.expect(403);
		const response = await client
			.get(path)
			.set('Authorization', 'Bearer author')
			.expect(200);
		expect(response.body).toMatchObject({
			id: draftId,
			authorId,
			status: PostStatus.DRAFT,
		});
		await client
			.get(`/posts/${draftId}`)
			.set('Authorization', 'Bearer author')
			.expect(404);
		await client
			.get(`/posts/drafts/${publishedIds[0]}`)
			.set('Authorization', 'Bearer author')
			.expect(409);
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
