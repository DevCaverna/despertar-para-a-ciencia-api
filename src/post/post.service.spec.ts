import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockUser } from '../../test/mocks/auth.mock.js';
import { PostStatus } from './domain/post-status.js';
import type { Post } from './domain/post.js';
import { PostService } from './post.service.js';

const authorId = '019abcde-f000-7000-8000-000000000001';
const postId = '019abcde-f000-7000-8000-000000000002';
const draft: Post = {
	id: postId,
	authorId,
	title: 'Título original',
	content: 'Conteúdo original',
	status: PostStatus.DRAFT,
	rejectionReason: null,
	publishedAt: null,
	createdAt: '2026-10-02T12:00:00.000Z',
	updatedAt: '2026-10-02T12:00:00.000Z',
};

describe('PostService', () => {
	const actor = mockUser({ id: authorId });
	let create: ReturnType<typeof vi.fn>;
	let first: ReturnType<typeof vi.fn>;
	let update: ReturnType<typeof vi.fn>;
	let where: ReturnType<typeof vi.fn>;
	let getProfile: ReturnType<typeof vi.fn>;
	let service: PostService;

	beforeEach(() => {
		create = vi.fn();
		first = vi.fn();
		update = vi.fn();
		where = vi.fn(() => ({ update }));
		getProfile = vi.fn().mockResolvedValue({ id: authorId, active: true });
		service = new PostService(
			{
				database: {
					orm: { public: { Post: { create, first, where } } },
				},
			} as never,
			{ getProfile } as never,
			{ t: vi.fn((key: string) => key) } as never,
		);
	});

	it('creates a draft using the authenticated local profile as author', async () => {
		create.mockResolvedValue(draft);
		const body = {
			title: draft.title,
			content: draft.content,
			authorId: 'forged-author',
			status: PostStatus.PUBLISHED,
		};

		await expect(service.createDraft(actor, body)).resolves.toEqual(draft);
		expect(getProfile).toHaveBeenCalledWith(actor);
		expect(create).toHaveBeenCalledWith({
			authorId,
			title: draft.title,
			content: draft.content,
			status: PostStatus.DRAFT,
		});
	});

	it('does not create a post without an active local profile', async () => {
		getProfile.mockRejectedValue(new ForbiddenException());

		await expect(
			service.createDraft(actor, {
				title: 'Título',
				content: 'Conteúdo',
			}),
		).rejects.toBeInstanceOf(ForbiddenException);
		expect(create).not.toHaveBeenCalled();
	});

	it('updates only supplied fields of an owned draft', async () => {
		first.mockResolvedValue(draft);
		update.mockResolvedValue({ ...draft, title: 'Novo título' });

		await expect(
			service.updateDraft(actor, postId, { title: 'Novo título' }),
		).resolves.toMatchObject({ title: 'Novo título' });
		expect(where).toHaveBeenCalledWith({
			id: postId,
			authorId,
			status: PostStatus.DRAFT,
		});
		expect(update).toHaveBeenCalledWith({
			title: 'Novo título',
			updatedAt: expect.any(String),
		});
	});

	it('rejects editing another author’s draft', async () => {
		first.mockResolvedValue({ ...draft, authorId: 'another-author' });

		await expect(
			service.updateDraft(actor, postId, { content: 'Alteração' }),
		).rejects.toBeInstanceOf(ForbiddenException);
		expect(where).not.toHaveBeenCalled();
	});

	it('rejects editing a post that is no longer a draft', async () => {
		first.mockResolvedValue({
			...draft,
			status: PostStatus.PENDING_REVIEW,
		});

		await expect(
			service.updateDraft(actor, postId, { content: 'Alteração' }),
		).rejects.toBeInstanceOf(ConflictException);
		expect(where).not.toHaveBeenCalled();
	});

	it('rejects a status change between the ownership check and update', async () => {
		first.mockResolvedValue(draft);
		update.mockResolvedValue(null);

		await expect(
			service.updateDraft(actor, postId, { content: 'Alteração' }),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it('rejects missing posts and empty updates', async () => {
		first.mockResolvedValue(null);
		await expect(
			service.updateDraft(actor, postId, { title: 'Novo título' }),
		).rejects.toBeInstanceOf(NotFoundException);
		await expect(
			service.updateDraft(actor, postId, {}),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(where).not.toHaveBeenCalled();
	});
});
