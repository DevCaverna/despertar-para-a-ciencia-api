import { ApiProperty } from '@nestjs/swagger';

import { PostStatus } from '../domain/post-status.js';
import { PublicPostAuthorModel } from './published-post-page.model.js';

export class SubmittedDraftModel {
	@ApiProperty({ format: 'uuid' })
	id!: string;

	@ApiProperty({ enum: [PostStatus.PENDING_REVIEW] })
	status!: typeof PostStatus.PENDING_REVIEW;

	@ApiProperty({ format: 'date-time' })
	updatedAt!: string;
}

export class ReviewQueueItemModel extends SubmittedDraftModel {
	@ApiProperty()
	title!: string;

	@ApiProperty({ type: PublicPostAuthorModel, nullable: true })
	author!: PublicPostAuthorModel | null;
}

export class ReviewQueueDetailModel extends ReviewQueueItemModel {
	@ApiProperty()
	content!: string;

	@ApiProperty({ format: 'date-time' })
	createdAt!: string;
}

export class ReviewQueuePageModel {
	@ApiProperty({ type: [ReviewQueueItemModel] })
	items!: ReviewQueueItemModel[];

	@ApiProperty({ type: 'integer', minimum: 1, example: 1 })
	page!: number;

	@ApiProperty({ type: 'integer', minimum: 1, maximum: 100, example: 20 })
	perPage!: number;

	@ApiProperty({ example: false })
	hasNextPage!: boolean;
}
