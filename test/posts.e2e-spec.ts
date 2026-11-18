import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request, { type Test as HttpRequest } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { UserRole } from '../src/auth/domain/user-role.js';
import { authenticateAs, createTestApp } from './helpers/test-app.helper.js';
import { mockUser } from './mocks/auth.mock.js';

describe('Draft pagination (e2e)', () => {
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	const emails = Array.from(
		{ length: 2 },
		() => `${randomUUID()}@example.com`,
	);
	let app: INestApplication | undefined;
	let authorId: string;
	let expectedIds: string[];

	beforeAll(async () => {
		const { rows: users } = await pool.query<{ id: string }>(
			'INSERT INTO public.user (name, email) VALUES ($1, $2), ($1, $3) RETURNING id',
			['Draft pagination test', ...emails],
		);
		authorId = users[0].id;
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
});
