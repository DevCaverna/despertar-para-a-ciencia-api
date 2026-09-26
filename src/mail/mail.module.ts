import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/config.types.js';
import { MailService } from './application/mail.service.js';
import { MAIL_PORT } from './domain/mail.port.js';
import { BrevoAdapter } from './infrastructure/brevo.adapter.js';
import { LocalCaptureMailAdapter } from './infrastructure/local-capture.adapter.js';
import { NoopMailAdapter } from './infrastructure/noop-mail.adapter.js';

@Module({
	providers: [
		{
			provide: MAIL_PORT,
			inject: [ConfigService],
			useFactory: (config: ConfigService<AppConfig, true>) => {
				const mailDriver = config.getOrThrow('mail.driver', {
					infer: true,
				});

				if (mailDriver === 'brevo') {
					return new BrevoAdapter(
						config.getOrThrow('mail.brevo', { infer: true }),
					);
				}
				if (mailDriver === 'local-capture') {
					return new LocalCaptureMailAdapter();
				}
				if (mailDriver === 'noop') return new NoopMailAdapter();

				throw new Error(
					'MAIL_DRIVER must be "brevo", "noop" or "local-capture".',
				);
			},
		},
		MailService,
	],
	imports: [ConfigModule],
	exports: [MailService],
})
export class MailModule {}
