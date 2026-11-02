import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockUser } from '../../test/mocks/auth.mock.js';
import { UserRole } from '../auth/domain/user-role.js';
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
	const actor = mockUser({ id: authorId, roles: [UserRole.COLLABORATOR] });
	let create: ReturnType<typeof vi.fn>;
	let first: ReturnType<typeof vi.fn>;
	let update: ReturnType<typeof vi.fn>;
	let where: ReturnType<typeof vi.fn>;
	let all: ReturnType<typeof vi.fn>;
	let getProfile: ReturnType<typeof vi.fn>;
	let service: PostService;

	beforeEach(() => {
		create = vi.fn();
		first = vi.fn();
		update = vi.fn();
		all = vi.fn(() => [draft]);
		where = vi.fn(() => ({ update, orderBy: () => ({ all }) }));
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

	it('allows an administrator to create a draft', async () => {
		create.mockResolvedValue(draft);
		await expect(
			service.createDraft(
				mockUser({ id: authorId, roles: [UserRole.ADMIN] }),
				{
					title: draft.title,
					content: draft.content,
				},
			),
		).resolves.toEqual(draft);
	});

	it('rejects a regular user before writing a draft', async () => {
		await expect(
			service.createDraft(
				mockUser({ id: authorId, roles: [UserRole.USER] }),
				{
					title: draft.title,
					content: draft.content,
				},
			),
		).rejects.toBeInstanceOf(ForbiddenException);
		expect(getProfile).not.toHaveBeenCalled();
		expect(create).not.toHaveBeenCalled();
	});

	it('lists only the authenticated author’s drafts', async () => {
		await expect(service.listDrafts(actor)).resolves.toEqual([draft]);
		expect(where).toHaveBeenCalledWith({
			authorId,
			status: PostStatus.DRAFT,
		});
	});

	it('loads only an owned draft for editing', async () => {
		first.mockResolvedValue(draft);
		await expect(service.getDraft(actor, postId)).resolves.toEqual(draft);
		first.mockResolvedValueOnce({ ...draft, authorId: 'other-author' });
		await expect(service.getDraft(actor, postId)).rejects.toBeInstanceOf(
			ForbiddenException,
		);
		first.mockResolvedValueOnce({ ...draft, status: PostStatus.PUBLISHED });
		await expect(service.getDraft(actor, postId)).rejects.toBeInstanceOf(
			ConflictException,
		);
	});

	it('does not allow a regular user to edit a draft', async () => {
		await expect(
			service.updateDraft(mockUser({ roles: [UserRole.USER] }), postId, {
				title: 'Alteração',
			}),
		).rejects.toBeInstanceOf(ForbiddenException);
		expect(first).not.toHaveBeenCalled();
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

	it.each([UserRole.COLLABORATOR, UserRole.ADMIN])(
		'rejects %s editing another author’s draft',
		async (role) => {
			first.mockResolvedValue({ ...draft, authorId: 'another-author' });

			await expect(
				service.updateDraft({ ...actor, roles: [role] }, postId, {
					content: 'Alteração',
				}),
			).rejects.toBeInstanceOf(ForbiddenException);
			expect(where).not.toHaveBeenCalled();
		},
	);

	it.each([
		PostStatus.PENDING_REVIEW,
		PostStatus.PUBLISHED,
		PostStatus.REJECTED,
	])('rejects editing a %s post', async (status) => {
		first.mockResolvedValue({
			...draft,
			status,
		});

		await expect(
			service.updateDraft(actor, postId, { content: 'Alteração' }),
		).rejects.toBeInstanceOf(ConflictException);
		expect(where).not.toHaveBeenCalled();
	});

	it('rejects an inactive profile on all draft operations', async () => {
		getProfile.mockRejectedValue(new ForbiddenException());
		await expect(service.listDrafts(actor)).rejects.toBeInstanceOf(
			ForbiddenException,
		);
		await expect(service.getDraft(actor, postId)).rejects.toBeInstanceOf(
			ForbiddenException,
		);
		await expect(
			service.updateDraft(actor, postId, { title: 'Alteração' }),
		).rejects.toBeInstanceOf(ForbiddenException);
		expect(first).not.toHaveBeenCalled();
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
