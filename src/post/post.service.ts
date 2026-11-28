import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';

import type { AuthUser } from '../auth/domain/auth.types.js';
import { UserRole } from '../auth/domain/user-role.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserService } from '../user/user.service.js';
import {
	assertPostStatusTransition,
	PostStatus,
} from './domain/post-status.js';
import type { Post } from './domain/post.js';
import type { CreateDraftDto } from './dto/create-draft.dto.js';
import type { ListPublishedPostsQueryDto } from './dto/list-published-posts-query.dto.js';
import type { ReviewDecisionDto } from './dto/review-decision.dto.js';
import type { UpdateDraftDto } from './dto/update-draft.dto.js';
import type {
	ReviewQueueDetailModel,
	ReviewQueueItemModel,
	ReviewQueuePageModel,
	SubmittedDraftModel,
} from './models/post-review.model.js';
import type { PublishedPostDetailModel } from './models/published-post-detail.model.js';
import type {
	PublishedPostModel,
	PublishedPostPageModel,
} from './models/published-post-page.model.js';

@Injectable()
export class PostService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly users: UserService,
		private readonly i18n: I18nService<I18nTranslations>,
	) {}

	async listPublished({
		page,
		perPage,
	}: ListPublishedPostsQueryDto): Promise<PublishedPostPageModel> {
		const offset = (page - 1) * perPage;
		if (!Number.isSafeInteger(offset)) {
			throw new BadRequestException(
				'Pagination offset must be a safe integer.',
			);
		}
		const items: PublishedPostModel[] = [];
		for await (const post of this.prisma.database.orm.public.Post.where({
			status: PostStatus.PUBLISHED,
		})
			.where((fields) => fields.publishedAt.isNotNull())
			.orderBy([
				(fields) => fields.publishedAt.desc(),
				(fields) => fields.id.desc(),
			])
			.offset(offset)
			.limit(perPage + 1)
			.select('id', 'title', 'publishedAt')
			.include('author', (author) => author.select('id', 'name'))
			.all()) {
			// The database predicate excludes null dates; keep the public model non-nullable.
			if (post.publishedAt === null) continue;
			items.push({
				id: post.id,
				title: post.title,
				publishedAt: new Date(post.publishedAt).toISOString(),
				author: post.author
					? { id: post.author.id, name: post.author.name }
					: null,
			});
		}
		return {
			items: items.slice(0, perPage),
			page,
			perPage,
			hasNextPage: items.length > perPage,
		};
	}

	async getPublished(id: string): Promise<PublishedPostDetailModel> {
		const post = await this.prisma.database.orm.public.Post.where({
			id,
			status: PostStatus.PUBLISHED,
		})
			.where((fields) => fields.publishedAt.isNotNull())
			.select('id', 'title', 'content', 'publishedAt')
			.include('author', (author) => author.select('id', 'name'))
			.first();

		if (!post || post.publishedAt === null) {
			throw new NotFoundException(
				this.i18n.t('errors.NOT_FOUND', { args: { entity: 'Post' } }),
			);
		}

		return {
			id: post.id,
			title: post.title,
			content: post.content,
			publishedAt: new Date(post.publishedAt).toISOString(),
			author: post.author
				? { id: post.author.id, name: post.author.name }
				: null,
		};
	}

	async createDraft(actor: AuthUser, body: CreateDraftDto): Promise<Post> {
		this.requireEditorRole(actor);
		const author = await this.users.getProfile(actor);
		return this.prisma.database.orm.public.Post.create({
			authorId: author.id,
			title: body.title,
			content: body.content,
			status: PostStatus.DRAFT,
		});
	}

	async listDrafts(
		actor: AuthUser,
		page: number,
		perPage: number,
	): Promise<Post[]> {
		this.requireEditorRole(actor);
		const author = await this.users.getProfile(actor);
		const offset = (page - 1) * perPage;
		if (!Number.isSafeInteger(offset)) {
			throw new BadRequestException(
				this.i18n.t('errors.POST_DRAFT_PAGE_OUT_OF_RANGE'),
			);
		}
		const drafts: Post[] = [];
		for await (const draft of this.prisma.database.orm.public.Post.where({
			authorId: author.id,
			status: PostStatus.DRAFT,
		})
			.orderBy([
				(post) => post.updatedAt.desc(),
				(post) => post.id.desc(),
			])
			.offset(offset)
			.limit(perPage)
			.all()) {
			drafts.push(draft);
		}
		return drafts;
	}

	async getDraft(actor: AuthUser, id: string): Promise<Post> {
		const post = await this.getOwnedPost(actor, id);
		if (post.status !== PostStatus.DRAFT) {
			throw new ConflictException(this.i18n.t('errors.POST_NOT_DRAFT'));
		}
		return post;
	}

	private async getOwnedPost(actor: AuthUser, id: string): Promise<Post> {
		this.requireEditorRole(actor);
		const author = await this.users.getProfile(actor);
		const post = await this.prisma.database.orm.public.Post.first({ id });
		if (!post) {
			throw new NotFoundException(
				this.i18n.t('errors.NOT_FOUND', { args: { entity: 'Post' } }),
			);
		}
		if (post.authorId !== author.id) {
			throw new ForbiddenException(this.i18n.t('errors.FORBIDDEN'));
		}
		return post;
	}

	async updateDraft(
		actor: AuthUser,
		id: string,
		body: UpdateDraftDto,
	): Promise<Post> {
		this.requireEditorRole(actor);
		if (body.title === undefined && body.content === undefined) {
			throw new BadRequestException(
				this.i18n.t('errors.POST_UPDATE_EMPTY'),
			);
		}

		const author = await this.users.getProfile(actor);
		const post = await this.prisma.database.orm.public.Post.first({ id });
		if (!post) {
			throw new NotFoundException(
				this.i18n.t('errors.NOT_FOUND', { args: { entity: 'Post' } }),
			);
		}
		if (post.authorId !== author.id) {
			throw new ForbiddenException(this.i18n.t('errors.FORBIDDEN'));
		}
		if (post.status !== 'DRAFT') {
			throw new ConflictException(this.i18n.t('errors.POST_NOT_DRAFT'));
		}

		const [updated] = await this.prisma.database.orm.public.Post.where({
			id,
			authorId: author.id,
			status: PostStatus.DRAFT,
		}).updateAll({
			...(body.title !== undefined ? { title: body.title } : {}),
			...(body.content !== undefined ? { content: body.content } : {}),
			updatedAt: new Date().toISOString(),
		});
		if (!updated) {
			throw new ConflictException(this.i18n.t('errors.POST_NOT_DRAFT'));
		}
		return updated;
	}

	async submitDraft(
		actor: AuthUser,
		id: string,
	): Promise<SubmittedDraftModel> {
		const draft = await this.getOwnedPost(actor, id);
		if (draft.status !== PostStatus.DRAFT) {
			throw new ConflictException(
				this.i18n.t('errors.POST_SUBMISSION_CONFLICT'),
			);
		}
		if (!draft.title.trim() || !draft.content.trim()) {
			throw new BadRequestException(
				this.i18n.t('errors.POST_SUBMISSION_CONTENT_REQUIRED'),
			);
		}
		const status = PostStatus.PENDING_REVIEW;
		assertPostStatusTransition(draft.status, status);
		const [updated] = await this.prisma.database.orm.public.Post.where({
			id,
			authorId: draft.authorId,
			status: PostStatus.DRAFT,
			title: draft.title,
			content: draft.content,
		}).updateAll({ status, updatedAt: new Date().toISOString() });
		if (!updated) {
			throw new ConflictException(
				this.i18n.t('errors.POST_SUBMISSION_CONFLICT'),
			);
		}
		return { id: updated.id, status, updatedAt: updated.updatedAt };
	}

	async listReviewQueue(
		actor: AuthUser,
		page: number,
		perPage: number,
	): Promise<ReviewQueuePageModel> {
		await this.requireReviewer(actor);
		const offset = (page - 1) * perPage;
		if (!Number.isSafeInteger(offset)) {
			throw new BadRequestException(
				this.i18n.t('errors.POST_REVIEW_PAGE_OUT_OF_RANGE'),
			);
		}
		const status = PostStatus.PENDING_REVIEW;
		const items: ReviewQueueItemModel[] = [];
		for await (const post of this.prisma.database.orm.public.Post.where({
			status,
		})
			.orderBy([
				(fields) => fields.updatedAt.asc(),
				(fields) => fields.id.asc(),
			])
			.offset(offset)
			.limit(perPage + 1)
			.select('id', 'title', 'updatedAt')
			.include('author', (author) => author.select('id', 'name'))
			.all()) {
			items.push({ ...post, status });
		}
		return {
			items: items.slice(0, perPage),
			page,
			perPage,
			hasNextPage: items.length > perPage,
		};
	}

	async getReviewQueuePost(
		actor: AuthUser,
		id: string,
	): Promise<ReviewQueueDetailModel> {
		await this.requireReviewer(actor);
		const status = PostStatus.PENDING_REVIEW;
		const { Post, ExternalWork } = this.prisma.database.orm.public;
		const post = await Post.where({ id, status })
			.include('author', (author) => author.select('id', 'name'))
			.first();
		if (!post) {
			throw new NotFoundException(
				this.i18n.t('errors.NOT_FOUND', { args: { entity: 'Post' } }),
			);
		}

		// The academic draft contract adds the link. Earlier contracts omit the field.
		const externalWorkId =
			'externalWorkId' in post && typeof post.externalWorkId === 'string'
				? post.externalWorkId
				: null;
		const externalWork = externalWorkId
			? await ExternalWork.where({ id: externalWorkId })
					.select(
						'id',
						'title',
						'authors',
						'journal',
						'publicationDate',
						'abstract',
						'doi',
						'url',
					)
					.first()
			: null;

		return {
			id: post.id,
			title: post.title,
			content: post.content,
			createdAt: post.createdAt,
			updatedAt: post.updatedAt,
			author: post.author,
			status,
			externalWork,
		};
	}

	async decideReview(
		actor: AuthUser,
		id: string,
		status: ReviewDecisionDto['status'],
	): Promise<Post> {
		await this.requireReviewer(actor);
		assertPostStatusTransition(PostStatus.PENDING_REVIEW, status);

		const posts = this.prisma.database.orm.public.Post;
		const updatedAt = new Date().toISOString();
		// updateAll keeps the status predicate in the UPDATE statement.
		const [updated] = await posts
			.where({
				id,
				status: PostStatus.PENDING_REVIEW,
			})
			.updateAll({
				status,
				publishedAt: status === PostStatus.PUBLISHED ? updatedAt : null,
				updatedAt,
			});
		if (updated) return updated;

		if (!(await posts.first({ id }))) {
			throw new NotFoundException(
				this.i18n.t('errors.NOT_FOUND', { args: { entity: 'Post' } }),
			);
		}
		throw new ConflictException(
			this.i18n.t('errors.POST_REVIEW_DECISION_CONFLICT'),
		);
	}

	private async requireReviewer(actor: AuthUser): Promise<void> {
		if (!actor.roles.includes(UserRole.ADMIN)) {
			throw new ForbiddenException(this.i18n.t('errors.FORBIDDEN'));
		}
		await this.users.getProfile(actor);
	}

	private requireEditorRole(actor: AuthUser): void {
		if (
			!actor.roles.includes(UserRole.COLLABORATOR) &&
			!actor.roles.includes(UserRole.ADMIN)
		) {
			throw new ForbiddenException(this.i18n.t('errors.FORBIDDEN'));
		}
	}
}
