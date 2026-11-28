import { ApiProperty } from '@nestjs/swagger';

import { PublishedPostModel } from './published-post-page.model.js';

export class AcademicSourceModel {
	@ApiProperty({ example: 'A study on scientific communication' })
	title!: string;

	@ApiProperty({ nullable: true, type: String, example: 'Nature' })
	journal!: string | null;

	@ApiProperty({ example: '10.1038/example' })
	doi!: string;

	@ApiProperty({ nullable: true, type: String, format: 'uri' })
	url!: string | null;
}

export class PublishedPostDetailModel extends PublishedPostModel {
	@ApiProperty({ example: 'Conteúdo completo da publicação.' })
	content!: string;

	@ApiProperty({ type: AcademicSourceModel, nullable: true })
	academicSource!: AcademicSourceModel | null;
}
