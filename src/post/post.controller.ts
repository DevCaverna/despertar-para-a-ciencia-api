import {
	Body,
	Controller,
	Get,
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
	ApiServiceUnavailableResponse,
	ApiTags,
	ApiUnauthorizedResponse,
	ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import type { AuthUser } from '../auth/domain/auth.types.js';
import { UserRole } from '../auth/domain/user-role.js';
import { Actor } from '../decorators/actor.decorator.js';
import { Roles } from '../decorators/roles.decorator.js';
import type { Post as PostEntity } from './domain/post.js';
import { CreateDraftDto } from './dto/create-draft.dto.js';
import { GenerateDraftFromWorkDto } from './dto/generate-draft-from-work.dto.js';
import { ListDraftsQueryDto } from './dto/list-drafts-query.dto.js';
import { UpdateDraftDto } from './dto/update-draft.dto.js';
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

	@Post('from-academic-work')
	@Roles(UserRole.COLLABORATOR, UserRole.ADMIN)
	@ApiOperation({
		summary: 'Generate a draft post from an imported academic work',
	})
	@ApiCreatedResponse({ type: PostModel })
	@ApiBadRequestResponse({ description: 'Invalid ExternalWork UUIDv7.' })
	@ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
	@ApiForbiddenResponse({
		description: 'Insufficient role or inactive profile.',
	})
	@ApiNotFoundResponse({ description: 'Academic work not found.' })
	@ApiConflictResponse({
		description: 'A post already exists for this academic work.',
	})
	@ApiUnprocessableEntityResponse({
		description: 'Academic work has no abstract for draft generation.',
	})
	@ApiServiceUnavailableResponse({
		description: 'AI draft generation provider unavailable.',
	})
	generateDraftFromWork(
		@Actor() actor: AuthUser,
		@Body() body: GenerateDraftFromWorkDto,
	): Promise<PostEntity> {
		return this.posts.generateDraftFromWork(actor, body.externalWorkId);
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
