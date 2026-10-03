import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';

import type { AuthUser } from '../auth/domain/auth.types.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserService } from '../user/user.service.js';
import { PostStatus } from './domain/post-status.js';
import type { Post } from './domain/post.js';
import type { CreateDraftDto } from './dto/create-draft.dto.js';
import type { UpdateDraftDto } from './dto/update-draft.dto.js';

@Injectable()
export class PostService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly users: UserService,
		private readonly i18n: I18nService<I18nTranslations>,
	) {}

	async createDraft(actor: AuthUser, body: CreateDraftDto): Promise<Post> {
		const author = await this.users.getProfile(actor);
		return this.prisma.database.orm.public.Post.create({
			authorId: author.id,
			title: body.title,
			content: body.content,
			status: PostStatus.DRAFT,
		});
	}

	async updateDraft(
		actor: AuthUser,
		id: string,
		body: UpdateDraftDto,
	): Promise<Post> {
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
}
