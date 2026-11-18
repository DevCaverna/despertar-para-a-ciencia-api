import { ApiProperty } from '@nestjs/swagger';

export class PublicPostAuthorModel {
	@ApiProperty({ format: 'uuid' })
	id!: string;

	@ApiProperty()
	name!: string;
}

export class PublishedPostModel {
	@ApiProperty({ format: 'uuid' })
	id!: string;

	@ApiProperty()
	title!: string;

	@ApiProperty({ format: 'date-time' })
	publishedAt!: string;

	@ApiProperty({ type: PublicPostAuthorModel, nullable: true })
	author!: PublicPostAuthorModel | null;
}

export class PublishedPostPageModel {
	@ApiProperty({ type: [PublishedPostModel] })
	items!: PublishedPostModel[];

	@ApiProperty({ type: 'integer', minimum: 1, example: 1 })
	page!: number;

	@ApiProperty({ type: 'integer', minimum: 1, maximum: 100, example: 20 })
	perPage!: number;

	@ApiProperty({ example: false })
	hasNextPage!: boolean;
}
