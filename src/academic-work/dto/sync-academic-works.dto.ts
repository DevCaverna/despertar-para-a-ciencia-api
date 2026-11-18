import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsBoolean,
	IsDateString,
	IsOptional,
	IsString,
	Matches,
	MaxLength,
} from 'class-validator';

export class SyncAcademicWorksDto {
	@ApiProperty({ example: '1234-567X' })
	@Transform(({ value }) =>
		typeof value === 'string' ? value.trim().toUpperCase() : value,
	)
	@Matches(/^\d{4}-?\d{3}[\dX]$/)
	issn!: string;

	@ApiProperty({ example: 'Journal of Science' })
	@Transform(({ value }) =>
		typeof value === 'string' ? value.trim() : value,
	)
	@IsString()
	@Matches(/\S/)
	@MaxLength(160)
	name!: string;

	@ApiPropertyOptional({ example: '2025-01-01' })
	@IsOptional()
	@IsDateString()
	@Matches(/^\d{4}-\d{2}-\d{2}$/)
	fromDate?: string;

	@ApiPropertyOptional({ example: '2025-12-31' })
	@IsOptional()
	@IsDateString()
	@Matches(/^\d{4}-\d{2}-\d{2}$/)
	untilDate?: string;

	@ApiPropertyOptional({ default: false })
	@IsOptional()
	@IsBoolean()
	requireAbstract?: boolean;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@MaxLength(2048)
	cursor?: string;
}
