import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiParam,
	ApiTags,
} from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator.js';
import { ListPublishedPostsQueryDto } from './dto/list-published-posts-query.dto.js';
import { PublishedPostDetailModel } from './models/published-post-detail.model.js';
import { PublishedPostPageModel } from './models/published-post-page.model.js';
import { PostService } from './post.service.js';

@ApiTags('Posts')
@Controller('posts')
export class PublicPostController {
	constructor(private readonly posts: PostService) {}

	@Get()
	@Public()
	@ApiOperation({
		summary: 'List published posts',
		description:
			'Public access without authentication. Ordered by publishedAt DESC, then id DESC. Published posts without a publication date are omitted. Full content is not included.',
	})
	@ApiOkResponse({
		type: PublishedPostPageModel,
		example: {
			items: [
				{
					id: '019abcde-f000-7000-8000-000000000002',
					title: 'Exemplo de título',
					publishedAt: '2026-11-18T12:00:00.000Z',
					author: {
						id: '019abcde-f000-7000-8000-000000000001',
						name: 'Exemplo de autor',
					},
				},
			],
			page: 1,
			perPage: 20,
			hasNextPage: false,
		},
	})
	@ApiBadRequestResponse({
		description: 'Invalid pagination or unknown query parameters.',
	})
	listPublished(
		@Query() query: ListPublishedPostsQueryDto,
	): Promise<PublishedPostPageModel> {
		return this.posts.listPublished(query);
	}

	@Get(':id')
	@Public()
	@ApiOperation({
		summary: 'Read a published post',
		description:
			'Public access without authentication. Returns the full content of a published post with a publication date.',
	})
	@ApiParam({
		name: 'id',
		description: 'Post UUIDv7',
		schema: { type: 'string', format: 'uuid' },
	})
	@ApiOkResponse({ type: PublishedPostDetailModel })
	@ApiBadRequestResponse({ description: 'Invalid UUIDv7.' })
	@ApiNotFoundResponse({
		description: 'Post does not exist or is not publicly available.',
	})
	getPublished(
		@Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
	): Promise<PublishedPostDetailModel> {
		return this.posts.getPublished(id);
	}
}
