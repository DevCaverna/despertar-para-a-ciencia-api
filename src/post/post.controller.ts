import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
} from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiConflictResponse,
	ApiCreatedResponse,
	ApiForbiddenResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiParam,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthUser } from '../auth/domain/auth.types.js';
import { UserRole } from '../auth/domain/user-role.js';
import { Actor } from '../decorators/actor.decorator.js';
import { Roles } from '../decorators/roles.decorator.js';
import type { Post as PostEntity } from './domain/post.js';
import { CreateDraftDto } from './dto/create-draft.dto.js';
import { ListDraftsQueryDto } from './dto/list-drafts-query.dto.js';
import { UpdateDraftDto } from './dto/update-draft.dto.js';
import {
	ReviewQueueDetailModel,
	ReviewQueuePageModel,
	SubmittedDraftModel,
} from './models/post-review.model.js';
import { PostModel } from './models/post.model.js';
import { PostService } from './post.service.js';

@ApiTags('Posts')
@ApiBearerAuth('firebase-auth')
@Controller('posts')
export class PostController {
	constructor(private readonly posts: PostService) {}

	@Post()
	@Roles(UserRole.COLLABORATOR, UserRole.ADMIN)
	@ApiOperation({ summary: 'Create a draft post' })
	@ApiCreatedResponse({ type: PostModel })
	createDraft(
		@Actor() actor: AuthUser,
		@Body() body: CreateDraftDto,
	): Promise<PostEntity> {
		return this.posts.createDraft(actor, body);
	}

	@Get('drafts')
	@Roles(UserRole.COLLABORATOR, UserRole.ADMIN)
	@ApiOperation({ summary: 'List drafts owned by the authenticated author' })
	@ApiOkResponse({ type: PostModel, isArray: true })
	listDrafts(
		@Actor() actor: AuthUser,
		@Query() query: ListDraftsQueryDto,
	): Promise<PostEntity[]> {
		return this.posts.listDrafts(actor, query.page, query.perPage);
	}

	@Get('drafts/:id')
	@Roles(UserRole.COLLABORATOR, UserRole.ADMIN)
	@ApiOperation({
		summary: 'Get an owned draft post',
		description: 'Requires the COLLABORATOR or ADMIN role and ownership.',
	})
	@ApiParam({
		name: 'id',
		description: 'Post UUIDv7',
		schema: { type: 'string', format: 'uuid' },
	})
	@ApiOkResponse({ type: PostModel })
	@ApiBadRequestResponse({ description: 'Invalid UUIDv7.' })
	@ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
	@ApiForbiddenResponse({
		description:
			'Insufficient role, inactive profile, or another author’s post.',
	})
	@ApiNotFoundResponse({ description: 'Post not found.' })
	@ApiConflictResponse({ description: 'The owned post is not a draft.' })
	getDraft(
		@Actor() actor: AuthUser,
		@Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
	): Promise<PostEntity> {
		return this.posts.getDraft(actor, id);
	}

	@Post('drafts/:id/submit')
	@Roles(UserRole.COLLABORATOR, UserRole.ADMIN)
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Submit an owned draft for editorial review' })
	@ApiOkResponse({ type: SubmittedDraftModel })
	@ApiBadRequestResponse({
		description: 'Invalid UUIDv7 or empty title or content.',
	})
	@ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
	@ApiForbiddenResponse({
		description:
			'Insufficient role, inactive profile, or another author’s post.',
	})
	@ApiNotFoundResponse({ description: 'Post or local profile not found.' })
	@ApiConflictResponse({
		description: 'Post is not a draft or changed during submission.',
	})
	submitDraft(
		@Actor() actor: AuthUser,
		@Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
	): Promise<SubmittedDraftModel> {
		return this.posts.submitDraft(actor, id);
	}

	@Get('review-queue')
	@Roles(UserRole.ADMIN)
	@ApiOperation({
		summary: 'List posts awaiting editorial review',
		description: 'Ordered by updatedAt ASC, then id ASC.',
	})
	@ApiOkResponse({ type: ReviewQueuePageModel })
	@ApiBadRequestResponse({ description: 'Invalid pagination.' })
	@ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
	@ApiForbiddenResponse({
		description: 'Requires ADMIN and an active profile.',
	})
	listReviewQueue(
		@Actor() actor: AuthUser,
		@Query() query: ListDraftsQueryDto,
	): Promise<ReviewQueuePageModel> {
		return this.posts.listReviewQueue(actor, query.page, query.perPage);
	}

	@Get('review-queue/:id')
	@Roles(UserRole.ADMIN)
	@ApiOperation({
		summary: 'Read the full content of a post awaiting editorial review',
	})
	@ApiOkResponse({ type: ReviewQueueDetailModel })
	@ApiBadRequestResponse({ description: 'Invalid UUIDv7.' })
	@ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
	@ApiForbiddenResponse({
		description: 'Requires ADMIN and an active profile.',
	})
	@ApiNotFoundResponse({
		description:
			'Post is not in the review queue or local profile not found.',
	})
	getReviewQueuePost(
		@Actor() actor: AuthUser,
		@Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
	): Promise<ReviewQueueDetailModel> {
		return this.posts.getReviewQueuePost(actor, id);
	}

	@Patch(':id')
	@Roles(UserRole.COLLABORATOR, UserRole.ADMIN)
	@ApiOperation({ summary: 'Update an owned draft post' })
	@ApiOkResponse({ type: PostModel })
	updateDraft(
		@Actor() actor: AuthUser,
		@Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
		@Body() body: UpdateDraftDto,
	): Promise<PostEntity> {
		return this.posts.updateDraft(actor, id, body);
	}
}
