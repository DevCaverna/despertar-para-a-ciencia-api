import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
	UnprocessableEntityException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';

import { AiDraftService } from '../ai/application/ai-draft.service.js';
import { AiProviderError } from '../ai/domain/ai-draft-generator.port.js';
import type { AuthUser } from '../auth/domain/auth.types.js';
import { UserRole } from '../auth/domain/user-role.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserService } from '../user/user.service.js';
import { PostStatus } from './domain/post-status.js';
import type { Post } from './domain/post.js';
import type { CreateDraftDto } from './dto/create-draft.dto.js';
import type { ListPublishedPostsQueryDto } from './dto/list-published-posts-query.dto.js';
import type { UpdateDraftDto } from './dto/update-draft.dto.js';
import type { PublishedPostDetailModel } from './models/published-post-detail.model.js';
import type {
	PublishedPostModel,
	PublishedPostPageModel,
} from './models/published-post-page.model.js';

function isExternalWorkUniqueViolation(error: unknown): boolean {
	let current: unknown = error;
	const visited = new Set<unknown>();
	while (
		typeof current === 'object' &&
		current !== null &&
		!visited.has(current)
	) {
		visited.add(current);
		const candidate = current as {
			code?: unknown;
			constraint?: unknown;
			cause?: unknown;
		};
		if (
			candidate.code === '23505' &&
			candidate.constraint === 'post_externalWorkId_key'
		) {
			return true;
		}
		current = candidate.cause;
	}
	return false;
}

@Injectable()
export class PostService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly users: UserService,
		private readonly i18n: I18nService<I18nTranslations>,
		private readonly aiDrafts: AiDraftService,
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
		if (post.status !== 'DRAFT') {
			throw new ConflictException(this.i18n.t('errors.POST_NOT_DRAFT'));
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

		const updated = await this.prisma.database.orm.public.Post.where({
			id,
			authorId: author.id,
			status: PostStatus.DRAFT,
		}).update({
			...(body.title !== undefined ? { title: body.title } : {}),
			...(body.content !== undefined ? { content: body.content } : {}),
			updatedAt: new Date().toISOString(),
		});
		if (!updated) {
			throw new ConflictException(this.i18n.t('errors.POST_NOT_DRAFT'));
		}
		return updated;
	}

	async generateDraftFromWork(
		actor: AuthUser,
		externalWorkId: string,
	): Promise<Post> {
		this.requireEditorRole(actor);
		const author = await this.users.getProfile(actor);

		const work = await this.prisma.database.orm.public.ExternalWork.first({
			id: externalWorkId,
		});
		if (!work) {
			throw new NotFoundException(
				this.i18n.t('errors.NOT_FOUND', {
					args: { entity: 'ExternalWork' },
				}),
			);
		}
		if (!work.abstract?.trim()) {
			throw new UnprocessableEntityException(
				this.i18n.t('errors.ACADEMIC_WORK_ABSTRACT_REQUIRED'),
			);
		}

		const existing = await this.prisma.database.orm.public.Post.first({
			externalWorkId: work.id,
		});
		if (existing) {
			throw new ConflictException(
				this.i18n.t('errors.POST_ALREADY_EXISTS_FOR_WORK'),
			);
		}

		let generated: { title: string; content: string };
		try {
			generated = await this.aiDrafts.generateDraft({
				title: work.title,
				authors: [...work.authors],
				abstract: work.abstract,
				publicationDate: work.publicationDate,
				journal: work.journal,
				doi: work.doi,
				url: work.url,
			});
		} catch (error) {
			if (error instanceof AiProviderError) {
				if (error.code === 'invalid-input') {
					throw new UnprocessableEntityException(
						this.i18n.t('errors.ACADEMIC_WORK_ABSTRACT_REQUIRED'),
					);
				}
				throw new ServiceUnavailableException(
					this.i18n.t('errors.AI_DRAFT_GENERATION_UNAVAILABLE'),
				);
			}
			throw error;
		}

		try {
			return await this.prisma.database.orm.public.Post.create({
				authorId: author.id,
				externalWorkId: work.id,
				title: generated.title,
				content: generated.content,
				status: PostStatus.DRAFT,
			});
		} catch (error) {
			if (isExternalWorkUniqueViolation(error)) {
				throw new ConflictException(
					this.i18n.t('errors.POST_ALREADY_EXISTS_FOR_WORK'),
				);
			}
			throw error;
		}
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
