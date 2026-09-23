import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

import type { I18nTranslations } from '../../generated/i18n.generated.js';

export class SendEmailVerificationCodeDto {
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
}
