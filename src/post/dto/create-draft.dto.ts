import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

import type { I18nTranslations } from '../../generated/i18n.generated.js';

export class CreateDraftDto {
	@ApiProperty({ example: 'A ciência no cotidiano' })
	@Transform(({ value }) =>
		typeof value === 'string' ? value.trim() : value,
	)
	@IsString({
		message: i18nValidationMessage<I18nTranslations>(
			'validation.IS_STRING',
		),
	})
	@IsNotEmpty({
		message: i18nValidationMessage<I18nTranslations>(
			'validation.IS_NOT_EMPTY',
		),
	})
	@Matches(/\S/, {
		message: i18nValidationMessage<I18nTranslations>('validation.MATCHES'),
	})
	title!: string;

	@ApiProperty({ example: 'Texto do rascunho.' })
	@IsString({
		message: i18nValidationMessage<I18nTranslations>(
			'validation.IS_STRING',
		),
	})
	@IsNotEmpty({
		message: i18nValidationMessage<I18nTranslations>(
			'validation.IS_NOT_EMPTY',
		),
	})
	@Matches(/\S/, {
		message: i18nValidationMessage<I18nTranslations>('validation.MATCHES'),
	})
	content!: string;
}
