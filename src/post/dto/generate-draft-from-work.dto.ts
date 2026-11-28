import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

import type { I18nTranslations } from '../../generated/i18n.generated.js';

export class GenerateDraftFromWorkDto {
	@ApiProperty({
		format: 'uuid',
		description: 'ExternalWork UUIDv7',
		example: '019abcde-f000-7000-8000-000000000001',
	})
	@IsUUID('7', {
		message: i18nValidationMessage<I18nTranslations>('validation.IS_UUID'),
	})
	externalWorkId!: string;
}
