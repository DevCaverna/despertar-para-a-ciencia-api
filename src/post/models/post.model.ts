import { ApiProperty } from '@nestjs/swagger';

import { PostStatus } from '../domain/post-status.js';
import type { Post } from '../domain/post.js';

export class PostModel implements Post {
	@ApiProperty({ format: 'uuid' })
	id!: string;

	@ApiProperty({ format: 'uuid' })
	authorId!: string;

	@ApiProperty()
	title!: string;

	@ApiProperty()
	content!: string;

	@ApiProperty({ enum: PostStatus })
	status!: PostStatus;

	@ApiProperty({ nullable: true, type: String })
	rejectionReason!: string | null;

	@ApiProperty({ nullable: true, format: 'date-time', type: String })
	publishedAt!: string | null;

	@ApiProperty({ format: 'date-time' })
	createdAt!: string;

	@ApiProperty({ format: 'date-time' })
	updatedAt!: string;
}
