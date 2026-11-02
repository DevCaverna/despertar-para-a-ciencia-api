import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, ValidateIf } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

import type { I18nTranslations } from '../../generated/i18n.generated.js';

export class UpdateDraftDto {
	@ApiPropertyOptional({ example: 'Novo título' })
	@Transform(({ value }) =>
		typeof value === 'string' ? value.trim() : value,
	)
	@ValidateIf((_object, value) => value !== undefined)
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
	title?: string;

	@ApiPropertyOptional({ example: 'Texto revisado do rascunho.' })
	@ValidateIf((_object, value) => value !== undefined)
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
	content?: string;
}
