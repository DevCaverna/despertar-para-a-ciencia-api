import { ApiProperty } from '@nestjs/swagger';

import { PublishedPostModel } from './published-post-page.model.js';

export class PublishedPostDetailModel extends PublishedPostModel {
	@ApiProperty({ example: 'Conteúdo completo da publicação.' })
	content!: string;
}
