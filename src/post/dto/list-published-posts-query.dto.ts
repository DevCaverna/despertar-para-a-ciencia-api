import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class ListPublishedPostsQueryDto {
	@ApiPropertyOptional({
		default: 1,
		minimum: 1,
		maximum: Number.MAX_SAFE_INTEGER,
		description:
			'The computed offset (page - 1) * perPage must also be a safe integer.',
		type: 'integer',
	})
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(Number.MAX_SAFE_INTEGER)
	page = 1;

	@ApiPropertyOptional({
		default: 20,
		minimum: 1,
		maximum: 100,
		type: 'integer',
	})
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	perPage = 20;
}
