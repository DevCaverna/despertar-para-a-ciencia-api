import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { createPaginationQueryDto } from './pagination-query.dto.js';

enum ListingStatus {
	ACTIVE = 'active',
	INACTIVE = 'inactive',
}

class ListingFiltersDto {
	@IsOptional()
	@IsEnum(ListingStatus)
	status?: ListingStatus;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	minPrice?: number;
}

const PaginationQueryDto = createPaginationQueryDto(ListingFiltersDto);

const validationPipe = new ValidationPipe({
	transform: true,
	whitelist: true,
	forbidNonWhitelisted: true,
});

describe('createPaginationQueryDto', () => {
	it('transforms and validates nested filter values', async () => {
		const result = await validationPipe.transform(
			{
				page: '2',
				perPage: '20',
				filter: { status: 'active', minPrice: '10' },
			},
			{ type: 'query', metatype: PaginationQueryDto },
		);

		expect(result.page).toBe(2);
		expect(result.perPage).toBe(20);
		expect(result.filter).toBeInstanceOf(ListingFiltersDto);
		expect(result.filter).toEqual({
			status: ListingStatus.ACTIVE,
			minPrice: 10,
		});
	});

	it('rejects invalid nested filter values', async () => {
		await expect(
			validationPipe.transform(
				{ filter: { status: 'unknown', minPrice: '-1' } },
				{ type: 'query', metatype: PaginationQueryDto },
			),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('rejects fields not declared by the filter DTO', async () => {
		await expect(
			validationPipe.transform(
				{ filter: { status: 'active', unexpected: 'value' } },
				{ type: 'query', metatype: PaginationQueryDto },
			),
		).rejects.toBeInstanceOf(BadRequestException);
	});
});
