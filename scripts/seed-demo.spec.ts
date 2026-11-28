import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { PostStatus } from '../src/post/domain/post-status.js';
import type { PrismaDatabase } from '../src/prisma/db.js';
import {
	assertSafeSeedEnvironment,
	DEMO_EXTERNAL_WORKS,
	DEMO_POSTS,
	DEMO_SOURCES,
	DEMO_USERS,
	seedDemoData,
} from './seed-demo.js';

interface StoredRecord {
	id: string;
	[key: string]: unknown;
}

interface MockTable {
	where: (filter: Record<string, unknown>) => {
		first: () => Promise<StoredRecord | null>;
	};
	create: (data: Record<string, unknown>) => Promise<StoredRecord>;
}

function createInMemorySeedDatabase(): PrismaDatabase {
	const tables = {
		User: [] as StoredRecord[],
		AcademicSource: [] as StoredRecord[],
		ExternalWork: [] as StoredRecord[],
		Post: [] as StoredRecord[],
	};

	const makeTable = (name: keyof typeof tables): MockTable => ({
		where: (filter: Record<string, unknown>) => ({
			first: (): Promise<StoredRecord | null> =>
				Promise.resolve(
					tables[name].find((row) =>
						Object.entries(filter).every(
							([key, value]) => row[key] === value,
						),
					) ?? null,
				),
		}),
		create: (data: Record<string, unknown>): Promise<StoredRecord> => {
			const record: StoredRecord = {
				id: randomUUID(),
				...data,
			};
			tables[name].push(record);
			return Promise.resolve(record);
		},
	});

	return {
		orm: {
			public: {
				User: makeTable('User'),
				AcademicSource: makeTable('AcademicSource'),
				ExternalWork: makeTable('ExternalWork'),
				Post: makeTable('Post'),
			},
		},
	} as unknown as PrismaDatabase;
}

describe('seed-demo', () => {
	it('blocks execution in production environments', () => {
		expect(() => assertSafeSeedEnvironment('production')).toThrow(
			'NODE_ENV=production',
		);
		expect(() => assertSafeSeedEnvironment('development')).not.toThrow();
		expect(() => assertSafeSeedEnvironment('test')).not.toThrow();
		expect(() => assertSafeSeedEnvironment(undefined)).not.toThrow();
	});

	it('uses only fictional @example.com emails and covers all post statuses', () => {
		expect(
			DEMO_USERS.every((user) => user.email.endsWith('@example.com')),
		).toBe(true);
		expect(
			DEMO_POSTS.every((post) =>
				post.authorEmail.endsWith('@example.com'),
			),
		).toBe(true);

		const statuses = new Set(DEMO_POSTS.map((post) => post.status));
		expect(statuses).toEqual(
			new Set([
				PostStatus.DRAFT,
				PostStatus.PENDING_REVIEW,
				PostStatus.PUBLISHED,
				PostStatus.REJECTED,
			]),
		);
	});

	it('seeds demo entities and stays idempotent on repeated executions', async () => {
		const database = createInMemorySeedDatabase();

		const firstRun = await seedDemoData(database);
		expect(firstRun).toEqual({
			users: { created: DEMO_USERS.length, skipped: 0 },
			sources: { created: DEMO_SOURCES.length, skipped: 0 },
			externalWorks: { created: DEMO_EXTERNAL_WORKS.length, skipped: 0 },
			posts: { created: DEMO_POSTS.length, skipped: 0 },
		});

		const secondRun = await seedDemoData(database);
		expect(secondRun).toEqual({
			users: { created: 0, skipped: DEMO_USERS.length },
			sources: { created: 0, skipped: DEMO_SOURCES.length },
			externalWorks: { created: 0, skipped: DEMO_EXTERNAL_WORKS.length },
			posts: { created: 0, skipped: DEMO_POSTS.length },
		});
	});
});
