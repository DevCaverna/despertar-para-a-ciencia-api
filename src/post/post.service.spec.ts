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
	let reviewFirst: ReturnType<typeof vi.fn>;
	let workFirst: ReturnType<typeof vi.fn>;
	let workWhere: ReturnType<typeof vi.fn>;
	let updateAll: ReturnType<typeof vi.fn>;
	let where: ReturnType<typeof vi.fn>;
	let offset: ReturnType<typeof vi.fn>;
	let limit: ReturnType<typeof vi.fn>;
	let all: ReturnType<typeof vi.fn>;
	let getProfile: ReturnType<typeof vi.fn>;
	let service: PostService;

	beforeEach(() => {
		create = vi.fn();
		first = vi.fn();
		reviewFirst = vi.fn();
		workFirst = vi.fn();
		workWhere = vi.fn(() => ({ select: () => ({ first: workFirst }) }));
		updateAll = vi.fn();
		all = vi.fn(() => [draft]);
		limit = vi.fn(() => ({ all }));
		offset = vi.fn(() => ({ limit }));
		where = vi.fn(() => ({
			updateAll,
			orderBy: () => ({ offset }),
			include: () => ({ first: reviewFirst }),
		}));
		getProfile = vi.fn().mockResolvedValue({ id: authorId, active: true });
		service = new PostService(
			{
				database: {
					orm: {
						public: {
							Post: { create, first, where },
							ExternalWork: { where: workWhere },
						},
					},
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

	it('submits only the validated draft content and returns confirmation', async () => {
		first.mockResolvedValue(draft);
		updateAll.mockResolvedValue([
			{ ...draft, status: PostStatus.PENDING_REVIEW },
		]);
		await expect(service.submitDraft(actor, postId)).resolves.toEqual({
			id: postId,
			status: PostStatus.PENDING_REVIEW,
			updatedAt: draft.updatedAt,
		});
		expect(where).toHaveBeenCalledWith({
			id: postId,
			authorId,
			status: PostStatus.DRAFT,
			title: draft.title,
			content: draft.content,
		});
		expect(updateAll).toHaveBeenCalledWith({
			status: PostStatus.PENDING_REVIEW,
			updatedAt: expect.any(String),
		});
	});

	it('returns only the linked academic work metadata in the protected review detail', async () => {
		const admin = mockUser({ roles: [UserRole.ADMIN] });
		const work = {
			id: '019abcde-f000-7000-8000-000000000003',
			title: 'Original academic work',
			authors: ['Emmy Noether'],
			journal: 'Academic Review',
			publicationDate: '2026-09',
			abstract: 'Original abstract.',
			doi: '10.1234/example',
			url: 'https://example.org/article',
		};
		reviewFirst.mockResolvedValue({
			...draft,
			status: PostStatus.PENDING_REVIEW,
			author: null,
			externalWorkId: work.id,
		});
		workFirst.mockResolvedValue(work);

		await expect(
			service.getReviewQueuePost(admin, postId),
		).resolves.toEqual({
			id: postId,
			title: draft.title,
			content: draft.content,
			createdAt: draft.createdAt,
			updatedAt: draft.updatedAt,
			author: null,
			status: PostStatus.PENDING_REVIEW,
			externalWork: work,
		});
		expect(where).toHaveBeenCalledExactlyOnceWith({
			id: postId,
			status: PostStatus.PENDING_REVIEW,
		});
		expect(workWhere).toHaveBeenCalledExactlyOnceWith({ id: work.id });
	});

	it.each([PostStatus.PUBLISHED, PostStatus.REJECTED])(
		'atomically limits a %s decision to a pending post and sets its date',
		async (status) => {
			const admin = mockUser({ roles: [UserRole.ADMIN] });
			updateAll.mockImplementation((changes: Partial<Post>) => [
				{ ...draft, ...changes },
			]);
			const updated = await service.decideReview(admin, postId, status);
			expect(getProfile).toHaveBeenCalledWith(admin);
			expect(where).toHaveBeenCalledExactlyOnceWith({
				id: postId,
				status: PostStatus.PENDING_REVIEW,
			});
			expect(updateAll).toHaveBeenCalledExactlyOnceWith({
				status,
				updatedAt: expect.any(String),
				publishedAt:
					status === PostStatus.PUBLISHED ? updated.updatedAt : null,
			});
			expect(updated.status).toBe(status);
		},
	);

	it('requires an administrator with an active profile before a decision', async () => {
		await expect(
			service.decideReview(actor, postId, PostStatus.PUBLISHED),
		).rejects.toBeInstanceOf(ForbiddenException);
		expect(getProfile).not.toHaveBeenCalled();

		getProfile.mockRejectedValue(new ForbiddenException());
		await expect(
			service.decideReview(
				mockUser({ roles: [UserRole.ADMIN] }),
				postId,
				PostStatus.REJECTED,
			),
		).rejects.toBeInstanceOf(ForbiddenException);
		expect(where).not.toHaveBeenCalled();
	});

	it('distinguishes a missing post from a post already decided', async () => {
		const admin = mockUser({ roles: [UserRole.ADMIN] });
		updateAll.mockResolvedValue([]);
		first
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ ...draft, status: PostStatus.PUBLISHED });
		await expect(
			service.decideReview(admin, postId, PostStatus.REJECTED),
		).rejects.toBeInstanceOf(NotFoundException);
		await expect(
			service.decideReview(admin, postId, PostStatus.REJECTED),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it('rejects insufficient persisted content without writing', async () => {
		first.mockResolvedValue({ ...draft, content: ' \n ' });
		await expect(service.submitDraft(actor, postId)).rejects.toBeInstanceOf(
			BadRequestException,
		);
		expect(updateAll).not.toHaveBeenCalled();
	});

	it('reports a conflict when the validated version changed before submission', async () => {
		first.mockResolvedValue(draft);
		updateAll.mockResolvedValue([]);
		await expect(service.submitDraft(actor, postId)).rejects.toBeInstanceOf(
			ConflictException,
		);
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

	it('queries only the requested page of the authenticated author’s drafts', async () => {
		await expect(service.listDrafts(actor, 3, 10)).resolves.toEqual([
			draft,
		]);
		expect(where).toHaveBeenCalledWith({
			authorId,
			status: PostStatus.DRAFT,
		});
		expect(offset).toHaveBeenCalledWith(20);
		expect(limit).toHaveBeenCalledWith(10);
	});

	it('rejects pages whose offset cannot be represented as a safe integer', async () => {
		await expect(
			service.listDrafts(actor, Number.MAX_SAFE_INTEGER, 100),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(where).not.toHaveBeenCalled();
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
		updateAll.mockResolvedValue([{ ...draft, title: 'Novo título' }]);

		await expect(
			service.updateDraft(actor, postId, { title: 'Novo título' }),
		).resolves.toMatchObject({ title: 'Novo título' });
		expect(where).toHaveBeenCalledWith({
			id: postId,
			authorId,
			status: PostStatus.DRAFT,
		});
		expect(updateAll).toHaveBeenCalledWith({
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
		await expect(service.listDrafts(actor, 1, 20)).rejects.toBeInstanceOf(
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
		updateAll.mockResolvedValue([]);

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
