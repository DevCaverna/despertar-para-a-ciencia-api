import { ApiProperty } from '@nestjs/swagger';

export class AcademicSourceModel {
	@ApiProperty({ format: 'uuid' })
	id!: string;

	@ApiProperty()
	name!: string;

	@ApiProperty()
	issn!: string;
}

export class AcademicWorkModel {
	@ApiProperty({ format: 'uuid' })
	id!: string;

	@ApiProperty()
	doi!: string;

	@ApiProperty()
	title!: string;

	@ApiProperty({ type: [String] })
	authors!: string[];

	@ApiProperty({ type: String, nullable: true })
	abstract!: string | null;

	@ApiProperty({
		type: String,
		nullable: true,
		description:
			'Partial ISO date may contain only a year or year and month.',
	})
	publicationDate!: string | null;

	@ApiProperty({ type: String, nullable: true })
	journal!: string | null;

	@ApiProperty({ type: String, nullable: true })
	url!: string | null;

	@ApiProperty({ type: AcademicSourceModel })
	source!: AcademicSourceModel;
}

export class AcademicWorkPageModel {
	@ApiProperty({ type: [AcademicWorkModel] })
	items!: AcademicWorkModel[];

	@ApiProperty({ type: 'integer', minimum: 1 })
	page!: number;

	@ApiProperty({ type: 'integer', minimum: 1, maximum: 100 })
	perPage!: number;

	@ApiProperty()
	hasNextPage!: boolean;
}
