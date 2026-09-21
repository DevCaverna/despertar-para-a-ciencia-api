import {
	BadGatewayException,
	Inject,
	Injectable,
	Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';

import type { AppConfig } from '../../config/config.types.js';
import type { I18nTranslations } from '../../generated/i18n.generated.js';
import { errorType } from '../../telemetry/telemetry.js';
import {
	EmailTemplate,
	TemplateParamsMap,
} from '../domain/email-template.enum.js';
import { MAIL_PORT, type MailPort } from '../domain/mail.port.js';

@Injectable()
export class MailService {
	private readonly logger = new Logger(MailService.name);
	private readonly canSendEmails: boolean;

	constructor(
		@Inject(MAIL_PORT) private readonly mail: MailPort,
		private readonly i18n: I18nService<I18nTranslations>,
		config: ConfigService<AppConfig, true>,
	) {
		this.canSendEmails = config.getOrThrow('mail.sendEmails', {
			infer: true,
		});
	}

	async sendTemplateEmail<T extends EmailTemplate>({
		emailTemplate,
		subject,
		to,
		params,
		sender = this.mail.getSender(),
	}: {
		emailTemplate: T;
		subject?: string;
		to: { email: string; name?: string }[];
		params: TemplateParamsMap[T];
		sender?: {
			email: string;
			name?: string;
		};
	}): Promise<void> {
		if (!this.canSendEmails) {
			this.logger.debug(
				'Email not sent because SEND_EMAILS is disabled.',
			);
			return;
		}

		try {
			await this.mail.sendTemplateEmail({
				emailTemplate,
				subject,
				to,
				params,
				sender,
			});
		} catch (error) {
			this.logSendFailure({
				operation: 'template',
				recipientCount: to.length,
				template: emailTemplate,
				error,
			});

			throw new BadGatewayException(
				this.i18n.t('errors.ERROR_SENDING_EMAIL'),
			);
		}
	}

	async sendTextEmail({
		to,
		subject,
		textContent,
		sender = this.mail.getSender(),
	}: {
		to: { email: string; name?: string }[];
		subject: string;
		textContent: string;
		sender?: {
			email: string;
			name?: string;
		};
	}): Promise<void> {
		if (!this.canSendEmails) {
			this.logger.debug(
				'Email not sent because SEND_EMAILS is disabled.',
			);
			return;
		}

		try {
			await this.mail.sendTextEmail({ to, subject, textContent, sender });
		} catch (error) {
			this.logSendFailure({
				operation: 'text',
				recipientCount: to.length,
				error,
			});

			throw new BadGatewayException(
				this.i18n.t('errors.ERROR_SENDING_EMAIL'),
			);
		}
	}

	async sendHtmlEmail({
		to,
		subject,
		htmlContent,
		sender = this.mail.getSender(),
	}: {
		to: { email: string; name?: string }[];
		subject: string;
		htmlContent: string;
		sender?: {
			email: string;
			name?: string;
		};
	}): Promise<void> {
		if (!this.canSendEmails) {
			this.logger.debug(
				'Email not sent because SEND_EMAILS is disabled.',
			);
			return;
		}

		try {
			await this.mail.sendHtmlEmail({ to, subject, htmlContent, sender });
		} catch (error) {
			this.logSendFailure({
				operation: 'html',
				recipientCount: to.length,
				error,
			});

			throw new BadGatewayException(
				this.i18n.t('errors.ERROR_SENDING_EMAIL'),
			);
		}
	}

	private logSendFailure({
		operation,
		recipientCount,
		template,
		error,
	}: {
		operation: 'template' | 'text' | 'html';
		recipientCount: number;
		template?: EmailTemplate;
		error: unknown;
	}): void {
		this.logger.error({
			event: 'email_send_failed',
			'mail.operation': operation,
			'mail.recipient_count': recipientCount,
			...(template === undefined ? {} : { template }),
			'error.type': errorType(error),
		});
	}
}
