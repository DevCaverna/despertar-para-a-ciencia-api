import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsInt,
	IsObject,
	IsOptional,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';

export type DtoClass<T extends object> = new (...args: never[]) => T;
export type PaginationQuery<TFilter extends object> = {
	page: number;
	perPage: number;
	filter?: TFilter;
};

export function createPaginationQueryDto<TFilter extends object>(
	filterDto: DtoClass<TFilter>,
): DtoClass<PaginationQuery<TFilter>> {
	class PaginationQueryDto {
		@ApiPropertyOptional({ default: 1 })
		@Type(() => Number)
		@IsInt()
		@Min(1)
		page = 1;

		@ApiPropertyOptional({ default: 10, maximum: 100 })
		@Type(() => Number)
		@IsInt()
		@Min(1)
		@Max(100)
		perPage = 10;

		@ApiPropertyOptional({ type: filterDto })
		@IsOptional()
		@IsObject()
		@ValidateNested()
		@Type(() => filterDto)
		filter?: TFilter;
	}

	return PaginationQueryDto;
}
