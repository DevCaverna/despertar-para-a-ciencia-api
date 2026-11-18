import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncAcademicWorksResponseDto {
	@ApiProperty({
		type: 'integer',
		description: 'Normalized candidates found',
	})
	found!: number;

	@ApiProperty({ type: 'integer', description: 'New works inserted' })
	imported!: number;

	@ApiProperty({
		type: 'integer',
		description: 'Candidates skipped because of duplicate DOIs',
	})
	ignored!: number;

	@ApiPropertyOptional({
		type: String,
		description:
			'Cursor for the next synchronization with the same filters',
	})
	nextCursor?: string;
}
