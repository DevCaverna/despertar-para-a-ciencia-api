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

export class ReviewExternalWorkModel {
	@ApiProperty({ format: 'uuid' })
	id!: string;

	@ApiProperty()
	title!: string;

	@ApiProperty({ type: [String] })
	authors!: readonly string[];

	@ApiProperty({ type: String, nullable: true })
	journal!: string | null;

	@ApiProperty({
		type: String,
		nullable: true,
		description: 'Date in YYYY, YYYY-MM, or YYYY-MM-DD format.',
	})
	publicationDate!: string | null;

	@ApiProperty({ type: String, nullable: true })
	abstract!: string | null;

	@ApiProperty()
	doi!: string;

	@ApiProperty({ type: String, nullable: true })
	url!: string | null;
}

export class ReviewQueueDetailModel extends ReviewQueueItemModel {
	@ApiProperty({ type: ReviewExternalWorkModel, nullable: true })
	externalWork!: ReviewExternalWorkModel | null;

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
