import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PostStatus } from './domain/post-status.js';
import { PostService } from './post.service.js';

const post = {
	id: '019abcde-f000-7000-8000-000000000002',
	title: 'Published',
	publishedAt: '2026-11-18T12:00:00.000Z',
	content: 'Private full content',
	status: PostStatus.PUBLISHED,
	rejectionReason: 'Internal',
	authorId: 'author-id',
	createdAt: '2026-11-01T00:00:00.000Z',
	updatedAt: '2026-11-18T12:00:00.000Z',
	author: {
		id: 'author-id',
		name: 'Author',
		email: 'private@example.com',
		active: true,
	},
};

describe('PostService.listPublished', () => {
	const query = {
		where: vi.fn(),
		orderBy: vi.fn(),
		offset: vi.fn(),
		limit: vi.fn(),
		select: vi.fn(),
		include: vi.fn(),
		all: vi.fn(),
	};
	let service: PostService;

	beforeEach(() => {
		vi.resetAllMocks();
		for (const method of [
			'where',
			'orderBy',
			'offset',
			'limit',
			'select',
			'include',
		] as const) {
			query[method].mockReturnValue(query);
		}
		query.all.mockReturnValue([post]);
		service = new PostService(
			{ database: { orm: { public: { Post: query } } } } as never,
			{} as never,
			{} as never,
		);
	});

	it('fixes the status, excludes missing dates, orders deterministically and projects in the database', async () => {
		await service.listPublished({ page: 1, perPage: 20 });
		expect(query.where).toHaveBeenNthCalledWith(1, {
			status: PostStatus.PUBLISHED,
		});
		const isNotNull = vi.fn().mockReturnValue('not-null');
		expect(
			query.where.mock.calls[1][0]({ publishedAt: { isNotNull } }),
		).toBe('not-null');
		expect(isNotNull).toHaveBeenCalledOnce();
		const orders = query.orderBy.mock.calls[0][0] as Array<
			(model: unknown) => unknown
		>;
		const fields = {
			publishedAt: { desc: () => 'date-desc' },
			id: { desc: () => 'id-desc' },
		};
		expect(orders.map((order) => order(fields))).toEqual([
			'date-desc',
			'id-desc',
		]);
		expect(query.select).toHaveBeenCalledWith('id', 'title', 'publishedAt');
		expect(query.include).toHaveBeenCalledOnce();
		expect(query.include.mock.calls[0][0]).toBe('author');
		const select = vi.fn();
		query.include.mock.calls[0][1]({ select });
		expect(select).toHaveBeenCalledWith('id', 'name');
		expect(query.all).toHaveBeenCalledOnce();
	});

	it('only returns public post and author fields even if persistence returns extra fields', async () => {
		expect(await service.listPublished({ page: 1, perPage: 20 })).toEqual({
			items: [
				{
					id: post.id,
					title: post.title,
					publishedAt: post.publishedAt,
					author: { id: post.author.id, name: post.author.name },
				},
			],
			page: 1,
			perPage: 20,
			hasNextPage: false,
		});
		expect(query.offset).toHaveBeenCalledWith(0);
		expect(query.limit).toHaveBeenCalledWith(21);
	});

	it.each([1, 2, 3])(
		'applies database pagination for page %s and removes the lookahead row',
		async (page) => {
			query.all.mockReturnValue([
				post,
				{ ...post, id: 'next' },
				{ ...post, id: 'lookahead' },
			]);
			const result = await service.listPublished({ page, perPage: 2 });
			expect(query.offset).toHaveBeenCalledWith((page - 1) * 2);
			expect(query.limit).toHaveBeenCalledWith(3);
			expect(result.items.map((item) => item.id)).toEqual([
				post.id,
				'next',
			]);
			expect(result).toMatchObject({
				page,
				perPage: 2,
				hasNextPage: true,
			});
		},
	);

	it('does not advertise a next page when the page is exactly full', async () => {
		const result = await service.listPublished({ page: 1, perPage: 1 });
		expect(result.items).toHaveLength(1);
		expect(result.hasNextPage).toBe(false);
	});

	it('returns a valid empty page', async () => {
		query.all.mockReturnValue([]);
		expect(await service.listPublished({ page: 4, perPage: 20 })).toEqual({
			items: [],
			page: 4,
			perPage: 20,
			hasNextPage: false,
		});
	});

	it.each([20, 100])(
		'rejects an unsafe computed offset with perPage %s before querying',
		async (perPage) => {
			await expect(
				service.listPublished({
					page: Number.MAX_SAFE_INTEGER,
					perPage,
				}),
			).rejects.toBeInstanceOf(BadRequestException);
			expect(query.where).not.toHaveBeenCalled();
		},
	);

	it.each([1, 20, 100])(
		'accepts the largest safe page for perPage %s without an arbitrary page cap',
		async (perPage) => {
			const page =
				Math.floor(Number.MAX_SAFE_INTEGER / perPage) +
				(perPage === 1 ? 0 : 1);
			query.all.mockReturnValue([]);
			await expect(
				service.listPublished({ page, perPage }),
			).resolves.toMatchObject({ items: [] });
			expect(query.offset).toHaveBeenCalledWith((page - 1) * perPage);
		},
	);

	it('normalizes the PostgreSQL timestamp representation to ISO 8601', async () => {
		query.all.mockReturnValue([
			{ ...post, publishedAt: '2026-11-18 09:00:00-03' },
		]);
		const result = await service.listPublished({ page: 1, perPage: 20 });
		expect(result.items[0].publishedAt).toBe('2026-11-18T12:00:00.000Z');
	});

	it('supports unavailable author information without exposing internal data', async () => {
		query.all.mockReturnValue([{ ...post, author: null }]);
		const result = await service.listPublished({ page: 1, perPage: 20 });
		expect(result.items[0].author).toBeNull();
	});
});
