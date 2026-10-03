import {
	Body,
	Controller,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiCreatedResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';

import type { AuthUser } from '../auth/domain/auth.types.js';
import { Actor } from '../decorators/actor.decorator.js';
import type { Post as PostEntity } from './domain/post.js';
import { CreateDraftDto } from './dto/create-draft.dto.js';
import { UpdateDraftDto } from './dto/update-draft.dto.js';
import { PostModel } from './models/post.model.js';
import { PostService } from './post.service.js';

@ApiTags('Posts')
@ApiBearerAuth('firebase-auth')
@Controller('posts')
export class PostController {
	constructor(private readonly posts: PostService) {}

	@Post()
	@ApiOperation({ summary: 'Create a draft post' })
	@ApiCreatedResponse({ type: PostModel })
	createDraft(
		@Actor() actor: AuthUser,
		@Body() body: CreateDraftDto,
	): Promise<PostEntity> {
		return this.posts.createDraft(actor, body);
	}

	@Patch(':id')
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
