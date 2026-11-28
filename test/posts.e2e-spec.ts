import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request, { type Test as HttpRequest } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { UserRole } from '../src/auth/domain/user-role.js';
import { authenticateAs, createTestApp } from './helpers/test-app.helper.js';
import { mockUser } from './mocks/auth.mock.js';

describe('Drafts and editorial review (e2e)', () => {
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	const emails = Array.from(
		{ length: 2 },
		() => `${randomUUID()}@example.com`,
	);
	let app: INestApplication | undefined;
	let authorId: string;
	let otherAuthorId: string;
	let expectedIds: string[];
	let mockAuthPort: Awaited<ReturnType<typeof createTestApp>>['mockAuthPort'];

	beforeAll(async () => {
		const { rows: users } = await pool.query<{ id: string }>(
			'INSERT INTO public.user (name, email) VALUES ($1, $2), ($1, $3) RETURNING id',
			['Draft pagination test', ...emails],
		);
		authorId = users[0].id;
		otherAuthorId = users[1].id;
		const { rows: drafts } = await pool.query<{ id: string }>(
			`INSERT INTO public.post ("authorId", title, content, status, "updatedAt")
			 VALUES ($1, 'older', 'content', 'DRAFT', '2026-10-01T12:00:00Z'),
			        ($1, 'newer', 'content', 'DRAFT', '2026-10-02T12:00:00Z'),
			        ($1, 'same date', 'content', 'DRAFT', '2026-10-02T12:00:00Z'),
			        ($1, 'pending review', 'content', 'PENDING_REVIEW', '2026-10-03T12:00:00Z'),
			        ($2, 'other author', 'content', 'DRAFT', '2026-10-03T12:00:00Z')
			 RETURNING id`,
			[authorId, users[1].id],
		);
		const sameDateIds = [drafts[1].id, drafts[2].id].sort().reverse();
		expectedIds = [...sameDateIds, drafts[0].id];
		const testApp = await createTestApp();
		app = testApp.app;
		mockAuthPort = testApp.mockAuthPort;
		authenticateAs(
			testApp.mockAuthPort,
			mockUser({
				id: authorId,
				email: emails[0],
				roles: [UserRole.COLLABORATOR],
			}),
		);
	});

	afterAll(async () => {
		try {
			await app?.close();
			await pool.query(
				'DELETE FROM public.post WHERE "authorId" IN (SELECT id FROM public.user WHERE email = ANY($1))',
				[emails],
			);
			await pool.query('DELETE FROM public.user WHERE email = ANY($1)', [
				emails,
			]);
		} finally {
			await pool.end();
		}
	});

	it('returns stable, disjoint pages containing only the author’s drafts', async () => {
		const client = request(app!.getHttpServer() as Server);
		const list = (page: number): HttpRequest =>
			client
				.get(`/posts/drafts?page=${page}&perPage=2`)
				.set('Authorization', 'Bearer test-token')
				.expect(200);
		const first = await list(1);
		const second = await list(2);
		const empty = await list(3);

		expect(first.body).toEqual(
			expectedIds
				.slice(0, 2)
				.map((id) => expect.objectContaining({ id })),
		);
		expect(second.body).toEqual([
			expect.objectContaining({ id: expectedIds[2] }),
		]);
		expect(empty.body).toEqual([]);
	});

	it('protects review endpoints and exposes a submitted draft to administrators only', async () => {
		const client = request(app!.getHttpServer() as Server);
		const token = 'Bearer test-token';
		const submit = (id: string): HttpRequest =>
			client
				.post(`/posts/drafts/${id}/submit`)
				.set('Authorization', token);
		const list = '/posts/review-queue';
		const authenticate = (role: UserRole, id = authorId): void => {
			authenticateAs(mockAuthPort, mockUser({ id, roles: [role] }));
		};
		const created = await client
			.post('/posts')
			.set('Authorization', token)
			.send({ title: 'Editorial draft', content: 'Full draft content' })
			.expect(201);
		const id = (created.body as { id: string }).id;
		const detail = `${list}/${id}`;
		await client.post(`/posts/drafts/${id}/submit`).expect(401);
		await client.get(list).expect(401);
		await client.get(detail).expect(401);
		await client.get(list).set('Authorization', token).expect(403);
		await client.get(detail).set('Authorization', token).expect(403);
		authenticate(UserRole.ADMIN, otherAuthorId);
		await submit(id).expect(403);
		await client.get(detail).set('Authorization', token).expect(404);
		authenticate(UserRole.USER);
		await submit(id).expect(403);
		authenticate(UserRole.COLLABORATOR);
		const attempts = await Promise.all([submit(id), submit(id)]);
		expect(
			attempts.map((response) => response.status).sort((a, b) => a - b),
		).toEqual([200, 409]);
		expect(
			attempts.find((response) => response.status === 200)?.body,
		).toEqual({
			id,
			status: 'PENDING_REVIEW',
			updatedAt: expect.any(String),
		});
		await client
			.get(`/posts/drafts/${id}`)
			.set('Authorization', token)
			.expect(409);
		await client.get(`/posts/${id}`).expect(404);
		authenticate(UserRole.ADMIN, otherAuthorId);
		await client
			.get(`${list}?perPage=101`)
			.set('Authorization', token)
			.expect(400);
		const page = await client
			.get(`${list}?perPage=100`)
			.set('Authorization', token)
			.expect(200);
		expect(page.body).toMatchObject({
			page: 1,
			perPage: 100,
			items: expect.arrayContaining([
				{
					id,
					title: 'Editorial draft',
					status: 'PENDING_REVIEW',
					updatedAt: expect.any(String),
					author: { id: authorId, name: 'Draft pagination test' },
				},
			]),
		});
		const result = await client
			.get(detail)
			.set('Authorization', token)
			.expect(200);
		expect(result.body).toEqual({
			id,
			title: 'Editorial draft',
			status: 'PENDING_REVIEW',
			content: 'Full draft content',
			externalWork: null,
			createdAt: expect.any(String),
			updatedAt: expect.any(String),
			author: { id: authorId, name: 'Draft pagination test' },
		});
	});

	it('persists only one final decision and exposes only approved posts publicly', async () => {
		const client = request(app!.getHttpServer() as Server);
		const token = 'Bearer test-token';
		const create = async (submit = true): Promise<string> => {
			authenticateAs(
				mockAuthPort,
				mockUser({ id: authorId, roles: [UserRole.COLLABORATOR] }),
			);
			const response = await client
				.post('/posts')
				.set('Authorization', token)
				.send({
					title: 'Post for editorial decision',
					content: 'Review this content.',
				})
				.expect(201);
			const id = (response.body as { id: string }).id;
			if (submit) {
				await client
					.post(`/posts/drafts/${id}/submit`)
					.set('Authorization', token)
					.expect(200);
			}
			return id;
		};
		const decide = (
			id: string,
			status: 'PUBLISHED' | 'REJECTED',
		): HttpRequest =>
			client
				.patch(`/posts/review-queue/${id}/decision`)
				.set('Authorization', token)
				.send({ status });

		const draft = await create(false);
		const toApprove = await create();
		const toReject = await create();
		const contested = await create();
		await decide(toReject, 'REJECTED').expect(403);

		authenticateAs(
			mockAuthPort,
			mockUser({ id: otherAuthorId, roles: [UserRole.ADMIN] }),
		);
		await decide(draft, 'PUBLISHED').expect(409);
		const approved = await decide(toApprove, 'PUBLISHED').expect(200);
		const { publishedAt } = approved.body as { publishedAt: string };
		expect(approved.body).toMatchObject({
			id: toApprove,
			status: 'PUBLISHED',
			publishedAt: expect.any(String),
		});
		const publishedDate = new Date(publishedAt).toISOString();
		await decide(toApprove, 'REJECTED').expect(409);
		await client
			.get(`/posts/${toApprove}`)
			.expect(200)
			.expect((response) => {
				expect(response.body).toMatchObject({
					id: toApprove,
					publishedAt: publishedDate,
				});
			});
		await client
			.get(`/posts/review-queue/${toApprove}`)
			.set('Authorization', token)
			.expect(404);

		const rejected = await decide(toReject, 'REJECTED').expect(200);
		expect(rejected.body).toMatchObject({
			id: toReject,
			status: 'REJECTED',
			publishedAt: null,
		});
		await decide(toReject, 'PUBLISHED').expect(409);
		await client.get(`/posts/${toReject}`).expect(404);

		const decisions = await Promise.all([
			decide(contested, 'PUBLISHED'),
			decide(contested, 'REJECTED'),
		]);
		expect(
			decisions.map(({ status }) => status).sort((a, b) => a - b),
		).toEqual([200, 409]);
		const winner = decisions.find(({ status }) => status === 200)!.body as {
			status: string;
		};
		const { rows } = await pool.query<{ status: string }>(
			'SELECT status FROM public.post WHERE id = $1',
			[contested],
		);
		expect(rows[0].status).toBe(winner.status);
	});
});
