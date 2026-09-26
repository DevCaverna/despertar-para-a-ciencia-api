import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsEmail,
	IsNotEmpty,
	IsString,
	Length,
	Matches,
	MaxLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

import type { I18nTranslations } from '../../generated/i18n.generated.js';

export class CreateProfileDto {
	@ApiProperty({ example: 'Ada Lovelace' })
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
	@MaxLength(160, {
		message: i18nValidationMessage<I18nTranslations>(
			'validation.MAX_LENGTH',
		),
	})
	name!: string;

	@ApiProperty({ example: 'ada@example.com' })
	@Transform(({ value }) =>
		typeof value === 'string' ? value.trim().toLowerCase() : value,
	)
	@IsEmail(
		{},
		{
			message: i18nValidationMessage<I18nTranslations>(
				'validation.IS_EMAIL',
			),
		},
	)
	email!: string;

	@ApiProperty({ example: '123456' })
	@Matches(/^\d+$/, {
		message: i18nValidationMessage<I18nTranslations>(
			'validation.IS_NUMBER_STRING',
		),
	})
	@Length(6, 6, {
		message: i18nValidationMessage<I18nTranslations>('validation.LENGTH'),
	})
	code!: string;
}
